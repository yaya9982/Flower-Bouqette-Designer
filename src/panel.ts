import { MAX_STEMS, MIN_STEMS, type Bouquet, type BowId, type GreeneryId, type PaperId, type ShapeId, type Wrap } from './bouquet';
import { PAPER_COLOURS, RIBBON_COLOURS, type Catalog, type FlowerType, type NamedColour } from './catalog';
import type { Preset, Presets } from './presets';
import { formatCents, priceBouquet } from './pricing';
import { SHAPE_OF, SHAPES } from './shapes';

/**
 * While testing, "Random" opens a list of the other presets to choose from instead of picking one.
 * ponytail: a hard switch; set it to false to make the button truly random.
 */
const RANDOM_OPENS_LIST = true;

export interface PanelState {
  bouquet: Bouquet;
  selectedId: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

export interface PanelActions {
  /** `colourId`: the colour to add it in, for a flower that comes in several. */
  add(flowerId: string, colourId?: string): void;
  removeOne(flowerId: string): void;
  setShape(shape: ShapeId): void;
  setWrap(patch: Partial<Wrap>): void;
  recolour(colourId: string): void;
  /** Slider is moving: show the change without recording it. */
  previewAdjust(patch: { height?: number; tilt?: number }): void;
  /** Slider released: record the change. */
  adjust(patch: { height?: number; tilt?: number }): void;
  swap(flowerId: string): void;
  remove(): void;
  undo(): void;
  redo(): void;
  rearrange(): void;
  resetView(): void;
  loadPreset(presetId: string): void;
}

const PAPER_NAMES: Record<PaperId, string> = { none: 'No paper', kraft: 'Kraft', matte: 'Matte', tissue: 'Tissue' };
/** Size of a flower's preview picture (public/thumbs/<id>.webp, made by tools/thumbnails.py), in CSS pixels. */
const PREVIEW_SIZE = 128;
let preview: HTMLImageElement | null = null;

/**
 * Shows the flower's picture beside its row in the "Add flowers" list, over the 3D view. One shared picture outside
 * the list, because the list scrolls and would clip anything inside it. Decorative: the row already names the flower.
 */
function showPreview(row: HTMLElement, flowerId: string): void {
  if (!preview) {
    preview = document.createElement('img');
    preview.className = 'flower-preview';
    preview.alt = '';
    preview.width = preview.height = PREVIEW_SIZE;
    preview.addEventListener('error', hidePreview);
    document.body.append(preview);
  }
  const rect = row.getBoundingClientRect();
  const top = Math.min(Math.max(8, rect.top + rect.height / 2 - PREVIEW_SIZE / 2), window.innerHeight - PREVIEW_SIZE - 8);
  preview.style.top = `${top}px`;
  preview.style.left = `${Math.max(8, rect.left - PREVIEW_SIZE - 16)}px`;
  preview.src = `${import.meta.env.BASE_URL}thumbs/${flowerId}.webp`;
  preview.hidden = false;
}

function hidePreview(): void {
  if (preview) preview.hidden = true;
}

const BOW_NAMES: Record<BowId, string> = { ribbon: 'Ribbon bow', star: 'Gift star' };
const GREENERY_NAMES: Record<GreeneryId, string> = { none: 'No greenery', fern: 'Ferns', eucalyptus: 'Eucalyptus leaves', leafy: 'Leafy sprigs' };

type Child = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

/** `key` lets keyboard focus return to the same control after the panel is rebuilt. */
function button(key: string, label: string, onClick: () => void, attrs: Record<string, string> = {}, disabled = false): HTMLButtonElement {
  const b = el('button', { type: 'button', 'data-key': key, ...attrs }, label);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function swatches(key: string, legend: string, colours: NamedColour[], current: string, onPick: (id: string) => void): HTMLElement {
  const row = el('div', { class: 'swatches' });
  for (const c of colours) {
    row.append(button(`${key}-${c.id}`, '', () => onPick(c.id), {
      class: 'swatch', style: `background:${c.hex}`, title: c.name, 'aria-label': c.name, 'aria-pressed': String(c.id === current),
    }));
  }
  return el('fieldset', {}, el('legend', {}, legend), row);
}

function select(key: string, label: string, options: { id: string; name: string }[], current: string, onChange: (id: string) => void): HTMLElement {
  const input = el('select', { id: key, 'data-key': key });
  for (const o of options) {
    const option = el('option', { value: o.id }, o.name);
    option.selected = o.id === current;
    input.append(option);
  }
  input.addEventListener('change', () => onChange(input.value));
  return el('div', { class: 'field' }, el('label', { for: key }, label), input);
}

function slider(key: string, label: string, min: number, max: number, value: number, onInput: (v: number) => void, onChange: (v: number) => void): HTMLElement {
  const input = el('input', { id: key, 'data-key': key, type: 'range', min: String(min), max: String(max), step: '0.01', value: String(value) });
  input.addEventListener('input', () => onInput(Number(input.value)));
  input.addEventListener('change', () => onChange(Number(input.value)));
  return el('div', { class: 'field' }, el('label', { for: key }, label), input);
}

function section(title: string, ...children: Child[]): HTMLElement {
  return el('section', {}, el('h2', {}, title), ...children);
}

function svg(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): SVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

/** Makes a drawn shape behave as a button: focusable, and pressed with Enter or Space as well as a click. */
function pressable(node: SVGElement, onPress: () => void): SVGElement {
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');
  node.addEventListener('click', onPress);
  node.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    if (key !== 'Enter' && key !== ' ') return;
    event.preventDefault();
    onPress();
  });
  return node;
}

const flowerLabel = (type: FlowerType) => (type.title ? `${type.name} – ${type.title}` : type.name);
const plural = (n: number) => `${n} flower${n === 1 ? '' : 's'}`;

const WHEEL = { size: 172, outer: 80, inner: 46, gap: 0.035, lift: 5 };

/**
 * A ring with one wedge per colour that has flowers. Clicking a wedge narrows the list to that colour;
 * clicking it again, or the middle, shows every flower.
 */
function colourWheel(families: { colour: NamedColour; count: number }[], total: number, current: string | null, onPick: (id: string | null) => void): SVGElement {
  const c = WHEEL.size / 2;
  const at = (radius: number, angle: number) => `${(c + radius * Math.cos(angle)).toFixed(2)} ${(c + radius * Math.sin(angle)).toFixed(2)}`;
  const span = (Math.PI * 2) / families.length;
  const wedges = families.map(({ colour, count }, i) => {
    // The first wedge starts at the top. One colour alone would be a full ring, which an arc cannot draw, so it stops just short.
    const from = -Math.PI / 2 + i * span + WHEEL.gap / 2;
    const to = from + Math.min(span, Math.PI * 2 - 0.001) - WHEEL.gap;
    const large = to - from > Math.PI ? 1 : 0;
    const path = `M ${at(WHEEL.outer, from)} A ${WHEEL.outer} ${WHEEL.outer} 0 ${large} 1 ${at(WHEEL.outer, to)} `
      + `L ${at(WHEEL.inner, to)} A ${WHEEL.inner} ${WHEEL.inner} 0 ${large} 0 ${at(WHEEL.inner, from)} Z`;
    const picked = colour.id === current;
    const middle = (from + to) / 2;
    const wedge = svg('path', {
      d: path, class: 'wedge', 'data-key': `wheel-${colour.id}`, 'aria-pressed': String(picked), 'aria-label': `${colour.name}, ${plural(count)}`,
      fill: colour.id === 'multicolour' ? 'url(#wheel-mixed)' : colour.hex,
      // The picked wedge moves outward a little.
      transform: picked ? `translate(${(WHEEL.lift * Math.cos(middle)).toFixed(2)} ${(WHEEL.lift * Math.sin(middle)).toFixed(2)})` : '',
    }, svg('title', {}, `${colour.name} (${count})`));
    return pressable(wedge, () => onPick(picked ? null : colour.id));
  });

  const shown = families.find((f) => f.colour.id === current);
  const hub = pressable(svg('g', { class: 'hub', 'data-key': 'wheel-all', 'aria-label': 'Show flowers of every colour', 'aria-pressed': String(!shown) },
    svg('circle', { cx: String(c), cy: String(c), r: String(WHEEL.inner - 6) }),
    svg('text', { x: String(c), y: String(c - 2), class: 'hub-name' }, shown ? shown.colour.name : 'All colours'),
    svg('text', { x: String(c), y: String(c + 14), class: 'hub-count' }, plural(shown ? shown.count : total)),
  ), () => onPick(null));

  const mixed = svg('linearGradient', { id: 'wheel-mixed' },
    ...['#c8242b', '#f4d03f', '#7fa650', '#4f7fd1', '#7a4fa3'].map((hex, i, all) => svg('stop', { offset: String(i / (all.length - 1)), 'stop-color': hex })));
  return svg('svg', { class: 'wheel', viewBox: `0 0 ${WHEEL.size} ${WHEEL.size}`, width: String(WHEEL.size), height: String(WHEEL.size), role: 'group', 'aria-label': 'Filter flowers by colour' },
    svg('defs', {}, mixed), ...wedges, hub);
}

/** The side panel. It is rebuilt from scratch on every render, keeping focus and the flower list's scroll position. */
export class Panel {
  /** Which colour the flower list is narrowed to. A viewing choice, not part of the design, so it is not saved or undone. */
  private colourFilter: string | null = null;
  /** Whether the list of the other presets is showing. Also a viewing choice. */
  private presetListOpen = false;

  constructor(private readonly root: HTMLElement, private readonly catalog: Catalog, private readonly presets: Presets) {}

  render(state: PanelState, actions: PanelActions): void {
    const { root, catalog } = this;
    const { bouquet, selectedId } = state;
    const focusedKey = (document.activeElement as HTMLElement | SVGElement | null)?.dataset?.key;
    const listScroll = root.querySelector('.flower-list')?.scrollTop ?? 0;
    const total = bouquet.stems.length;
    const full = total >= MAX_STEMS;
    const name = (type: FlowerType) => el('span', { class: 'name' }, type.name, ...(type.title ? [el('small', {}, type.title)] : []));

    // Only the flowers in the bouquet, in the order they were first added.
    const inBouquet = [...new Set(bouquet.stems.map((s) => s.flower))].flatMap((id) => catalog.find(id) ?? []);
    const bouquetRows = inBouquet.map((type) => {
      const count = bouquet.stems.filter((s) => s.flower === type.id).length;
      const label = flowerLabel(type);
      return el('div', { class: 'row' },
        name(type),
        button(`minus-${type.id}`, '−', () => actions.removeOne(type.id), { class: 'step', 'aria-label': `Remove one ${label}` }, total <= MIN_STEMS),
        el('span', { class: 'count', 'aria-label': `${count} ${label}` }, String(count)),
        button(`more-${type.id}`, '+', () => actions.add(type.id), { class: 'step', 'aria-label': `Add one more ${label}` }, full),
      );
    });

    // The wheel offers only colours some flower comes in. A filter left on a colour that has gone is dropped.
    const families = catalog.families();
    if (!families.some((f) => f.colour.id === this.colourFilter)) this.colourFilter = null;
    const colourFilter = this.colourFilter;
    const offered = catalog.flowers
      .filter((f) => colourFilter === null || f.colours.some((c) => c.id === colourFilter))
      .sort((a, b) => a.name.localeCompare(b.name) || (a.title ?? '').localeCompare(b.title ?? ''));
    hidePreview();
    const addRows = offered.map((type) => {
      const row = el('div', { class: 'row', role: 'listitem' },
        name(type),
        button(`plus-${type.id}`, '+', () => actions.add(type.id, colourFilter ?? undefined), { class: 'step', 'aria-label': `Add one ${flowerLabel(type)}` }, full),
      );
      row.addEventListener('pointerenter', () => showPreview(row, type.id));
      row.addEventListener('focusin', () => showPreview(row, type.id));
      row.addEventListener('pointerleave', hidePreview);
      row.addEventListener('focusout', hidePreview);
      return row;
    });
    const pickColour = (id: string | null) => {
      this.colourFilter = id;
      this.render(state, actions);
      // A different list: start it from the top.
      const list = root.querySelector('.flower-list');
      if (list) list.scrollTop = 0;
    };

    const sections: HTMLElement[] = [
      el('p', { class: 'price', 'data-key': 'price-total' }, `Total $${formatCents(priceBouquet(bouquet, catalog).totalCents)}`),
      this.presetSection(() => this.render(state, actions), actions),
      section('Your bouquet', ...bouquetRows, el('p', { class: 'row' }, `${total} of ${MAX_STEMS} flowers`)),
      section('Add flowers',
        el('p', { class: 'hint' }, 'Pick a colour on the wheel to narrow the list.'),
        colourWheel(families, catalog.flowers.length, colourFilter, pickColour),
        el('div', { class: 'flower-list', role: 'list', 'aria-label': 'Flowers to add' }, ...addRows),
      ),
      section('Shape',
        select('shape', 'Bouquet shape', SHAPES.map((id) => ({ id, name: SHAPE_OF[id].label })), bouquet.shape, (id) => actions.setShape(id as ShapeId)),
      ),
      section('Wrapping',
        select('paper', 'Paper', (Object.keys(PAPER_NAMES) as PaperId[]).map((id) => ({ id, name: PAPER_NAMES[id] })), bouquet.wrap.paper, (id) => actions.setWrap({ paper: id as PaperId })),
        swatches('paper-colour', 'Paper colour', PAPER_COLOURS, bouquet.wrap.paperColour, (id) => actions.setWrap({ paperColour: id })),
        swatches('ribbon-colour', 'Ribbon colour', RIBBON_COLOURS, bouquet.wrap.ribbonColour, (id) => actions.setWrap({ ribbonColour: id })),
        select('bow', 'Bow', (Object.keys(BOW_NAMES) as BowId[]).map((id) => ({ id, name: BOW_NAMES[id] })), bouquet.wrap.bow, (id) => actions.setWrap({ bow: id as BowId })),
        select('greenery', 'Greenery (free)', (Object.keys(GREENERY_NAMES) as GreeneryId[]).map((id) => ({ id, name: GREENERY_NAMES[id] })), bouquet.wrap.greenery, (id) => actions.setWrap({ greenery: id as GreeneryId })),
      ),
    ];

    const stem = bouquet.stems.find((s) => s.id === selectedId);
    const type = stem && catalog.find(stem.flower);
    if (stem && type) {
      sections.push(section(`Selected: ${flowerLabel(type)}`,
        swatches('flower-colour', 'Colour', type.colours, stem.colour, (id) => actions.recolour(id)),
        slider('height', 'Height', -1, 1, stem.height, (v) => actions.previewAdjust({ height: v }), (v) => actions.adjust({ height: v })),
        slider('tilt', 'Tilt', -0.5, 0.5, stem.tilt, (v) => actions.previewAdjust({ tilt: v }), (v) => actions.adjust({ tilt: v })),
        select('swap', 'Swap for', catalog.flowers.map((f) => ({ id: f.id, name: flowerLabel(f) })), stem.flower, (id) => actions.swap(id)),
        button('remove', 'Remove this flower', () => actions.remove(), { class: 'danger' }, total <= MIN_STEMS),
      ));
    } else {
      sections.push(section('Selected flower', el('p', {}, 'Click a flower in the 3D view to change it.')));
    }

    sections.push(section('Actions', el('div', { class: 'actions' },
      button('undo', 'Undo', () => actions.undo(), {}, !state.canUndo),
      button('redo', 'Redo', () => actions.redo(), {}, !state.canRedo),
      button('rearrange', 'Re-arrange', () => actions.rearrange()),
      button('reset-view', 'Reset view', () => actions.resetView()),
    )));

    sections.push(section('About', el('a', { href: `${import.meta.env.BASE_URL}credits.html` }, 'Model credits')));

    root.replaceChildren(...sections);
    // The list is rebuilt on every change; keep it where the user had scrolled to.
    const list = root.querySelector('.flower-list');
    if (list) list.scrollTop = listScroll;
    if (focusedKey) root.querySelector<HTMLElement | SVGElement>(`[data-key="${focusedKey}"]`)?.focus();
  }

  dispose(): void {
    this.root.replaceChildren();
  }

  private presetSection(rerender: () => void, actions: PanelActions): HTMLElement {
    const { featured, others } = this.presets;
    const presetButton = (p: Preset, cls: string) =>
      button(`preset-${p.id}`, p.name, () => actions.loadPreset(p.id), { class: cls, title: `${p.occasion}. ${p.evidence}` });
    const random = button('preset-random', RANDOM_OPENS_LIST ? (this.presetListOpen ? 'Random ▴' : 'Random ▾') : 'Random', () => {
      if (!RANDOM_OPENS_LIST) {
        actions.loadPreset(others[Math.floor(Math.random() * others.length)].id);
        return;
      }
      this.presetListOpen = !this.presetListOpen;
      rerender();
    }, { class: 'preset', 'aria-expanded': String(RANDOM_OPENS_LIST && this.presetListOpen) });
    const list = RANDOM_OPENS_LIST && this.presetListOpen
      ? [el('div', { class: 'preset-list', role: 'list', 'aria-label': 'More presets' },
        ...others.map((p) => el('div', { role: 'listitem' }, presetButton(p, 'preset-option'), el('small', {}, p.occasion))))]
      : [];
    return section('Presets',
      el('p', { class: 'hint' }, 'Start from a favourite bouquet. Replaces the current design; Undo brings it back.'),
      el('div', { class: 'presets' }, ...featured.map((p) => presetButton(p, 'preset')), random),
      ...list,
    );
  }
}
