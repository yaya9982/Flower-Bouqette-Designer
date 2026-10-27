import { AssetContainer, Axis, Color3, Mesh, MeshBuilder, PBRMaterial, Scene, ShadowGenerator, TransformNode, Vector3 } from '@babylonjs/core';
import type { BowId, PaperId, Wrap } from './bouquet';
import { BINDING, DEFAULT_HEIGHT, SHAPE_OF, TAU, type ShapeId } from './shapes';
import { PAPER_COLOURS, RIBBON_COLOURS } from './catalog';
import { partModel, type ModelLibrary, type ModelRef } from './flowers';
import type { PaperTextureSource } from './paper-textures';

/** `repeat`: how many times the paper's maps tile around and up the paper. `fold`: how strongly its folds show. */
const PAPER_LOOK: Record<Exclude<PaperId, 'none'>, { roughness: number; alpha: number; repeat: [number, number]; fold: number }> = {
  kraft: { roughness: 0.95, alpha: 1, repeat: [7, 5], fold: 1.5 },
  matte: { roughness: 0.7, alpha: 1, repeat: [8, 6], fold: 0.6 },
  tissue: { roughness: 0.6, alpha: 0.55, repeat: [8, 4], fold: 1.6 },
};
/** Fraction of a full turn the paper covers for the shapes that face or spill out of the front; the rest is the opening. */
const PAPER_ARC = 0.78;
/** Turns the paper so its opening faces the default camera. Set in Task 6 Step 4. */
const PAPER_OPENING_TURN = 0.88;
/** Bow models (1 unit wide, facing -Z) and how wide each is drawn, in metres. */
const BOW_MODELS: Record<BowId, { ref: ModelRef; width: number }> = {
  ribbon: { ref: partModel('bow-ribbon.glb'), width: 0.1 },
  star: { ref: partModel('bow-star.glb'), width: 0.08 },
};

function flatMaterial(scene: Scene, name: string, hex: string, roughness: number, alpha = 1): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  // Hex colours are sRGB; Babylon's PBR colours are linear.
  m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
  m.metallic = 0;
  m.roughness = roughness;
  m.alpha = alpha;
  m.backFaceCulling = false;
  // Large flat surfaces catch far more light than petals; without this, kraft brown reads as peach.
  m.directIntensity = 0.75;
  m.environmentIntensity = 0.5;
  return m;
}

/**
 * The paper, ribbon and bow, rebuilt only when the wrap, shape, size or a model's arrival changes.
 * Without `models` (as in the tests) the bow is built from basic shapes.
 */
export class WrapView {
  private node: TransformNode | null = null;
  private builtFor = '';

  constructor(private readonly scene: Scene, private readonly shadows: ShadowGenerator, private readonly models: ModelLibrary | null = null,
    private readonly textures: PaperTextureSource | null = null) {}

  update(wrap: Wrap, shape: ShapeId, radius: number): void {
    const bowRef = BOW_MODELS[wrap.bow].ref;
    if (this.models) this.models.request(bowRef);
    const bow = this.models?.get(bowRef.id) ?? null;
    // The leaves are not part of the wrap: they grow on the stems (src/flowers.ts), so the greenery setting is left out.
    const key = `${JSON.stringify([wrap.paper, wrap.paperColour, wrap.ribbonColour, wrap.bow])}|${shape}|${radius.toFixed(4)}|${bow ? 1 : 0}`;
    if (key === this.builtFor) return;
    this.dispose();
    this.node = buildWrap(this.scene, wrap, shape, radius, bow, this.textures);
    for (const mesh of this.node.getChildMeshes()) {
      mesh.metadata = { wrap: true };
      mesh.isPickable = false;
      this.shadows.addShadowCaster(mesh);
    }
    this.builtFor = key;
  }

  dispose(): void {
    this.node?.dispose(false, true);
    this.node = null;
    this.builtFor = '';
  }
}

function buildWrap(scene: Scene, wrap: Wrap, shape: ShapeId, radius: number, bowModel: AssetContainer | null, textures: PaperTextureSource | null): TransformNode {
  const root = new TransformNode('wrap', scene);
  const add = (mesh: Mesh, material: PBRMaterial) => {
    mesh.material = material;
    mesh.isPickable = false;
    mesh.parent = root;
  };

  const hasPaper = wrap.paper !== 'none';
  const neck = hasPaper ? 0.042 : 0.022;

  if (wrap.paper !== 'none') {
    const look = PAPER_LOOK[wrap.paper];
    const hex = PAPER_COLOURS.find((c) => c.id === wrap.paperColour)?.hex ?? PAPER_COLOURS[0].hex;
    // Size the paper from the widest point of the rim. A cascading bouquet is measured as an even dome,
    // because its front flowers are meant to hang out through the opening.
    const measured = SHAPE_OF[shape].paperRimShape;
    // Measured at the height flowers start at, so the paper ends under the heads as they are first arranged.
    let rim = measured.surfacePoint(0, 1, radius, DEFAULT_HEIGHT).head;
    for (let angle = 0; angle < TAU; angle += TAU / 24) {
      const at = measured.surfacePoint(angle, 1, radius, DEFAULT_HEIGHT).head;
      if (Math.hypot(at.x, at.z) > Math.hypot(rim.x, rim.z)) rim = at;
    }
    // The fixed part clears a rim flower's head, which does not shrink with the bouquet.
    const rimRadius = Math.hypot(rim.x, rim.z) * 0.95 + 0.01;
    // The paper stops just under the outer heads, so they spill over its edge and the stems stay hidden.
    const rimHeight = rim.y - 0.03;
    const profile = [
      new Vector3(0.022, 0.02, 0),
      new Vector3(neck - 0.002, BINDING.y, 0),
      new Vector3(rimRadius * 0.6, BINDING.y + (rimHeight - BINDING.y) * 0.45, 0),
      new Vector3(rimRadius, rimHeight, 0),
    ];
    const paper = MeshBuilder.CreateLathe('paper', { shape: profile, arc: SHAPE_OF[shape].paperOpening ? PAPER_ARC : 1, closed: false, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE, cap: Mesh.NO_CAP }, scene);
    paper.rotation.y = PAPER_OPENING_TURN;
    const material = flatMaterial(scene, 'paperMaterial', hex, look.roughness, look.alpha);
    const maps = textures?.get(wrap.paper);
    if (maps) {
      // Clones, because disposing the wrap frees its materials' textures, and the loaded maps are shared by every rebuild.
      const base = maps.base.clone();
      [base.uScale, base.vScale] = look.repeat;
      material.albedoTexture = base;
      const folds = maps.normal.clone();
      [folds.uScale, folds.vScale] = look.repeat;
      folds.level = look.fold;
      material.bumpTexture = folds;
    }
    add(paper, material);
  }

  const ribbonHex = RIBBON_COLOURS.find((c) => c.id === wrap.ribbonColour)?.hex ?? RIBBON_COLOURS[0].hex;
  const ribbon = flatMaterial(scene, 'ribbonMaterial', ribbonHex, 0.45);

  const band = MeshBuilder.CreateCylinder('ribbonBand', { height: 0.03, diameter: neck * 2, tessellation: 32 }, scene);
  band.position = new Vector3(BINDING.x, BINDING.y, BINDING.z);
  add(band, ribbon);

  if (bowModel) {
    // The bow model on the front of the band, in the ribbon colour (its own material copy, freed with the wrap).
    const fit = new TransformNode('bow', scene);
    fit.parent = root;
    fit.position = new Vector3(BINDING.x, BINDING.y, BINDING.z - (neck + 0.004));
    const width = BOW_MODELS[wrap.bow].width;
    fit.scaling = new Vector3(width, width, width);
    const copy = bowModel.instantiateModelsToScene((name) => `bow-${name}`, true, { doNotInstantiate: true });
    for (const node of copy.rootNodes) node.parent = fit;
    for (const mesh of fit.getChildMeshes()) {
      if (mesh.material instanceof PBRMaterial) mesh.material.albedoColor = Color3.FromHexString(ribbonHex).toLinearSpace();
    }
  }
  // Without the model (still loading, or in the tests): a simple bow of two loops and two tails.
  for (const side of bowModel ? [] : [-1, 1]) {
    const loop = MeshBuilder.CreateTorus('ribbonLoop', { diameter: 0.05, thickness: 0.012, tessellation: 24 }, scene);
    loop.scaling.y = 2.2;
    loop.rotation.x = Math.PI / 2;
    loop.position = new Vector3(side * 0.03, BINDING.y, -(neck + 0.008));
    add(loop, ribbon);

    const tail = MeshBuilder.CreateBox('ribbonTail', { width: 0.014, height: 0.09, depth: 0.002 }, scene);
    tail.rotation.z = side * 0.25;
    tail.position = new Vector3(side * 0.014, BINDING.y - 0.05, -(neck + 0.006));
    add(tail, ribbon);
  }

  // Lean the whole wrap about the tie, the same way the shape leans its flowers (Babylon turns the other way round).
  root.rotateAround(new Vector3(BINDING.x, BINDING.y, BINDING.z), Axis.X, -SHAPE_OF[shape].lean);
  return root;
}
