import '@babylonjs/loaders/glTF';
import {
  AssetContainer, Color3, LoadAssetContainerAsync, MeshBuilder, PBRMaterial, Quaternion, Scene, ShadowGenerator,
  TransformNode, Vector3,
} from '@babylonjs/core';
import type { Bouquet } from './bouquet';
import type { Catalog, FlowerType } from './catalog';
import { leafPlans, type LeafItem, type LeafPlan } from './greenery';
import { BINDING, SEPALS_BELOW_HEAD, SHAPE_OF, TAU, type BouquetShape, type Pose, type Vec3 } from './shapes';

const STEM_COLOUR = '#4f7a3a';
const CENTRE_COLOUR = '#5a4326';
const PETALS = 8;
/** Multiplies the leaf texture's colour (1 = as painted); the painted green is lighter than a florist's rose leaf. */
const LEAF_TINT = [0.4, 0.65, 0.3];

export const v3 = (p: Vec3) => new Vector3(p.x, p.y, p.z);

/** What ModelLibrary needs to fetch a model: a flower type, or one of the parts in public/models/parts/. */
export type ModelRef = Pick<FlowerType, 'id' | 'model' | 'name'>;
export const partModel = (file: string): ModelRef => ({ id: `part:${file}`, model: `parts/${file}`, name: file });

/** Thickness of a stem model, in metres per unit of its width: about 6 mm stems under 2 cm sepals. */
const STEM_MODEL_WIDTH = 0.2;

/** Loaded model per flower id, fetched once each. */
export class ModelLibrary {
  /** null means the file failed and the stand-in is used. */
  private readonly models = new Map<string, AssetContainer | null>();
  private readonly loading = new Set<string>();
  private disposed = false;

  /** `onSettled` runs after each load finishes, whether it worked or not. */
  constructor(private readonly scene: Scene, private readonly onSettled: () => void) {}

  request(type: ModelRef): void {
    if (!type.model || this.models.has(type.id) || this.loading.has(type.id)) return;
    this.loading.add(type.id);
    LoadAssetContainerAsync(`${import.meta.env.BASE_URL}models/${type.model}`, this.scene)
      .then((container) => {
        // A load that lands after the view is gone frees itself instead of filling a dead scene.
        if (this.disposed) container.dispose();
        else this.models.set(type.id, container);
      })
      .catch((error) => {
        if (this.disposed) return;
        console.warn(`Could not load the ${type.name} model; using the stand-in flower.`, error);
        this.models.set(type.id, null);
      })
      .finally(() => {
        this.loading.delete(type.id);
        if (!this.disposed) this.onSettled();
      });
  }

  get(flowerId: string): AssetContainer | null {
    return this.models.get(flowerId) ?? null;
  }

  dispose(): void {
    this.disposed = true;
    for (const container of this.models.values()) container?.dispose();
    this.models.clear();
  }
}

/** Builds flower heads and stems, sharing one material per colour and registering every mesh as a shadow caster. */
export class FlowerFactory {
  private readonly materials = new Map<string, PBRMaterial>();

  constructor(private readonly scene: Scene, private readonly shadows: ShadowGenerator) {}

  material(hex: string): PBRMaterial {
    let m = this.materials.get(hex);
    if (!m) {
      m = new PBRMaterial(`colour-${hex}`, this.scene);
      // Hex colours are sRGB; Babylon's PBR colours are linear.
      m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
      m.metallic = 0;
      m.roughness = 0.6;
      this.materials.set(hex, m);
    }
    return m;
  }

  /** A stand-in flower head built from basic shapes. Origin is the head centre; local +Y is where it faces. */
  placeholder(type: FlowerType, hex: string, stemId: string): TransformNode {
    const root = new TransformNode(`flower-${stemId}`, this.scene);
    const r = type.headDiameter / 2;
    const centre = MeshBuilder.CreateSphere('centre', { diameter: r * 1.1, segments: 12 }, this.scene);
    centre.scaling.y = 0.8;
    centre.material = this.material(CENTRE_COLOUR);
    centre.parent = root;
    for (let i = 0; i < PETALS; i++) {
      const around = (i / PETALS) * TAU;
      const petal = MeshBuilder.CreateSphere('petal', { diameter: r, segments: 10 }, this.scene);
      petal.scaling = new Vector3(1, 0.55, 0.7);
      petal.position = new Vector3(Math.cos(around) * r * 0.5, 0, Math.sin(around) * r * 0.5);
      petal.rotation.y = -around;
      petal.material = this.material(hex);
      petal.parent = root;
    }
    for (const mesh of root.getChildMeshes()) {
      mesh.metadata = { stemId };
      this.shadows.addShadowCaster(mesh);
    }
    return root;
  }

  /** A copy of a loaded model, moved and scaled so its head centre is at the origin, facing local +Y. */
  model(type: FlowerType, hex: string, stemId: string, container: AssetContainer): TransformNode {
    const root = new TransformNode(`flower-${stemId}`, this.scene);
    const fit = new TransformNode('fit', this.scene);
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
      this.shadows.addShadowCaster(mesh);
      const m = mesh.material;
      if (type.petalMaterial && m instanceof PBRMaterial && m.name.includes(type.petalMaterial)) {
        m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
      }
    }
    return root;
  }

  /**
   * The stem: a tube for the handle below the tie, and above it the stem model when it has loaded (else the tube goes
   * on to the head). The model shares its loaded material, so disposing the stem never frees anything shared.
   */
  stem(shape: BouquetShape, pose: Pose, stemId: string, headDiameter: number, model: AssetContainer | null, leaves: LeafSet | null = null): TransformNode {
    const root = new TransformNode(`stem-${stemId}`, this.scene);
    const path = model ? [v3(shape.stemFoot(pose)), v3(BINDING)] : [v3(shape.stemFoot(pose)), v3(BINDING), v3(pose.head)];
    const tube = MeshBuilder.CreateTube(`stem-${stemId}`, { path, radius: 0.004, tessellation: 6 }, this.scene);
    tube.material = this.material(STEM_COLOUR);
    tube.parent = root;
    if (model) {
      const length = Math.max(0.01, Vector3.Distance(v3(BINDING), v3(pose.head)) - headDiameter * SEPALS_BELOW_HEAD);
      const fit = new TransformNode('stemFit', this.scene);
      fit.parent = root;
      fit.position = v3(BINDING);
      fit.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), v3(pose.dir), new Quaternion());
      fit.scaling = new Vector3(STEM_MODEL_WIDTH, length, STEM_MODEL_WIDTH);
      const copy = model.instantiateModelsToScene((name) => `stem-${stemId}-${name}`, false, { doNotInstantiate: true });
      for (const node of copy.rootNodes) node.parent = fit;
    }
    leaves?.plans.forEach((plan, i) => this.leaf(root, plan, `${stemId}-leaf${i}`, leaves.model));
    for (const mesh of root.getChildMeshes()) {
      mesh.isPickable = false;
      this.shadows.addShadowCaster(mesh);
    }
    return root;
  }

  /** The leaf model's materials, darkened once: a flat blade facing the light looks washed out otherwise. */
  private readonly tuned = new WeakSet<AssetContainer>();
  private tune(model: AssetContainer): void {
    if (this.tuned.has(model)) return;
    this.tuned.add(model);
    for (const m of model.materials) {
      if (!(m instanceof PBRMaterial)) continue;
      m.albedoColor = Color3.FromArray(LEAF_TINT);
      m.directIntensity = 0.7;
      m.environmentIntensity = 0.6;
    }
  }

  /** A leaf on its stalk, growing out of the stem at `plan.base`. Shares the loaded model's material. */
  private leaf(parent: TransformNode, plan: LeafPlan, name: string, model: AssetContainer): void {
    this.tune(model);
    const fit = new TransformNode(name, this.scene);
    fit.parent = parent;
    fit.position = v3(plan.base);
    // Up the leaf is the stalk's direction; its blade spreads sideways (never up and down), facing up like a leaf that droops.
    const up = v3(plan.dir);
    const across = Vector3.Cross(up, Vector3.Up());
    const side = across.lengthSquared() > 1e-9 ? across.normalize() : new Vector3(1, 0, 0);
    fit.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(side, up, Vector3.Cross(side, up));
    fit.scaling = new Vector3(plan.mirrored ? -plan.length : plan.length, plan.length, plan.length);
    const copy = model.instantiateModelsToScene((n) => `${name}-${n}`, false, { doNotInstantiate: true });
    for (const node of copy.rootNodes) node.parent = fit;
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
  }
}

/** The leaves one stem keeps, and the model they are drawn with. */
export interface LeafSet { plans: LeafPlan[]; model: AssetContainer }

/** One flower in the scene: its head and its stem (with its leaves). */
export class FlowerView {
  readonly root: TransformNode;
  /** True for a loaded model, whose materials are its own copies and are disposed with it. */
  private readonly isModel: boolean;
  private stem: TransformNode | null = null;
  /** Head position and facing this flower was last placed at. */
  private placed = '';
  /** The pose its stem was built for, and whether `swing` has moved it away from that. */
  private built: Pose | null = null;
  private swung = false;

  /** `look` is the flower type and colour this view was built for. */
  constructor(private readonly factory: FlowerFactory, type: FlowerType, hex: string, stemId: string,
    container: AssetContainer | null, readonly look: string) {
    this.isModel = container !== null;
    this.root = container ? factory.model(type, hex, stemId, container) : factory.placeholder(type, hex, stemId);
  }

  place(shape: BouquetShape, pose: Pose, stemId: string, headDiameter: number, stemModel: AssetContainer | null, leaves: LeafSet | null = null): void {
    const leafKey = leaves ? leaves.plans.map((p) => [p.base.x, p.base.y, p.base.z, p.dir.x, p.dir.y, p.dir.z, p.length, p.mirrored ? 1 : 0].map((n) => n.toFixed(5)).join(',')).join(';') : '';
    const placed = [pose.head.x, pose.head.y, pose.head.z, pose.face.x, pose.face.y, pose.face.z].map((n) => n.toFixed(5)).join(',')
      + (stemModel ? '|model' : '|tube') + '|' + leafKey;
    if (this.placed === placed) {
      if (this.swung) this.unswing(pose);
      return;
    }
    this.aim(pose);
    this.stem?.dispose();
    this.stem = this.factory.stem(shape, pose, stemId, headDiameter, stemModel, leaves);
    this.placed = placed;
    this.built = pose;
    this.swung = false;
  }

  /**
   * Moves the flower without rebuilding it, for the physics: every stem pivots at the tie, so the built stem and its
   * leaves are turned about the tie and scaled to the new length. The next `place` puts it right.
   */
  swing(pose: Pose): void {
    if (!this.built || !this.stem) return;
    this.aim(pose);
    const tie = v3(BINDING);
    const turn = Quaternion.FromUnitVectorsToRef(v3(this.built.dir), v3(pose.dir), new Quaternion());
    const scale = Vector3.Distance(v3(pose.head), tie) / Math.max(1e-6, Vector3.Distance(v3(this.built.head), tie));
    this.stem.rotationQuaternion = turn;
    this.stem.scaling.setAll(scale);
    this.stem.position = tie.subtract(tie.applyRotationQuaternion(turn).scale(scale));
    this.swung = true;
  }

  private unswing(pose: Pose): void {
    this.aim(pose);
    this.stem!.rotationQuaternion = Quaternion.Identity();
    this.stem!.scaling.setAll(1);
    this.stem!.position.setAll(0);
    this.swung = false;
  }

  private aim(pose: Pose): void {
    this.root.position = v3(pose.head);
    this.root.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), v3(pose.face), new Quaternion());
  }

  dispose(): void {
    this.root.dispose(false, this.isModel);
    this.stem?.dispose();
  }
}

/** The flowers in the scene, kept in step with a bouquet; only what changed is rebuilt. */
export class FlowerViews {
  private readonly views = new Map<string, FlowerView>();

  /** `stemPart` is the stem model to use and `leafPart` the leaf; without them (as in the tests) stems are plain tubes with no leaves. */
  constructor(private readonly factory: FlowerFactory, private readonly models: ModelLibrary, private readonly catalog: Catalog,
    private readonly stemPart: ModelRef | null = null, private readonly leafPart: ModelRef | null = null) {}

  /** Builds, moves and removes flowers to match the bouquet. Returns the lowest point of any head. */
  sync(bouquet: Bouquet, radius: number): number {
    const seen = new Set<string>();
    let lowest = 0;
    if (this.stemPart) this.models.request(this.stemPart);
    const stemModel = this.stemPart && this.models.get(this.stemPart.id);
    const shape = SHAPE_OF[bouquet.shape];

    // Which stems keep a leaf depends on all of them (a leaf must clear the other heads), so decide it first.
    const level = bouquet.wrap.greenery;
    if (this.leafPart && level !== 'none') this.models.request(this.leafPart);
    const leafModel = this.leafPart && level !== 'none' ? this.models.get(this.leafPart.id) : null;
    const items: LeafItem[] = [];
    for (const stem of bouquet.stems) {
      const type = this.catalog.find(stem.flower);
      if (type) items.push({ id: stem.id, name: type.name, pose: shape.stemPose(stem, radius), headDiameter: type.headDiameter });
    }
    const leaves = new Map<string, LeafPlan[]>();
    if (leafModel) for (const plan of leafPlans(level, shape, radius, items)) leaves.set(plan.stemId, [...(leaves.get(plan.stemId) ?? []), plan]);
    const poses = new Map(items.map((item) => [item.id, item.pose]));

    for (const stem of bouquet.stems) {
      const type = this.catalog.find(stem.flower);
      if (!type) continue;
      seen.add(stem.id);
      const hex = type.colours.find((c) => c.id === stem.colour)?.hex ?? type.colours[0].hex;
      this.models.request(type);
      const container = this.models.get(type.id);
      const look = `${stem.flower}|${stem.colour}|${container ? 'model' : 'stand-in'}`;

      let view = this.views.get(stem.id);
      if (view && view.look !== look) {
        view.dispose();
        view = undefined;
      }
      if (!view) {
        view = new FlowerView(this.factory, type, hex, stem.id, container, look);
        this.views.set(stem.id, view);
      }

      const pose = poses.get(stem.id)!;
      lowest = Math.min(lowest, pose.head.y - type.headDiameter / 2);
      const own = leaves.get(stem.id);
      view.place(shape, pose, stem.id, type.headDiameter, stemModel, leafModel && own ? { plans: own, model: leafModel } : null);
    }

    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        view.dispose();
        this.views.delete(id);
      }
    }
    return lowest;
  }

  root(stemId: string): TransformNode | undefined {
    return this.views.get(stemId)?.root;
  }

  swing(stemId: string, pose: Pose): void {
    this.views.get(stemId)?.swing(pose);
  }

  dispose(): void {
    for (const view of this.views.values()) view.dispose();
    this.views.clear();
  }
}
