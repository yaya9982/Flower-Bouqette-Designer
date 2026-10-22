import { BouquetEditor, BouquetStore, History } from './bouquet';
import { Catalog, FLOWERS } from './catalog';
import { Checkout } from './checkout';
import { Designer } from './designer';
import { FloristChat } from './florist-chat';
import { FloristTools } from './florist-tools';
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
const history = new History(store.load() ?? editor.createDefault());
const checkout = new Checkout(document.getElementById('checkout') as HTMLElement, catalog, () => designer.shown, () => view.snapshot());
const designer = new Designer({
  editor, store, presets, view, keys: window, history,
  // The pay area's total follows every change the panel shows.
  panel: {
    render: (state, actions) => { panel.render(state, actions); checkout.update(state.bouquet); },
    dispose: () => panel.dispose(),
  },
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
void checkout.mount();
new FloristChat(document.getElementById('florist') as HTMLElement, new FloristTools(editor, presets, catalog), designer, () => checkout.show()).mount();
