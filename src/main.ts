import { BouquetEditor, BouquetStore, History, type Bouquet } from './bouquet';
import { Catalog, FLOWERS } from './catalog';
import { renderPanel, type PanelActions } from './panel';
import { Presets } from './presets';
import { BouquetView } from './scene';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const panelRoot = document.getElementById('panel') as HTMLElement;
const catalog = new Catalog(FLOWERS);
const scene = new BouquetView(canvas, catalog);
const editor = new BouquetEditor(catalog);
const store = BouquetStore.browser(editor);
const presets = new Presets(editor);

const history = new History(store.load() ?? editor.createDefault());
let selectedId: string | null = null;
/** A change being shown but not yet recorded (a slider or a flower mid-drag). */
let draft: Bouquet | null = null;

function refresh(): void {
  draft = null;
  selectedId = BouquetEditor.resolveSelection(history.present, selectedId);
  scene.render(history.present, selectedId);
  renderPanel(panelRoot, {
    bouquet: history.present,
    selectedId,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  }, catalog, actions);
  store.save(history.present);
}

/** Record a change. Does nothing extra if the change was refused and returned the same bouquet. */
function apply(next: Bouquet): void {
  history.commit(next);
  refresh();
}

/** Show a change in the 3D view only. */
function preview(next: Bouquet): void {
  draft = next;
  scene.render(next, selectedId);
}

const onSelected = (change: (b: Bouquet, stemId: string) => Bouquet) => (selectedId ? change(history.present, selectedId) : history.present);

const actions: PanelActions = {
  add: (flowerId, colourId) => apply(editor.add(history.present, flowerId, colourId)),
  removeOne: (flowerId) => apply(editor.removeOneOfType(history.present, flowerId)),
  setShape: (shape) => apply(editor.setShape(history.present, shape)),
  setWrap: (patch) => apply(editor.setWrap(history.present, patch)),
  recolour: (colourId) => apply(onSelected((b, id) => editor.recolour(b, id, colourId))),
  previewAdjust: (patch) => preview(onSelected((b, id) => editor.adjust(b, id, patch))),
  adjust: (patch) => apply(onSelected((b, id) => editor.adjust(b, id, patch))),
  swap: (flowerId) => apply(onSelected((b, id) => editor.swap(b, id, flowerId))),
  remove: () => apply(onSelected((b, id) => editor.remove(b, id))),
  undo: () => { history.undo(); refresh(); },
  redo: () => { history.redo(); refresh(); },
  rearrange: () => apply(editor.rearrange(history.present)),
  resetView: () => scene.resetView(),
  loadPreset: (presetId) => {
    const preset = presets.find(presetId);
    const next = preset && presets.build(preset);
    if (!next) return;
    selectedId = null;
    apply(next);
    scene.resetView();
  },
};

scene.onSelect = (stemId) => {
  selectedId = stemId;
  refresh();
};
scene.onDragMove = (stemId, angle, dist) => preview(editor.move(history.present, stemId, angle, dist));
scene.onDragEnd = () => {
  if (draft) apply(draft);
};

if (import.meta.env.DEV) {
  Object.assign(window, {
    __debug: {
      bouquet: () => draft ?? history.present,
      selected: () => selectedId,
      screenOf: (stemId: string) => scene.screenPosition(stemId),
      fps: () => scene.fps(),
    },
  });
}

window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) actions.undo();
  else if (key === 'y' || (key === 'z' && event.shiftKey)) actions.redo();
  else return;
  event.preventDefault();
});

refresh();
