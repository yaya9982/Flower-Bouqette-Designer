import { BouquetEditor, BouquetStore, History } from './bouquet';
import { Catalog, FLOWERS } from './catalog';
import { Designer } from './designer';
import { Panel } from './panel';
import { Presets } from './presets';
import { BouquetView } from './scene';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const panelRoot = document.getElementById('panel') as HTMLElement;
const catalog = new Catalog(FLOWERS);
const view = new BouquetView(canvas, catalog);
const editor = new BouquetEditor(catalog);
const store = BouquetStore.browser(editor);
const presets = new Presets(editor);
const panel = new Panel(panelRoot, catalog, presets);
const designer = new Designer({
  editor, store, presets, view, panel, keys: window,
  history: new History(store.load() ?? editor.createDefault()),
});

if (import.meta.env.DEV) {
  Object.assign(window, {
    __debug: {
      bouquet: () => designer.shown,
      selected: () => designer.selected,
      screenOf: (stemId: string) => view.screenPosition(stemId),
      fps: () => view.fps(),
    },
  });
}

designer.start();
