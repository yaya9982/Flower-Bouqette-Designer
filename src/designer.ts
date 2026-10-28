import { BouquetEditor, type Bouquet, type BouquetStore, type History, type ShapeId, type Wrap } from './bouquet';
import type { Panel, PanelActions } from './panel';
import type { Presets } from './presets';
import type { BouquetView } from './scene';

type View = Pick<BouquetView, 'render' | 'resetView' | 'onSelect' | 'onDragMove' | 'onDragEnd' | 'dispose'>;

export interface DesignerParts {
  editor: BouquetEditor;
  history: History;
  store: BouquetStore;
  presets: Presets;
  view: View;
  panel: Pick<Panel, 'render' | 'dispose'>;
  /** Where Ctrl+Z / Ctrl+Y are listened for (the window). */
  keys: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
}

/** The app: the design being edited, the selection, and every action the panel and the 3D view can trigger. */
export class Designer implements PanelActions {
  private selectedId: string | null = null;
  /** A change being shown but not yet recorded (a slider or a flower mid-drag). */
  private draft: Bouquet | null = null;
  private variant = 0;

  constructor(private readonly parts: DesignerParts) {}

  /** What the 3D view shows: the draft if there is one, otherwise the recorded design. */
  get shown(): Bouquet {
    return this.draft ?? this.parts.history.present;
  }

  get selected(): string | null {
    return this.selectedId;
  }

  start(): void {
    const { view, editor, history, keys } = this.parts;
    view.onSelect = (stemId) => {
      this.selectedId = stemId;
      this.refresh();
    };
    view.onDragMove = (stemId, angle, dist) => this.preview(editor.move(history.present, stemId, angle, dist));
    view.onDragEnd = () => {
      if (this.draft) this.apply(this.draft);
    };
    keys.addEventListener('keydown', this.onKey);
    this.refresh();
  }

  add(flowerId: string, colourId?: string): void { this.apply(this.parts.editor.add(this.present, flowerId, colourId)); }
  removeOne(flowerId: string): void { this.apply(this.parts.editor.removeOneOfType(this.present, flowerId)); }
  setShape(shape: ShapeId): void { this.apply(this.parts.editor.setShape(this.present, shape)); }
  setWrap(patch: Partial<Wrap>): void { this.apply(this.parts.editor.setWrap(this.present, patch)); }
  recolour(colourId: string): void { this.apply(this.onSelected((b, id) => this.parts.editor.recolour(b, id, colourId))); }
  previewAdjust(patch: { height?: number; tilt?: number }): void { this.preview(this.onSelected((b, id) => this.parts.editor.adjust(b, id, patch))); }
  adjust(patch: { height?: number; tilt?: number }): void { this.apply(this.onSelected((b, id) => this.parts.editor.adjust(b, id, patch))); }
  swap(flowerId: string): void { this.apply(this.onSelected((b, id) => this.parts.editor.swap(b, id, flowerId))); }
  remove(): void { this.apply(this.onSelected((b, id) => this.parts.editor.remove(b, id))); }
  undo(): void { this.parts.history.undo(); this.refresh(); }
  redo(): void { this.parts.history.redo(); this.refresh(); }
  /** Each click is a new variant, so the layout differs every time; undo steps back through them. */
  rearrange(): void { this.apply(this.parts.editor.rearrange(this.present, ++this.variant)); }
  /** A change worked out elsewhere (the AI florist's tools): one undo step, or none if it changed nothing. */
  applyEdit(change: (b: Bouquet) => Bouquet): void { this.apply(change(this.present)); }
  resetView(): void { this.parts.view.resetView(); }

  loadPreset(presetId: string): void {
    const { presets, view } = this.parts;
    const preset = presets.find(presetId);
    const next = preset && presets.build(preset);
    if (!next) return;
    this.selectedId = null;
    this.apply(next);
    view.resetView();
  }

  dispose(): void {
    this.parts.keys.removeEventListener('keydown', this.onKey);
    this.parts.view.dispose();
    this.parts.panel.dispose();
  }

  private get present(): Bouquet {
    return this.parts.history.present;
  }

  private refresh(): void {
    const { history, view, panel, store } = this.parts;
    this.draft = null;
    this.selectedId = BouquetEditor.resolveSelection(history.present, this.selectedId);
    view.render(history.present, this.selectedId);
    panel.render({
      bouquet: history.present,
      selectedId: this.selectedId,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
    }, this);
    store.save(history.present);
  }

  /** Record a change. Does nothing extra if the change was refused and returned the same bouquet. */
  private apply(next: Bouquet): void {
    this.parts.history.commit(next);
    this.refresh();
  }

  /** Show a change in the 3D view only. */
  private preview(next: Bouquet): void {
    this.draft = next;
    this.parts.view.render(next, this.selectedId);
  }

  private onSelected(change: (b: Bouquet, stemId: string) => Bouquet): Bouquet {
    return this.selectedId ? change(this.present, this.selectedId) : this.present;
  }

  private readonly onKey = (event: Event) => {
    const e = event as KeyboardEvent;
    if (!(e.ctrlKey || e.metaKey)) return;
    // In a text box, Ctrl+Z is the box's own undo (the card message, the florist's chat), not the bouquet's.
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') || target.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) this.undo();
    else if (key === 'y' || (key === 'z' && e.shiftKey)) this.redo();
    else return;
    e.preventDefault();
  };
}
