// ponytail: imports the whole Babylon barrel; switch to deep imports if the download size matters.
import '@babylonjs/loaders/glTF';
import {
  ArcRotateCamera, AssetContainer, BackgroundMaterial, Color3, Color4, DirectionalLight, Engine, HDRCubeTexture,
  HemisphericLight, HighlightLayer, LoadAssetContainerAsync, Matrix, Mesh, MeshBuilder, PBRMaterial, PointerEventTypes, Quaternion, Scene, ShadowGenerator,
  TransformNode, Vector3,
} from '@babylonjs/core';
import { BINDING, maxReach, stemFoot, stemPose, surfaceFromPoint, surfacePoint, surfaceRadius, TAU, type Pose, type Vec3 } from './arrange';
import type { Bouquet, ShapeId } from './bouquet';
import type { FlowerType } from './catalog';
import { buildWrap } from './wrap';

export interface SceneApi {
  render(bouquet: Bouquet, selectedId: string | null): void;
  resetView(): void;
  /** Where a flower's head is on the canvas, in pixels from its top-left corner. */
  screenPosition(stemId: string): { x: number; y: number } | null;
  fps(): number;
  onSelect: (stemId: string | null) => void;
  onDragMove: (stemId: string, angle: number, dist: number) => void;
  onDragEnd: () => void;
}

interface FlowerNode {
  root: TransformNode;
  stem: Mesh | null;
  /** True for a loaded model, whose materials are its own copies and are disposed with it. */
  isModel: boolean;
  /** Flower type and colour this node was built for. */
  look: string;
  /** Head position and facing this node was last placed at. */
  placed: string;
}

const BACKGROUND = '#f5f3ef';
const CAMERA_ALPHA = -Math.PI / 2;
const CAMERA_BETA = 0.95;
const STEM_COLOUR = '#4f7a3a';
const CENTRE_COLOUR = '#5a4326';
const PETALS = 8;
const HIGHLIGHT_COLOUR = '#2f6fed';
/** Pixels the mouse may move and still count as a click. */
const CLICK_SLOP = 4;
const SURFACE_RINGS = 12;
const SURFACE_SPOKES = 48;
/** The drag surface is cut into this many wedges. Must divide SURFACE_SPOKES. */
const SURFACE_WEDGES = 12;

const v3 = (p: Vec3) => new Vector3(p.x, p.y, p.z);

export function createScene(canvas: HTMLCanvasElement, catalog: FlowerType[]): SceneApi {
  const engine = new Engine(canvas, true, { stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString(`${BACKGROUND}ff`);

  const camera = new ArcRotateCamera('camera', CAMERA_ALPHA, CAMERA_BETA, 1.5, new Vector3(0, 0.4, 0), scene);
  camera.attachControl(canvas, true, false);
  camera.minZ = 0.01;
  camera.wheelDeltaPercentage = 0.01;
  camera.panningSensibility = 0;
  camera.upperBetaLimit = Math.PI / 2;
  camera.lowerRadiusLimit = 0.4;
  camera.upperRadiusLimit = 6;

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

  const materials = new Map<string, PBRMaterial>();
  function material(hex: string): PBRMaterial {
    let m = materials.get(hex);
    if (!m) {
      m = new PBRMaterial(`colour-${hex}`, scene);
      // Hex colours are sRGB; Babylon's PBR colours are linear.
      m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
      m.metallic = 0;
      m.roughness = 0.6;
      materials.set(hex, m);
    }
    return m;
  }

  /** A stand-in flower head built from basic shapes. Origin is the head centre; local +Y is where it faces. */
  function buildPlaceholder(type: FlowerType, hex: string, stemId: string): TransformNode {
    const root = new TransformNode(`flower-${stemId}`, scene);
    const r = type.headDiameter / 2;
    const centre = MeshBuilder.CreateSphere('centre', { diameter: r * 1.1, segments: 12 }, scene);
    centre.scaling.y = 0.8;
    centre.material = material(CENTRE_COLOUR);
    centre.parent = root;
    for (let i = 0; i < PETALS; i++) {
      const around = (i / PETALS) * TAU;
      const petal = MeshBuilder.CreateSphere('petal', { diameter: r, segments: 10 }, scene);
      petal.scaling = new Vector3(1, 0.55, 0.7);
      petal.position = new Vector3(Math.cos(around) * r * 0.5, 0, Math.sin(around) * r * 0.5);
      petal.rotation.y = -around;
      petal.material = material(hex);
      petal.parent = root;
    }
    for (const mesh of root.getChildMeshes()) {
      mesh.metadata = { stemId };
      shadows.addShadowCaster(mesh);
    }
    return root;
  }

  /** Loaded model per flower id. null means the file failed and the stand-in is used. */
  const models = new Map<string, AssetContainer | null>();
  const loading = new Set<string>();
  let lastRender: { bouquet: Bouquet; selectedId: string | null } | null = null;

  function requestModel(type: FlowerType): void {
    if (!type.model || models.has(type.id) || loading.has(type.id)) return;
    loading.add(type.id);
    LoadAssetContainerAsync(`${import.meta.env.BASE_URL}models/${type.model}`, scene)
      .then((container) => models.set(type.id, container))
      .catch((error) => {
        console.warn(`Could not load the ${type.name} model; using the stand-in flower.`, error);
        models.set(type.id, null);
      })
      .finally(() => {
        loading.delete(type.id);
        if (lastRender) render(lastRender.bouquet, lastRender.selectedId);
      });
  }

  /** A copy of a loaded model, moved and scaled so its head centre is at the origin, facing local +Y. */
  function buildModel(type: FlowerType, hex: string, stemId: string, container: AssetContainer): TransformNode {
    const root = new TransformNode(`flower-${stemId}`, scene);
    const fit = new TransformNode('fit', scene);
    fit.parent = root;
    const scale = type.modelScale ?? 1;
    fit.scaling = new Vector3(scale, scale, scale);
    fit.position.y = -(type.modelHeadY ?? 0) * scale;
    // ponytail: each flower gets its own material copies; share one per colour if 40 stems run slowly.
    // Real copies, not instances: an instance is not drawn unless its source mesh is in the scene, and it shares the
    // source material, so one flower could not be tinted on its own.
    const copy = container.instantiateModelsToScene((name) => `${stemId}-${name}`, true, { doNotInstantiate: true });
    for (const node of copy.rootNodes) node.parent = fit;
    // The copy's skeletons and animations are not children of the root, so free them with it.
    root.onDisposeObservable.add(() => copy.dispose());
    for (const mesh of root.getChildMeshes()) {
      mesh.metadata = { stemId };
      shadows.addShadowCaster(mesh);
      const m = mesh.material;
      if (type.petalMaterial && m instanceof PBRMaterial && m.name.includes(type.petalMaterial)) {
        m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
      }
    }
    return root;
  }

  function buildStem(shape: ShapeId, pose: Pose, stemId: string): Mesh {
    const foot = v3(stemFoot(shape, pose));
    const tube = MeshBuilder.CreateTube(`stem-${stemId}`, { path: [foot, v3(BINDING), v3(pose.head)], radius: 0.004, tessellation: 6 }, scene);
    tube.material = material(STEM_COLOUR);
    tube.isPickable = false;
    shadows.addShadowCaster(tube);
    return tube;
  }

  const nodes = new Map<string, FlowerNode>();
  function disposeNode(node: FlowerNode): void {
    node.root.dispose(false, node.isModel);
    node.stem?.dispose();
  }

  const highlight = new HighlightLayer('highlight', scene);

  let highlighted: TransformNode | null = null;

  function applyHighlight(selectedId: string | null): void {
    const root = (selectedId ? nodes.get(selectedId)?.root : null) ?? null;
    // Only touch the layer when the outlined flower changes: every addMesh leaves a dispose observer on the mesh.
    if (root === highlighted) return;
    highlight.removeAllMeshes();
    highlighted = root;
    if (!root) return;
    for (const mesh of root.getChildMeshes()) highlight.addMesh(mesh as Mesh, Color3.FromHexString(HIGHLIGHT_COLOUR));
  }

  let currentShape: ShapeId = 'round';
  let currentSelected: string | null = null;
  let currentStems: Bouquet['stems'] = [];
  let currentRadius = 0;
  /** Height setting of the flower being dragged; the drag surface is built at that height. */
  let dragHeight = 0;
  let dragSurface: Mesh[] = [];
  let dragSurfaceFor = '';
  let wrapNode: TransformNode | null = null;
  let wrapFor = '';

  /**
   * An invisible copy of the bouquet surface, used only to find where the mouse points during a drag.
   * It is built as separate wedges because Babylon reports one crossing per mesh, and a ray through
   * the dome crosses it twice (near side and far side).
   */
  function updateDragSurface(shape: ShapeId, radius: number, height: number): void {
    const builtFor = `${shape}|${radius.toFixed(4)}|${height.toFixed(3)}`;
    if (builtFor === dragSurfaceFor) return;
    for (const wedge of dragSurface) wedge.dispose();
    dragSurface = [];
    const perWedge = SURFACE_SPOKES / SURFACE_WEDGES;
    for (let wedge = 0; wedge < SURFACE_WEDGES; wedge++) {
      const rings: Vector3[][] = [];
      for (let ring = 0; ring <= SURFACE_RINGS; ring++) {
        const points: Vector3[] = [];
        for (let spoke = wedge * perWedge; spoke <= (wedge + 1) * perWedge; spoke++) {
          const angle = Math.min((spoke / SURFACE_SPOKES) * TAU, TAU - 1e-6);
          points.push(v3(surfacePoint(shape, angle, ring / SURFACE_RINGS, radius, height).head));
        }
        rings.push(points);
      }
      const mesh = MeshBuilder.CreateRibbon('dragSurface', { pathArray: rings, sideOrientation: Mesh.DOUBLESIDE }, scene);
      mesh.isVisible = false;
      dragSurface.push(mesh);
    }
    dragSurfaceFor = builtFor;
  }

  let reach = 0.3;
  let viewWasSet = false;

  /** Size of the bouquet the view was last fitted to. */
  let fittedReach = 0;

  /** Aims at the bouquet and steps back far enough to see it all, keeping the viewing direction. */
  function fitView(alpha = camera.alpha, beta = camera.beta): void {
    // Frame everything from the floor (which drops for a cascading bouquet) to the top of the dome.
    const floor = ground.position.y;
    const top = BINDING.y + reach;
    // Target first: assigning it makes Babylon recompute alpha, beta and radius from the old position.
    camera.target = new Vector3(0, (floor + top) / 2, 0);
    camera.alpha = alpha;
    camera.beta = beta;
    camera.radius = (top - floor) * 1.45 + 0.2;
    fittedReach = reach;
  }

  function resetView(): void {
    fitView(CAMERA_ALPHA, CAMERA_BETA);
    // Stop any spin or zoom still coasting, or it would carry the view away again.
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
  }

  function render(bouquet: Bouquet, selectedId: string | null): void {
    lastRender = { bouquet, selectedId };
    const radius = surfaceRadius(bouquet.stems, catalog);
    const seen = new Set<string>();
    let lowest = 0;

    for (const stem of bouquet.stems) {
      const type = catalog.find((f) => f.id === stem.flower);
      if (!type) continue;
      seen.add(stem.id);
      const hex = type.colours.find((c) => c.id === stem.colour)?.hex ?? type.colours[0].hex;
      requestModel(type);
      const container = models.get(type.id) ?? null;
      const look = `${stem.flower}|${stem.colour}|${container ? 'model' : 'stand-in'}`;

      let node = nodes.get(stem.id);
      if (node && node.look !== look) {
        disposeNode(node);
        node = undefined;
      }
      if (!node) {
        const root = container ? buildModel(type, hex, stem.id, container) : buildPlaceholder(type, hex, stem.id);
        node = { root, stem: null, isModel: container !== null, look, placed: '' };
        nodes.set(stem.id, node);
      }

      const pose = stemPose(bouquet.shape, stem, radius);
      lowest = Math.min(lowest, pose.head.y - type.headDiameter / 2);
      const placed = [pose.head.x, pose.head.y, pose.head.z, pose.face.x, pose.face.y, pose.face.z].map((n) => n.toFixed(5)).join(',');
      if (node.placed !== placed) {
        node.root.position = v3(pose.head);
        node.root.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), v3(pose.face), new Quaternion());
        node.stem?.dispose();
        node.stem = buildStem(bouquet.shape, pose, stem.id);
        node.placed = placed;
      }
    }

    for (const [id, node] of nodes) {
      if (!seen.has(id)) {
        disposeNode(node);
        nodes.delete(id);
      }
    }

    // A cascading bouquet hangs below its stems; lower the floor so nothing sinks into it.
    ground.position.y = lowest - 0.01;
    reach = maxReach(bouquet.shape, radius);
    currentShape = bouquet.shape;
    currentSelected = selectedId;
    currentStems = bouquet.stems;
    currentRadius = radius;
    updateDragSurface(bouquet.shape, radius, dragHeight);
    applyHighlight(selectedId);
    const wrapKey = `${JSON.stringify(bouquet.wrap)}|${bouquet.shape}|${radius.toFixed(4)}`;
    if (wrapKey !== wrapFor) {
      wrapNode?.dispose(false, true);
      wrapNode = buildWrap(scene, bouquet.wrap, bouquet.shape, radius);
      for (const mesh of wrapNode.getChildMeshes()) {
        mesh.metadata = { wrap: true };
        shadows.addShadowCaster(mesh);
      }
      wrapFor = wrapKey;
    }
    if (!viewWasSet) {
      resetView();
      viewWasSet = true;
    } else if (Math.abs(reach - fittedReach) > fittedReach * 0.12) {
      // The bouquet has grown or shrunk enough to leave the frame or get lost in it.
      fitView();
    }
  }

  function screenPosition(stemId: string): { x: number; y: number } | null {
    const node = nodes.get(stemId);
    if (!node) return null;
    const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const p = Vector3.Project(node.root.position, Matrix.Identity(), scene.getTransformMatrix(), viewport);
    return { x: p.x, y: p.y };
  }

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  const api: SceneApi = {
    render,
    resetView,
    screenPosition,
    fps: () => engine.getFps(),
    onSelect: () => {},
    onDragMove: () => {},
    onDragEnd: () => {},
  };

  let press: { x: number; y: number; stemId: string | null; canDrag: boolean; dragging: boolean; wandered: boolean } | null = null;

  function stemUnderPointer(): string | null {
    // The paper and ribbon take part so they hide the flowers behind them; hitting them counts as empty space.
    const hit = scene.pick(scene.pointerX, scene.pointerY, (mesh) => Boolean(mesh.metadata?.stemId || mesh.metadata?.wrap));
    return hit?.hit && hit.pickedMesh ? ((hit.pickedMesh.metadata.stemId as string | undefined) ?? null) : null;
  }

  /** Where the mouse points on the drag surface. The ray can cross the dome twice; take the crossing nearest the flower. */
  function dragPoint(stemId: string): Vector3 | null {
    const from = nodes.get(stemId)?.root.position;
    let best: Vector3 | null = null;
    for (const hit of scene.multiPick(scene.pointerX, scene.pointerY, (mesh) => dragSurface.includes(mesh as Mesh)) ?? []) {
      const at = hit.pickedPoint;
      if (at && (!best || !from || Vector3.DistanceSquared(at, from) < Vector3.DistanceSquared(best, from))) best = at;
    }
    return best;
  }

  scene.onPointerObservable.add((info) => {
    const isLeft = (info.event as PointerEvent).button === 0;
    if (info.type === PointerEventTypes.POINTERDOWN) {
      // Only the left button, and never a second press while one is held.
      if (!isLeft || press) return;
      const stemId = stemUnderPointer();
      const canDrag = stemId !== null && stemId === currentSelected;
      press = { x: scene.pointerX, y: scene.pointerY, stemId, canDrag, dragging: false, wandered: false };
      if (canDrag) {
        camera.detachControl();
        dragHeight = currentStems.find((s) => s.id === stemId)?.height ?? 0;
        updateDragSurface(currentShape, currentRadius, dragHeight);
      }
    } else if (info.type === PointerEventTypes.POINTERMOVE && press) {
      if (Math.hypot(scene.pointerX - press.x, scene.pointerY - press.y) >= CLICK_SLOP) press.wandered = true;
      if (!press.canDrag || !press.stemId || !press.wandered) return;
      press.dragging = true;
      const point = dragPoint(press.stemId);
      if (point) {
        const at = surfaceFromPoint(currentShape, point, currentRadius);
        api.onDragMove(press.stemId, at.angle, at.dist);
      }
    } else if (info.type === PointerEventTypes.POINTERUP && press && isLeft) {
      if (press.canDrag) camera.attachControl(canvas, true, false);
      if (press.dragging) api.onDragEnd();
      else if (!press.wandered) api.onSelect(press.stemId);
      press = null;
    }
  });

  return api;
}
