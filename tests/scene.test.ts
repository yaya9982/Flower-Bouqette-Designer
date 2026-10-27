import { AssetContainer, MeshBuilder, NullEngine, PBRMaterial, RawTexture, Scene, DirectionalLight, ShadowGenerator, Texture, Vector3 } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BouquetEditor, type Bouquet } from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { FlowerFactory, FlowerViews, ModelLibrary, partModel } from '../src/flowers';
import { CameraRig, DragSurface } from '../src/scene';
import type { PaperTextureSource } from '../src/paper-textures';
import { SHAPE_OF } from '../src/shapes';
import { WrapView } from '../src/wrap';

// No model files in node: every flower is the stand-in, so nothing loads in the background.
const catalog = new Catalog(FLOWERS.map((f) => ({ ...f, model: null })));
const editor = new BouquetEditor(catalog);

let scene: Scene;
let shadows: ShadowGenerator;
beforeEach(() => {
  scene = new Scene(new NullEngine());
  shadows = new ShadowGenerator(256, new DirectionalLight('sun', new Vector3(0, -1, 0), scene));
});
afterEach(() => scene.getEngine().dispose());

const flowerMeshes = () => scene.meshes.filter((m) => m.metadata?.stemId || m.name.startsWith('stem-'));
const colourMaterials = () => scene.materials.filter((m) => m.name.startsWith('colour-'));

function flowers() {
  const factory = new FlowerFactory(scene, shadows);
  const models = new ModelLibrary(scene, () => {});
  return { factory, views: new FlowerViews(factory, models, catalog) };
}

describe('FlowerViews', () => {
  const b = editor.createDefault();
  const radius = editor.arranger.surfaceRadius(b.stems);

  it('syncing the same bouquet twice rebuilds nothing', () => {
    const { views } = flowers();
    views.sync(b, radius);
    const roots = b.stems.map((s) => views.root(s.id));
    const meshes = scene.meshes.length;
    views.sync(b, radius);
    expect(b.stems.map((s) => views.root(s.id))).toEqual(roots);
    b.stems.forEach((s, i) => expect(views.root(s.id)).toBe(roots[i]));
    expect(scene.meshes.length).toBe(meshes);
  });

  it('recolouring one stem rebuilds only that flower', () => {
    const { views } = flowers();
    views.sync(b, radius);
    const roots = b.stems.map((s) => views.root(s.id));
    const first = b.stems[0];
    const other = catalog.find(first.flower)!.colours[1].id;
    views.sync(editor.recolour(b, first.id, other), radius);
    expect(views.root(first.id)).not.toBe(roots[0]);
    b.stems.slice(1).forEach((s, i) => expect(views.root(s.id)).toBe(roots[i + 1]));
  });

  it('removing a stem removes its head and stem meshes', () => {
    const { views } = flowers();
    views.sync(b, radius);
    const gone = b.stems[0];
    const own = flowerMeshes().filter((m) => m.metadata?.stemId === gone.id || m.name === `stem-${gone.id}`).length;
    expect(own).toBeGreaterThan(1);
    const before = scene.meshes.length;
    views.sync(editor.remove(b, gone.id), radius);
    expect(scene.meshes.length).toBe(before - own);
    expect(views.root(gone.id)).toBeUndefined();
  });

  it('returns the lowest point of any head, capped at zero', () => {
    const { views } = flowers();
    const cascade = editor.setShape(b, 'cascade');
    const lowest = Math.min(0, ...cascade.stems.map((s) =>
      SHAPE_OF.cascade.stemPose(s, radius).head.y - catalog.headDiameter(s.flower) / 2));
    expect(views.sync(cascade, radius)).toBe(lowest);
  });

  it('dispose leaves no flower meshes or colour materials', () => {
    const { views, factory } = flowers();
    views.sync(b, radius);
    expect(colourMaterials().length).toBeGreaterThan(0);
    views.dispose();
    factory.dispose();
    expect(flowerMeshes()).toEqual([]);
    expect(colourMaterials()).toEqual([]);
  });
});

describe('leaves on the stems', () => {
  // A box stands in for the leaf model.
  function withLeaves() {
    const container = new AssetContainer(scene);
    container.meshes.push(MeshBuilder.CreateBox('leaf', { size: 1 }, scene));
    container.removeAllFromScene();
    const factory = new FlowerFactory(scene, shadows);
    const models = { request: () => {}, get: (id: string) => (id === partModel('rose-leaf.glb').id ? container : null) } as unknown as ModelLibrary;
    return new FlowerViews(factory, models, catalog, null, partModel('rose-leaf.glb'));
  }
  let b = editor.createDefault();
  while (b.stems.length < 40) b = editor.add(b, 'rose');
  b = editor.rearrange(b);
  const radius = editor.arranger.surfaceRadius(b.stems);
  const withGreenery = (greenery: 'none' | 'few' | 'more') => editor.setWrap(b, { greenery });
  const leafMeshes = (stemId = '') => scene.meshes.filter((m) => m.name.includes(`${stemId}-leaf`));

  it('grow on some stems when greenery is on, and on none when it is off', () => {
    const views = withLeaves();
    views.sync(withGreenery('none'), radius);
    expect(leafMeshes()).toEqual([]);
    views.sync(withGreenery('more'), radius);
    expect(leafMeshes().length).toBeGreaterThan(0);
    expect(leafMeshes().length).toBeLessThanOrEqual(12);
  });

  it('turning greenery on or off rebuilds only the stems whose leaves change, never the flower heads', () => {
    const views = withLeaves();
    views.sync(withGreenery('none'), radius);
    const roots = b.stems.map((s) => views.root(s.id));
    views.sync(withGreenery('more'), radius);
    b.stems.forEach((s, i) => expect(views.root(s.id)).toBe(roots[i]));
    views.sync(withGreenery('none'), radius);
    expect(leafMeshes()).toEqual([]);
  });

  it('syncing the same bouquet twice rebuilds nothing', () => {
    const views = withLeaves();
    views.sync(withGreenery('more'), radius);
    const meshes = scene.meshes.slice();
    views.sync(withGreenery('more'), radius);
    expect(scene.meshes).toEqual(meshes);
  });

  it('go with their flower when it is removed', () => {
    const views = withLeaves();
    views.sync(withGreenery('more'), radius);
    const withLeaf = b.stems.find((s) => leafMeshes(s.id).length > 0)!;
    expect(withLeaf).toBeDefined();
    views.sync(editor.remove(withGreenery('more'), withLeaf.id), radius);
    expect(leafMeshes(withLeaf.id)).toEqual([]);
  });

  it('are not picked, so dragging a flower never grabs a leaf', () => {
    const views = withLeaves();
    views.sync(withGreenery('more'), radius);
    expect(leafMeshes().every((m) => !m.isPickable)).toBe(true);
  });
});

describe('DragSurface', () => {
  it('builds 12 wedges once per shape, size and height, and dispose removes them', () => {
    const drag = new DragSurface(scene);
    drag.update('round', 0.12, 0);
    const wedges = drag.meshes;
    expect(wedges.length).toBe(12);
    drag.update('round', 0.12, 0);
    expect(drag.meshes).toBe(wedges);
    drag.update('loose', 0.12, 0);
    expect(drag.meshes).not.toBe(wedges);
    expect(scene.meshes.filter((m) => m.name === 'dragSurface').length).toBe(12);
    drag.dispose();
    expect(scene.meshes.filter((m) => m.name === 'dragSurface').length).toBe(0);
  });
});

describe('WrapView', () => {
  const wrapMeshes = () => scene.meshes.filter((m) => m.metadata?.wrap);
  const wrapMaterials = () => scene.materials.filter((m) => m.name === 'paperMaterial' || m.name === 'ribbonMaterial');

  it('rebuilds only when the wrap, shape or size changes, and dispose removes meshes and materials', () => {
    const b: Bouquet = editor.createDefault();
    const wrap = new WrapView(scene, shadows);
    wrap.update(b.wrap, b.shape, 0.12);
    const meshes = wrapMeshes();
    expect(meshes.length).toBeGreaterThan(0);
    wrap.update({ ...b.wrap }, b.shape, 0.12);
    expect(wrapMeshes()).toEqual(meshes);
    wrap.update(b.wrap, 'cascade', 0.12);
    expect(wrapMeshes()[0]).not.toBe(meshes[0]);
    expect(wrapMaterials().length).toBe(2);
    wrap.dispose();
    expect(wrapMeshes()).toEqual([]);
    expect(wrapMaterials()).toEqual([]);
  });
});

describe('WrapView paper textures', () => {
  const paperMaterial = () => scene.materials.find((m) => m.name === 'paperMaterial') as PBRMaterial | undefined;
  const pixel = () => RawTexture.CreateRGBATexture(new Uint8Array([200, 200, 200, 255]), 1, 1, scene) as Texture;
  const wrapOf = (paper: 'none' | 'kraft' | 'matte' | 'tissue') => ({ ...editor.createDefault().wrap, paper });

  it('paper gets its fibre and fold maps; no paper has no material; the maps tile', () => {
    const sources = { base: pixel(), normal: pixel() };
    const textures: PaperTextureSource = { get: (kind) => (kind === 'none' ? null : sources) };
    const wrap = new WrapView(scene, shadows, null, textures);
    wrap.update(wrapOf('kraft'), 'round', 0.12);
    const paper = paperMaterial()!;
    expect(paper.albedoTexture).not.toBeNull();
    expect(paper.bumpTexture).not.toBeNull();
    expect((paper.albedoTexture as Texture).uScale).toBeGreaterThan(1);
    wrap.update(wrapOf('none'), 'round', 0.12);
    expect(paperMaterial()).toBeUndefined();
  });

  it('keeps the loaded maps when the wrap is rebuilt or removed, so the next paper can use them', () => {
    const sources = { base: pixel(), normal: pixel() };
    const wrap = new WrapView(scene, shadows, null, { get: () => sources });
    wrap.update(wrapOf('kraft'), 'round', 0.12);
    wrap.update(wrapOf('tissue'), 'round', 0.12);
    wrap.dispose();
    expect(sources.base.getInternalTexture()).not.toBeNull();
    expect(sources.normal.getInternalTexture()).not.toBeNull();
  });

  it('without a texture source the paper is a plain colour, as before', () => {
    new WrapView(scene, shadows).update(wrapOf('matte'), 'round', 0.12);
    expect(paperMaterial()!.albedoTexture).toBeNull();
  });
});

describe('CameraRig', () => {
  const canvas = null as unknown as HTMLCanvasElement;

  it('resetView restores the starting angles and stops coasting', () => {
    const rig = new CameraRig(scene, canvas);
    rig.follow(0.5, -0.1);
    const { camera } = rig;
    camera.alpha = 1;
    camera.beta = 0.3;
    camera.inertialAlphaOffset = 0.2;
    camera.inertialBetaOffset = 0.2;
    camera.inertialRadiusOffset = 0.2;
    rig.resetView();
    expect(camera.alpha).toBe(-Math.PI / 2);
    expect(camera.beta).toBe(0.95);
    expect([camera.inertialAlphaOffset, camera.inertialBetaOffset, camera.inertialRadiusOffset]).toEqual([0, 0, 0]);
  });

  it('refits only when the reach changes by more than 12%', () => {
    const rig = new CameraRig(scene, canvas);
    rig.follow(0.5, 0);
    const { camera } = rig;
    const radius = camera.radius;
    rig.follow(0.55, 0);
    expect(camera.radius).toBe(radius);
    rig.follow(0.6, 0);
    expect(camera.radius).toBeGreaterThan(radius);
  });
});

describe('ModelLibrary', () => {
  const missing = { ...FLOWERS[0], id: 'ghost', model: 'does-not-exist.glb' };

  it('falls back to the stand-in when a model fails, then reports it settled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const settled = vi.fn();
    const models = new ModelLibrary(scene, settled);
    models.request(missing);
    models.request(missing);
    await vi.waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(models.get('ghost')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('a load that finishes after dispose does not report back', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const settled = vi.fn();
    const models = new ModelLibrary(scene, settled);
    models.request(missing);
    models.dispose();
    await new Promise((r) => setTimeout(r, 200));
    expect(settled).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
