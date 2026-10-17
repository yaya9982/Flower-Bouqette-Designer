import { Axis, Color3, Mesh, MeshBuilder, PBRMaterial, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { BINDING, DEFAULT_HEIGHT, shapeLean, surfacePoint, TAU } from './arrange';
import type { PaperId, ShapeId, Wrap } from './bouquet';
import { PAPER_COLOURS, RIBBON_COLOURS } from './catalog';

const PAPER_LOOK: Record<Exclude<PaperId, 'none'>, { roughness: number; alpha: number }> = {
  kraft: { roughness: 0.95, alpha: 1 },
  matte: { roughness: 0.7, alpha: 1 },
  tissue: { roughness: 0.6, alpha: 0.55 },
};
/** Fraction of a full turn the paper covers for the shapes that face or spill out of the front; the rest is the opening. */
const PAPER_ARC = 0.78;
/** Turns the paper so its opening faces the default camera. Set in Task 6 Step 4. */
const PAPER_OPENING_TURN = 0.88;

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

export function buildWrap(scene: Scene, wrap: Wrap, shape: ShapeId, radius: number): TransformNode {
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
    const measured: ShapeId = shape === 'cascade' ? 'round' : shape;
    // Measured at the height flowers start at, so the paper ends under the heads as they are first arranged.
    let rim = surfacePoint(measured, 0, 1, radius, DEFAULT_HEIGHT).head;
    for (let angle = 0; angle < TAU; angle += TAU / 24) {
      const at = surfacePoint(measured, angle, 1, radius, DEFAULT_HEIGHT).head;
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
    const paper = MeshBuilder.CreateLathe('paper', { shape: profile, arc: shape === 'cascade' || shape === 'onesided' ? PAPER_ARC : 1, closed: false, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE, cap: Mesh.NO_CAP }, scene);
    paper.rotation.y = PAPER_OPENING_TURN;
    add(paper, flatMaterial(scene, 'paperMaterial', hex, look.roughness, look.alpha));
  }

  const ribbonHex = RIBBON_COLOURS.find((c) => c.id === wrap.ribbonColour)?.hex ?? RIBBON_COLOURS[0].hex;
  const ribbon = flatMaterial(scene, 'ribbonMaterial', ribbonHex, 0.45);

  const band = MeshBuilder.CreateCylinder('ribbonBand', { height: 0.03, diameter: neck * 2, tessellation: 32 }, scene);
  band.position = new Vector3(BINDING.x, BINDING.y, BINDING.z);
  add(band, ribbon);

  // A simple bow on the front: two loops and two tails.
  for (const side of [-1, 1]) {
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
  root.rotateAround(new Vector3(BINDING.x, BINDING.y, BINDING.z), Axis.X, -shapeLean(shape));
  return root;
}
