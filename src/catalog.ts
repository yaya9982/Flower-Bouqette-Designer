import { GENERATED_FLOWERS } from './catalog.generated';

export interface NamedColour {
  id: string;
  name: string;
  hex: string;
}

export type FlowerColour = NamedColour;

export interface FlowerType {
  id: string;
  name: string;
  /** The model's own title, to tell apart several flowers of one kind. */
  title?: string;
  /** File name under public/models, or null to draw the built-in stand-in flower. */
  model: string | null;
  /** Substring of the material name to tint. Absent means the model cannot be recoloured. */
  petalMaterial?: string;
  /** Scale applied to the model so its head matches headDiameter. Default 1. */
  modelScale?: number;
  /** Height of the head centre in the model's own units, before scaling. Default 0. */
  modelHeadY?: number;
  /** Metres. */
  headDiameter: number;
  /** Metres. */
  stemLength: number;
  /** Real-world colours only. At least one. */
  colours: FlowerColour[];
  /** Not shown in the first version. */
  price?: number;
  credit?: { author: string; licence: string; url: string };
}

/** A row of catalog.generated.ts: a downloaded model that keeps its own colours, so it has exactly one colour. */
export interface GeneratedFlower {
  id: string;
  name: string;
  title: string;
  model: string;
  /** Id of one of COLOUR_FAMILIES. */
  colour: string;
  headDiameter: number;
  stemLength: number;
  author: string;
  licence: string;
  url: string;
}

/**
 * The colours of the wheel that filters the flower list, in the order they sit around it.
 * A flower belongs to a family when one of its colours has the family's id.
 */
export const COLOUR_FAMILIES: NamedColour[] = [
  { id: 'red', name: 'Red', hex: '#c8242b' },
  { id: 'orange', name: 'Orange', hex: '#f08a2e' },
  { id: 'yellow', name: 'Yellow', hex: '#f4d03f' },
  { id: 'green', name: 'Green', hex: '#7fa650' },
  { id: 'blue', name: 'Blue', hex: '#4f7fd1' },
  { id: 'purple', name: 'Purple', hex: '#7a4fa3' },
  { id: 'pink', name: 'Pink', hex: '#ef9ab2' },
  { id: 'cream', name: 'Cream', hex: '#f3d7b6' },
  { id: 'white', name: 'White', hex: '#f7f3ea' },
  { id: 'multicolour', name: 'Mixed', hex: '#b9b2a6' },
];

/** The first six can be recoloured. Their order matters: the starting bouquet uses the first three. */
const TINTABLE_FLOWERS: FlowerType[] = [
  {
    id: 'rose', name: 'Rose', model: 'rose.glb', petalMaterial: 'petal',
    credit: { author: 'Asia Matusik', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/2371d8b532664ec7a6e6536091f9e093' },
    headDiameter: 0.07, stemLength: 0.45,
    colours: [
      { id: 'red', name: 'Red', hex: '#b3202a' },
      { id: 'white', name: 'White', hex: '#f6f1e7' },
      { id: 'pink', name: 'Pink', hex: '#e8a0b4' },
      { id: 'yellow', name: 'Yellow', hex: '#f2cf4a' },
      // Garden-rose shades the presets use.
      { id: 'cream', name: 'Cream', hex: '#f1dcc0' },
      { id: 'orange', name: 'Orange', hex: '#ec8a3c' },
      { id: 'purple', name: 'Lavender', hex: '#a98bc4' },
    ],
  },
  {
    id: 'tulip', name: 'Tulip', model: 'tulip.glb', petalMaterial: 'petal',
    credit: { author: 'Senetin', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/e27ce03d41c14949bc147983b818c242' },
    headDiameter: 0.05, stemLength: 0.4,
    colours: [
      { id: 'red', name: 'Red', hex: '#c8242b' },
      { id: 'yellow', name: 'Yellow', hex: '#f4d03f' },
      { id: 'pink', name: 'Pink', hex: '#ef9ab2' },
      { id: 'white', name: 'White', hex: '#f7f3ea' },
      { id: 'purple', name: 'Purple', hex: '#6c3f8f' },
    ],
  },
  {
    id: 'daisy', name: 'Daisy', model: 'daisy.glb', petalMaterial: 'petal',
    credit: { author: 'Anežka Hájková', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/11c17847f9804d559974b7c97cd63a6f' },
    headDiameter: 0.1, stemLength: 0.45,
    colours: [
      { id: 'white', name: 'White', hex: '#f8f4ea' },
      { id: 'yellow', name: 'Yellow', hex: '#f2c230' },
      { id: 'pink', name: 'Pink', hex: '#f0a3bc' },
      // Stands in for orange gerberas in the presets.
      { id: 'orange', name: 'Orange', hex: '#f28a3a' },
    ],
  },
  {
    id: 'lily', name: 'Lily', model: 'lily.glb', petalMaterial: 'petal',
    credit: { author: 'laanita', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/f904c01714f8433f9c37795d44a73346' },
    headDiameter: 0.12, stemLength: 0.55,
    colours: [
      { id: 'white', name: 'White', hex: '#f7f4ec' },
      { id: 'pink', name: 'Pink', hex: '#e79ab0' },
      { id: 'orange', name: 'Orange', hex: '#f08a2e' },
    ],
  },
  {
    id: 'sunflower', name: 'Sunflower', model: 'sunflower.glb',
    credit: { author: 'zvanstone', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/3a9514b8df044abe809432201b8f1c6e' },
    headDiameter: 0.14, stemLength: 0.6,
    colours: [{ id: 'yellow', name: 'Yellow', hex: '#f4b81f' }],
  },
  {
    id: 'carnation', name: 'Carnation', model: 'carnation.glb', petalMaterial: 'petal',
    credit: { author: 'GardenBee', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/1f051fc353e746869844ca45412c850b' },
    headDiameter: 0.06, stemLength: 0.45,
    colours: [
      { id: 'red', name: 'Red', hex: '#c0222f' },
      { id: 'pink', name: 'Pink', hex: '#f2a3bd' },
      { id: 'white', name: 'White', hex: '#f7f2ea' },
      { id: 'fuchsia', name: 'Fuchsia', hex: '#d8336d' },
    ],
  },
];

function fromGenerated(row: GeneratedFlower): FlowerType {
  const family = COLOUR_FAMILIES.find((c) => c.id === row.colour) ?? COLOUR_FAMILIES[COLOUR_FAMILIES.length - 1];
  return {
    id: row.id, name: row.name, title: row.title, model: row.model,
    headDiameter: row.headDiameter, stemLength: row.stemLength,
    colours: [family],
    credit: { author: row.author, licence: row.licence, url: row.url },
  };
}

export const FLOWERS: FlowerType[] = [...TINTABLE_FLOWERS, ...GENERATED_FLOWERS.map(fromGenerated)];

export const PAPER_COLOURS: NamedColour[] = [
  { id: 'kraft', name: 'Kraft brown', hex: '#b88a5a' },
  { id: 'white', name: 'White', hex: '#f4f1ea' },
  { id: 'blush', name: 'Blush', hex: '#f1c9cf' },
  { id: 'sage', name: 'Sage', hex: '#a9b89b' },
  { id: 'black', name: 'Black', hex: '#2b2b2b' },
  { id: 'red', name: 'Red', hex: '#b3202a' },
];

export const RIBBON_COLOURS: NamedColour[] = [
  { id: 'ivory', name: 'Ivory', hex: '#f3ead8' },
  { id: 'red', name: 'Red', hex: '#b3202a' },
  { id: 'blush', name: 'Blush', hex: '#e7a6b5' },
  { id: 'gold', name: 'Gold', hex: '#c9a34a' },
  { id: 'navy', name: 'Navy', hex: '#23355c' },
  { id: 'sage', name: 'Sage', hex: '#8fa37e' },
  { id: 'lilac', name: 'Lilac', hex: '#b9a2d6' },
  { id: 'orange', name: 'Burnt orange', hex: '#c8692b' },
];
