import {
  addStem, adjustStem, commit, createDefaultBouquet, createHistory, loadBouquet, moveStem, rearrange, recolourStem, redo,
  removeOneOfType, removeStem, resolveSelection, saveBouquet, setShape, setWrap, swapStem, undo, type Bouquet, type Store,
} from './bouquet';
import { FLOWERS } from './catalog';
import { renderPanel, type PanelActions } from './panel';
import { presetBouquet, PRESETS } from './presets';
import { createScene } from './scene';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const panelRoot = document.getElementById('panel') as HTMLElement;
const scene = createScene(canvas, FLOWERS);

/** Browser storage, or a stand-in that keeps nothing when the browser blocks it. */
const store: Store = (() => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {} };
  }
})();

let history = createHistory(loadBouquet(FLOWERS, store) ?? createDefaultBouquet(FLOWERS));
let selectedId: string | null = null;
/** A change being shown but not yet recorded (a slider or a flower mid-drag). */
let draft: Bouquet | null = null;

function refresh(): void {
  draft = null;
  selectedId = resolveSelection(history.present, selectedId);
  scene.render(history.present, selectedId);
  renderPanel(panelRoot, {
    bouquet: history.present,
    selectedId,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  }, FLOWERS, actions);
  saveBouquet(history.present, store);
}

/** Record a change. Does nothing extra if the change was refused and returned the same bouquet. */
function apply(next: Bouquet): void {
  history = commit(history, next);
  refresh();
}

/** Show a change in the 3D view only. */
function preview(next: Bouquet): void {
  draft = next;
  scene.render(next, selectedId);
}

const onSelected = (change: (b: Bouquet, stemId: string) => Bouquet) => (selectedId ? change(history.present, selectedId) : history.present);

const actions: PanelActions = {
  add: (flowerId, colourId) => apply(addStem(history.present, flowerId, FLOWERS, colourId)),
  removeOne: (flowerId) => apply(removeOneOfType(history.present, flowerId)),
  setShape: (shape) => apply(setShape(history.present, shape)),
  setWrap: (patch) => apply(setWrap(history.present, patch)),
  recolour: (colourId) => apply(onSelected((b, id) => recolourStem(b, id, colourId, FLOWERS))),
  previewAdjust: (patch) => preview(onSelected((b, id) => adjustStem(b, id, patch))),
  adjust: (patch) => apply(onSelected((b, id) => adjustStem(b, id, patch))),
  swap: (flowerId) => apply(onSelected((b, id) => swapStem(b, id, flowerId, FLOWERS))),
  remove: () => apply(onSelected((b, id) => removeStem(b, id))),
  undo: () => { history = undo(history); refresh(); },
  redo: () => { history = redo(history); refresh(); },
  rearrange: () => apply(rearrange(history.present, FLOWERS)),
  resetView: () => scene.resetView(),
  loadPreset: (presetId) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    const next = preset && presetBouquet(preset, FLOWERS);
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
scene.onDragMove = (stemId, angle, dist) => preview(moveStem(history.present, stemId, angle, dist));
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
