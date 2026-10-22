// ponytail: imports the whole Babylon barrel; switch to deep imports if the download size matters.
import {
  ArcRotateCamera, BackgroundMaterial, Color3, Color4, DirectionalLight, Engine, HDRCubeTexture, HemisphericLight,
  HighlightLayer, Matrix, Mesh, MeshBuilder, Observer, PointerEventTypes, PointerInfo, Scene, ShadowGenerator,
  Tools, TransformNode, Vector3,
} from '@babylonjs/core';
import { Arranger } from './arrange';
import type { Bouquet } from './bouquet';
import type { Catalog } from './catalog';
import { FlowerFactory, FlowerViews, ModelLibrary, partModel, v3 } from './flowers';
import { PaperTextures } from './paper-textures';
import { BINDING, SHAPE_OF, TAU, type ShapeId } from './shapes';
import { WrapView } from './wrap';

const BACKGROUND = '#f5f3ef';
const CAMERA_ALPHA = -Math.PI / 2;
const CAMERA_BETA = 0.95;
const HIGHLIGHT_COLOUR = '#2f6fed';
/** Pixels the mouse may move and still count as a click. */
const CLICK_SLOP = 4;
const SURFACE_RINGS = 12;
const SURFACE_SPOKES = 48;
/** The drag surface is cut into this many wedges. Must divide SURFACE_SPOKES. */
const SURFACE_WEDGES = 12;

/**
 * An invisible copy of the bouquet surface, used only to find where the mouse points during a drag.
 * It is built as separate wedges because Babylon reports one crossing per mesh, and a ray through
 * the dome crosses it twice (near side and far side).
 */
export class DragSurface {
  private wedges: Mesh[] = [];
  private builtFor = '';

  constructor(private readonly scene: Scene) {}

  get meshes(): readonly Mesh[] {
    return this.wedges;
  }

  update(shape: ShapeId, radius: number, height: number): void {
    const builtFor = `${shape}|${radius.toFixed(4)}|${height.toFixed(3)}`;
    if (builtFor === this.builtFor) return;
    for (const wedge of this.wedges) wedge.dispose();
    this.wedges = [];
    const perWedge = SURFACE_SPOKES / SURFACE_WEDGES;
    for (let wedge = 0; wedge < SURFACE_WEDGES; wedge++) {
      const rings: Vector3[][] = [];
      for (let ring = 0; ring <= SURFACE_RINGS; ring++) {
        const points: Vector3[] = [];
        for (let spoke = wedge * perWedge; spoke <= (wedge + 1) * perWedge; spoke++) {
          const angle = Math.min((spoke / SURFACE_SPOKES) * TAU, TAU - 1e-6);
          points.push(v3(SHAPE_OF[shape].surfacePoint(angle, ring / SURFACE_RINGS, radius, height).head));
        }
        rings.push(points);
      }
      const mesh = MeshBuilder.CreateRibbon('dragSurface', { pathArray: rings, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
      mesh.isVisible = false;
      this.wedges.push(mesh);
    }
    this.builtFor = builtFor;
  }

  /** Where the pointer at (x, y) meets the surface. The ray can cross the dome twice; take the crossing nearest `from`. */
  pick(x: number, y: number, from: Vector3 | undefined): Vector3 | null {
    let best: Vector3 | null = null;
    for (const hit of this.scene.multiPick(x, y, (mesh) => this.wedges.includes(mesh as Mesh)) ?? []) {
      const at = hit.pickedPoint;
      if (at && (!best || !from || Vector3.DistanceSquared(at, from) < Vector3.DistanceSquared(best, from))) best = at;
    }
    return best;
  }

  dispose(): void {
    for (const wedge of this.wedges) wedge.dispose();
    this.wedges = [];
    this.builtFor = '';
  }
}

/** The orbit camera, and how it frames the bouquet. */
export class CameraRig {
  readonly camera: ArcRotateCamera;
  private reach = 0.3;
  private floor = 0;
  private viewWasSet = false;
  /** Size of the bouquet the view was last fitted to. */
  private fittedReach = 0;

  constructor(scene: Scene, private readonly canvas: HTMLCanvasElement) {
    const camera = new ArcRotateCamera('camera', CAMERA_ALPHA, CAMERA_BETA, 1.5, new Vector3(0, 0.4, 0), scene);
    this.camera = camera;
    this.attach();
    camera.minZ = 0.01;
    camera.wheelDeltaPercentage = 0.01;
    camera.panningSensibility = 0;
    camera.upperBetaLimit = Math.PI / 2;
    camera.lowerRadiusLimit = 0.4;
    camera.upperRadiusLimit = 6;
  }

  /** Frames a bouquet of this reach above this floor: fully the first time, then only once its size has changed enough. */
  follow(reach: number, floor: number): void {
    this.reach = reach;
    this.floor = floor;
    if (!this.viewWasSet) {
      this.resetView();
      this.viewWasSet = true;
    } else if (Math.abs(reach - this.fittedReach) > this.fittedReach * 0.12) {
      // The bouquet has grown or shrunk enough to leave the frame or get lost in it.
      this.fit();
    }
  }

  resetView(): void {
    this.fit(CAMERA_ALPHA, CAMERA_BETA);
    // Stop any spin or zoom still coasting, or it would carry the view away again.
    this.camera.inertialAlphaOffset = 0;
    this.camera.inertialBetaOffset = 0;
    this.camera.inertialRadiusOffset = 0;
  }

  attach(): void {
    this.camera.attachControl(this.canvas, true, false);
  }

  detach(): void {
    this.camera.detachControl();
  }

  dispose(): void {
    this.detach();
    this.camera.dispose();
  }

  /** Aims at the bouquet and steps back far enough to see it all, keeping the viewing direction. */
  private fit(alpha = this.camera.alpha, beta = this.camera.beta): void {
    const camera = this.camera;
    // Frame everything from the floor (which drops for a cascading bouquet) to the top of the dome.
    const top = BINDING.y + this.reach;
    // Target first: assigning it makes Babylon recompute alpha, beta and radius from the old position.
    camera.target = new Vector3(0, (this.floor + top) / 2, 0);
    camera.alpha = alpha;
    camera.beta = beta;
    camera.radius = (top - this.floor) * 1.45 + 0.2;
    this.fittedReach = this.reach;
  }
}

interface Press { x: number; y: number; stemId: string | null; canDrag: boolean; dragging: boolean; wandered: boolean }

/** The 3D view of a bouquet: draws it, and reports clicks and drags on its flowers. */
export class BouquetView {
  onSelect: (stemId: string | null) => void = () => {};
  onDragMove: (stemId: string, angle: number, dist: number) => void = () => {};
  onDragEnd: () => void = () => {};

  private readonly arranger: Arranger;
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly rig: CameraRig;
  private readonly ground: Mesh;
  private readonly factory: FlowerFactory;
  private readonly models: ModelLibrary;
  private readonly flowers: FlowerViews;
  private readonly highlight: HighlightLayer;
  private readonly drag: DragSurface;
  private readonly wrap: WrapView;
  private readonly pointerObserver: Observer<PointerInfo>;

  private lastRender: { bouquet: Bouquet; selectedId: string | null } | null = null;
  private highlighted: TransformNode | null = null;
  private currentShape: ShapeId = 'round';
  private currentSelected: string | null = null;
  private currentStems: Bouquet['stems'] = [];
  private currentRadius = 0;
  /** Height setting of the flower being dragged; the drag surface is built at that height. */
  private dragHeight = 0;
  private press: Press | null = null;

  constructor(canvas: HTMLCanvasElement, catalog: Catalog) {
    this.arranger = new Arranger(catalog);
    const engine = new Engine(canvas, true, { stencil: true });
    const scene = new Scene(engine);
    this.engine = engine;
    this.scene = scene;
    scene.clearColor = Color4.FromHexString(`${BACKGROUND}ff`);

    this.rig = new CameraRig(scene, canvas);

    scene.environmentTexture = new HDRCubeTexture(`${import.meta.env.BASE_URL}env/studio.hdr`, scene, 256);
    scene.environmentIntensity = 0.5;
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.2;
    const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.5), scene);
    sun.position = new Vector3(1, 3, -1.5);
    sun.intensity = 0.6;
    const shadows = new ShadowGenerator(1024, sun);
    shadows.useBlurExponentialShadowMap = true;
    shadows.useKernelBlur = true;
    shadows.blurKernel = 48;

    const ground = MeshBuilder.CreateGround('ground', { width: 12, height: 12 }, scene);
    const groundMaterial = new BackgroundMaterial('groundMaterial', scene);
    // Draws only the shadow, so the floor can never differ from the page background.
    groundMaterial.shadowOnly = true;
    groundMaterial.primaryColor = Color3.Black();
    groundMaterial.alpha = 0.25;
    ground.material = groundMaterial;
    ground.receiveShadows = true;
    ground.isPickable = false;
    this.ground = ground;

    this.factory = new FlowerFactory(scene, shadows);
    // A model that finishes loading redraws whatever was last shown, which may be a draft.
    this.models = new ModelLibrary(scene, () => {
      if (this.lastRender) this.render(this.lastRender.bouquet, this.lastRender.selectedId);
    });
    this.flowers = new FlowerViews(this.factory, this.models, catalog, partModel('stem.glb'));
    this.highlight = new HighlightLayer('highlight', scene);
    this.drag = new DragSurface(scene);
    this.wrap = new WrapView(scene, shadows, this.models, new PaperTextures(scene));

    engine.runRenderLoop(this.draw);
    window.addEventListener('resize', this.onResize);
    this.pointerObserver = scene.onPointerObservable.add(this.onPointer);
  }

  render(bouquet: Bouquet, selectedId: string | null): void {
    this.lastRender = { bouquet, selectedId };
    const radius = this.arranger.surfaceRadius(bouquet.stems);
    const lowest = this.flowers.sync(bouquet, radius);

    // A cascading bouquet hangs below its stems; lower the floor so nothing sinks into it.
    this.ground.position.y = lowest - 0.01;
    const reach = SHAPE_OF[bouquet.shape].maxReach(radius);
    this.currentShape = bouquet.shape;
    this.currentSelected = selectedId;
    this.currentStems = bouquet.stems;
    this.currentRadius = radius;
    this.drag.update(bouquet.shape, radius, this.dragHeight);
    this.applyHighlight(selectedId);
    this.wrap.update(bouquet.wrap, bouquet.shape, radius, bouquet.stems.length);
    this.rig.follow(reach, this.ground.position.y);
  }

  resetView(): void {
    this.rig.resetView();
  }

  /** Where a flower's head is on the canvas, in pixels from its top-left corner. */
  screenPosition(stemId: string): { x: number; y: number } | null {
    const root = this.flowers.root(stemId);
    if (!root) return null;
    const viewport = this.rig.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight());
    const p = Vector3.Project(root.position, Matrix.Identity(), this.scene.getTransformMatrix(), viewport);
    return { x: p.x, y: p.y };
  }

  fps(): number {
    return this.engine.getFps();
  }

  /** A PNG data URL of the bouquet as the customer sees it now, for the order and the florist. */
  snapshot(): Promise<string> {
    return Tools.CreateScreenshotAsync(this.engine, this.rig.camera, { width: 800, height: 800 }, 'image/png');
  }

  dispose(): void {
    this.scene.onPointerObservable.remove(this.pointerObserver);
    window.removeEventListener('resize', this.onResize);
    this.engine.stopRenderLoop(this.draw);
    this.rig.detach();
    // Flower copies go before the models they were copied from.
    this.flowers.dispose();
    this.models.dispose();
    this.drag.dispose();
    this.wrap.dispose();
    this.highlight.dispose();
    this.factory.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  private readonly draw = () => this.scene.render();
  private readonly onResize = () => this.engine.resize();

  private applyHighlight(selectedId: string | null): void {
    const root = (selectedId ? this.flowers.root(selectedId) : null) ?? null;
    // Only touch the layer when the outlined flower changes: every addMesh leaves a dispose observer on the mesh.
    if (root === this.highlighted) return;
    this.highlight.removeAllMeshes();
    this.highlighted = root;
    if (!root) return;
    for (const mesh of root.getChildMeshes()) this.highlight.addMesh(mesh as Mesh, Color3.FromHexString(HIGHLIGHT_COLOUR));
  }

  private stemUnderPointer(): string | null {
    // The paper and ribbon take part so they hide the flowers behind them; hitting them counts as empty space.
    const hit = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => Boolean(mesh.metadata?.stemId || mesh.metadata?.wrap));
    return hit?.hit && hit.pickedMesh ? ((hit.pickedMesh.metadata.stemId as string | undefined) ?? null) : null;
  }

  private readonly onPointer = (info: PointerInfo) => {
    const scene = this.scene;
    const isLeft = (info.event as PointerEvent).button === 0;
    if (info.type === PointerEventTypes.POINTERDOWN) {
      // Only the left button, and never a second press while one is held.
      if (!isLeft || this.press) return;
      const stemId = this.stemUnderPointer();
      const canDrag = stemId !== null && stemId === this.currentSelected;
      this.press = { x: scene.pointerX, y: scene.pointerY, stemId, canDrag, dragging: false, wandered: false };
      if (canDrag) {
        this.rig.detach();
        this.dragHeight = this.currentStems.find((s) => s.id === stemId)?.height ?? 0;
        this.drag.update(this.currentShape, this.currentRadius, this.dragHeight);
      }
    } else if (info.type === PointerEventTypes.POINTERMOVE && this.press) {
      const press = this.press;
      if (Math.hypot(scene.pointerX - press.x, scene.pointerY - press.y) >= CLICK_SLOP) press.wandered = true;
      if (!press.canDrag || !press.stemId || !press.wandered) return;
      press.dragging = true;
      const point = this.drag.pick(scene.pointerX, scene.pointerY, this.flowers.root(press.stemId)?.position);
      if (point) {
        const at = SHAPE_OF[this.currentShape].surfaceFromPoint(point, this.currentRadius);
        this.onDragMove(press.stemId, at.angle, at.dist);
      }
    } else if (info.type === PointerEventTypes.POINTERUP && this.press && isLeft) {
      if (this.press.canDrag) this.rig.attach();
      if (this.press.dragging) this.onDragEnd();
      else if (!this.press.wandered) this.onSelect(this.press.stemId);
      this.press = null;
    }
  };
}
