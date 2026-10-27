import { describe, expect, it } from 'vitest';
import { BouquetEditor, BouquetStore, History, STORAGE_KEY, type Bouquet } from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { Designer } from '../src/designer';
import type { PanelState } from '../src/panel';
import { Presets, PRESETS } from '../src/presets';

const editor = new BouquetEditor(new Catalog(FLOWERS));
const presets = new Presets(editor);

function setup() {
  const calls: string[] = [];
  const view = {
    renders: [] as { bouquet: Bouquet; selectedId: string | null }[],
    render(bouquet: Bouquet, selectedId: string | null) { this.renders.push({ bouquet, selectedId }); calls.push('view.render'); },
    resetView() { calls.push('view.resetView'); },
    dispose() { calls.push('view.dispose'); },
    onSelect: (_: string | null) => {},
    onDragMove: (_s: string, _a: number, _d: number) => {},
    onDragEnd: () => {},
  };
  const panel = {
    states: [] as PanelState[],
    render(state: PanelState) { this.states.push(state); calls.push('panel.render'); },
    dispose() { calls.push('panel.dispose'); },
  };
  const saved = new Map<string, string>();
  const store = new BouquetStore(editor, { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => void saved.set(k, v) });
  const history = new History(editor.createDefault());
  const keys = new EventTarget();
  const designer = new Designer({ editor, history, store, presets, view, panel, keys });
  designer.start();
  return { designer, view, panel, history, keys, saved, calls };
}

function key(keys: EventTarget, k: string, mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}) {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key: k, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
  keys.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('Designer', () => {
  it('start draws the view and the panel once and saves', () => {
    const { calls, saved, history } = setup();
    expect(calls).toEqual(['view.render', 'panel.render']);
    expect(saved.get(STORAGE_KEY)).toBe(JSON.stringify(history.present));
  });

  it('an edit that changes nothing records no undo step but still refreshes', () => {
    const { designer, history, panel } = setup();
    designer.setShape(history.present.shape);
    expect(history.canUndo).toBe(false);
    expect(panel.states.length).toBe(2);
  });

  it('a drag records one undo step, and undo puts the flower back', () => {
    const { view, history } = setup();
    const before = history.present;
    const stem = before.stems[0];
    view.onSelect(stem.id);
    view.onDragMove(stem.id, 1, 0.5);
    view.onDragMove(stem.id, 1.2, 0.6);
    view.onDragMove(stem.id, 1.4, 0.7);
    expect(history.canUndo).toBe(false);
    view.onDragEnd();
    expect(history.past.length).toBe(1);
    expect(history.present.stems[0]).toMatchObject({ angle: 1.4, dist: 0.7 });
    history.undo();
    expect(history.present).toBe(before);
  });

  it('previewAdjust draws the view only, and shown is the draft', () => {
    const { designer, view, panel, history } = setup();
    view.onSelect(history.present.stems[0].id);
    const panels = panel.states.length;
    designer.previewAdjust({ height: 0.5 });
    expect(panel.states.length).toBe(panels);
    expect(view.renders.at(-1)!.bouquet).toBe(designer.shown);
    expect(designer.shown.stems[0].height).toBe(0.5);
    expect(history.present.stems[0].height).not.toBe(0.5);
  });

  it('remove clears the selection', () => {
    const { designer, view, history } = setup();
    view.onSelect(history.present.stems[0].id);
    designer.remove();
    expect(designer.selected).toBeNull();
    expect(history.present.stems.length).toBe(11);
  });

  it('loadPreset clears the selection, applies it, then resets the view; an unknown one does nothing', () => {
    const { designer, view, history, calls } = setup();
    view.onSelect(history.present.stems[0].id);
    calls.length = 0;
    designer.loadPreset(PRESETS[0].id);
    expect(designer.selected).toBeNull();
    expect(history.present).toEqual(presets.build(PRESETS[0]));
    expect(calls).toEqual(['view.render', 'panel.render', 'view.resetView']);
    calls.length = 0;
    designer.loadPreset('nope');
    expect(calls).toEqual([]);
  });

  it('Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z undo and redo; plain z does nothing', () => {
    const { designer, history, keys } = setup();
    designer.add('lily');
    const added = history.present;
    expect(key(keys, 'z')).toBe(false);
    expect(history.present).toBe(added);
    expect(key(keys, 'z', { ctrlKey: true })).toBe(true);
    expect(history.present).not.toBe(added);
    expect(key(keys, 'y', { ctrlKey: true })).toBe(true);
    expect(history.present).toBe(added);
    expect(key(keys, 'z', { metaKey: true })).toBe(true);
    expect(history.present).not.toBe(added);
    expect(key(keys, 'Z', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(history.present).toBe(added);
  });

  it('Ctrl+Z inside a text box is left to the box and does not undo the bouquet', () => {
    const { designer, history, keys } = setup();
    designer.add('lily');
    const added = history.present;
    for (const tagName of ['TEXTAREA', 'INPUT']) {
      Object.assign(keys, { tagName });
      expect(key(keys, 'z', { ctrlKey: true })).toBe(false);
      expect(history.present).toBe(added);
    }
    Object.assign(keys, { tagName: 'INPUT', type: 'range' });
    expect(key(keys, 'z', { ctrlKey: true })).toBe(true);
  });

  it('dispose stops listening for keys and disposes the view and panel', () => {
    const { designer, history, keys, calls } = setup();
    designer.add('lily');
    const added = history.present;
    designer.dispose();
    expect(key(keys, 'z', { ctrlKey: true })).toBe(false);
    expect(history.present).toBe(added);
    expect(calls.slice(-2)).toEqual(['view.dispose', 'panel.dispose']);
  });

  it('applyEdit records one undo step for a change made outside the panel', () => {
    const { designer, history } = setup();
    const before = history.present.stems.length;
    designer.applyEdit((b) => editor.add(editor.add(b, 'rose'), 'rose'));
    expect(history.present.stems.length).toBe(before + 2);
    designer.undo();
    expect(history.present.stems.length).toBe(before);
  });

  it('applyEdit that changes nothing records no undo step', () => {
    const { designer, history } = setup();
    designer.applyEdit((b) => b);
    expect(history.past.length).toBe(0);
  });

  it('every refresh saves the design', () => {
    const { designer, saved, history } = setup();
    designer.add('tulip');
    expect(saved.get(STORAGE_KEY)).toBe(JSON.stringify(history.present));
  });
});
