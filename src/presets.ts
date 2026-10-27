import type { Bouquet, BouquetEditor, Wrap } from './bouquet';
import { DEFAULT_HEIGHT, SHAPE_OF, type ShapeId } from './shapes';

/**
 * Ready-made bouquets, most praised first. Each one was found by the bouquet research of 14 October 2026
 * (florist bestseller pages with their review counts, florist-school recipes, flower-farm and gardening guides).
 * The pages give the flowers and, for the school recipes, the stem counts and where each kind goes; none of
 * the photos could be measured, so the exact angles below follow the hand-tied rules those pages describe:
 * focal flowers low in the centre, rings of supporting flowers, airy flowers higher and at the edge.
 */
export interface Preset {
  id: string;
  name: string;
  occasion: string;
  /** Why it is in the list: ratings, reviews or how many independent sources describe it. */
  evidence: string;
  sources: string[];
  shape: ShapeId;
  wrap: Wrap;
  groups: Group[];
}

/**
 * `n` flowers of one kind and colour, spread evenly. `d`: distance from the centre, 0 to 1. `h`: how far above
 * (+) or below (-) the usual head height, -1 to 1. `at`: degrees around the bouquet as seen from the front,
 * 0 = front, 90 = right. `arc`: spread in degrees, centred on `at`; 360 (the default) is a full ring.
 * `tilt`: degrees the heads lean outward.
 */
interface Group { f: string; c: string; n: number; d: number; h?: number; at?: number; arc?: number; tilt?: number }

// Downloaded models used by the presets, by the flower they stand for.
const GYPSOPHILA = 'sf-b68014eb';
const PEONY_PINK = 'sf-362706d5';
const PEONY_PALE = 'sf-6bee135a';
const SWEET_PEA = 'sf-29647af1';
const SNAPDRAGON = 'sf-b4a95a86';
const POPPY = 'sf-380d82c4';
const ANEMONE = 'sf-cec4f820';
const RANUNCULUS = 'sf-1a64e959'; // buttercup, the stand-in for ranunculus
const AMARYLLIS = 'sf-e45f6bc4';
const ORCHID_WHITE = 'sf-6e6e2ac8';
const ORCHID_PINK = 'sf-ed453cd6';
const HIBISCUS = 'sf-8269e998';
const ANTHURIUM = 'sf-ffa20acb';
const CALLA = 'sf-b57fa97a';
const DAFFODIL = 'sf-5cd42ff7';
const FOXGLOVE = 'sf-9b19bdfd';

const BIRD_OF_PARADISE = 'sf-afe94ccf';
const HYDRANGEA_BLUE = 'sf-69fd19ab';
const HYDRANGEA_PURPLE = 'sf-8fa5ec6b';
const DAHLIA_ORANGE = 'sf-81b1cd4e';
const DAHLIA_PINK = 'sf-1df48628';
const MARIGOLD = 'sf-d813ac09';
const GERANIUM_PURPLE = 'sf-e2b49bd9';
const AGAPANTHUS_BLUE = 'sf-7625bba6';
const HYACINTH_BLUE = 'sf-ed1b7c7c';
const BUGLOSS = 'sf-a2b8399f';
const DELPHINIUM_PURPLE = 'sf-c3bad860';
const CHRYSANTHEMUM_ORANGE = 'sf-c501f8c4';

// Presets show their flowers as researched, so they add no greenery; the customer can add some.
const kraft = (ribbon: string): Wrap => ({ paper: 'kraft', paperColour: 'kraft', ribbonColour: ribbon, bow: 'ribbon', greenery: 'none' });
const paper = (kind: 'matte' | 'tissue', colour: string, ribbon: string): Wrap => ({ paper: kind, paperColour: colour, ribbonColour: ribbon, bow: 'ribbon', greenery: 'none' });
const bare = (ribbon: string): Wrap => ({ paper: 'none', paperColour: 'white', ribbonColour: ribbon, bow: 'ribbon', greenery: 'none' });

export const PRESETS: Preset[] = [
  {
    id: 'red-roses-gypsophila', name: "Red Roses & Baby's Breath", occasion: "Valentine's, anniversary",
    evidence: "Described by 4 of the 5 researchers. Roses are over 80% of Valentine's flowers (Society of American Florists, via Thursd); baby's breath is the standard filler with them.",
    sources: ['https://thursd.com/articles/gypsophila-a-valentines-day-must-have', 'https://www.floraldesigninstitute.com/blogs/flower-school-video-library/miss-america-style-arm-bouquet'],
    shape: 'round', wrap: paper('tissue', 'red', 'red'),
    groups: [
      { f: 'rose', c: 'red', n: 1, d: 0, h: 0.15 },
      { f: 'rose', c: 'red', n: 5, d: 0.34, h: 0.1 },
      { f: GYPSOPHILA, c: 'white', n: 5, d: 0.36, h: 0.15, at: 36 },
      { f: 'rose', c: 'red', n: 8, d: 0.68, at: 22 },
      { f: GYPSOPHILA, c: 'white', n: 8, d: 0.7, h: 0.1, at: 0 },
      { f: GYPSOPHILA, c: 'white', n: 6, d: 0.96, h: 0.05, at: 30, tilt: 15 },
    ],
  },
  {
    id: 'pink-roses-carnations', name: 'Sweet Pink Roses & Carnations', occasion: "Birthday, Mother's Day",
    evidence: 'FTD Sweet & Pretty 4.7 stars from 207 reviews; FTD You\'re Precious 4.7 from 163; UrbanStems The Unicorn 4.7 from 349.',
    sources: ['https://sendflowers.io/florists/ftd/products/b35d', 'https://sendflowers.io/florists/ftd/products/ypb', 'https://urbanstems.com/blogs/news/top-mothers-day-flowers', 'https://www.moysesflowers.co.uk/pink-panther/'],
    shape: 'round', wrap: bare('sage'),
    groups: [
      { f: 'rose', c: 'pink', n: 1, d: 0, h: 0.1 },
      { f: 'carnation', c: 'fuchsia', n: 3, d: 0.26, at: 0 },
      { f: 'rose', c: 'pink', n: 3, d: 0.28, h: 0.05, at: 60 },
      { f: 'carnation', c: 'pink', n: 5, d: 0.55, at: 0 },
      { f: 'rose', c: 'pink', n: 5, d: 0.56, at: 36 },
      { f: 'carnation', c: 'fuchsia', n: 6, d: 0.84, at: 0, tilt: 10 },
      { f: 'carnation', c: 'pink', n: 6, d: 0.86, at: 30, tilt: 10 },
    ],
  },
  {
    id: 'peony-rose', name: 'Blush Peonies & Garden Roses', occasion: 'Wedding, Mother\'s Day',
    evidence: 'UrbanStems The Peony, 452 reviews; Floret\'s June peony bridal bouquet; peonies and roses top 4 bridal-flower lists.',
    sources: ['https://urbanstems.com/blogs/news/top-mothers-day-flowers', 'https://www.floretflowers.com/peony-season-is-upon-us/', 'https://www.inspiredbride.net/bright-and-fresh-retro-wedding/', 'https://makingdream.ca/shop/peonies-and-pink-roses-bridal-bouquet/'],
    shape: 'round', wrap: bare('blush'),
    groups: [
      { f: PEONY_PINK, c: 'pink', n: 1, d: 0, h: 0.25 },
      { f: 'rose', c: 'pink', n: 4, d: 0.26, h: 0.1, at: 0 },
      { f: PEONY_PINK, c: 'pink', n: 4, d: 0.46, h: 0.15, at: 45 },
      { f: 'rose', c: 'pink', n: 8, d: 0.72, at: 22 },
      { f: PEONY_PINK, c: 'pink', n: 3, d: 0.9, h: 0.05, at: 0, tilt: 10 },
      { f: 'rose', c: 'pink', n: 3, d: 0.94, at: 60, tilt: 12 },
    ],
  },
  {
    id: 'classic-romance', name: 'Classic Romance: Roses & Lilies', occasion: 'Anniversary',
    evidence: 'Lafayette Florist Classic Romance; Teleflora pink rose and Asiatic lily; 1-800-Flowers pink rose and lily, about 108 reviews.',
    sources: ['https://lafayetteflorist.com/flowers/lafayette-florist-classic-romance', 'https://sendflowers.io/florists/teleflora/products/t52-1'],
    shape: 'round', wrap: bare('red'),
    groups: [
      { f: 'rose', c: 'red', n: 1, d: 0, h: 0.2 },
      { f: 'lily', c: 'pink', n: 2, d: 0.57, h: 0.35, at: 0, arc: 100 },
      { f: 'lily', c: 'pink', n: 1, d: 0.42, h: 0.55, at: 180 },
      { f: 'rose', c: 'red', n: 4, d: 0.3, h: 0.15, at: 135, arc: 150 },
      { f: 'rose', c: 'pink', n: 6, d: 0.57, h: 0.1, at: 180, arc: 200 },
      { f: 'carnation', c: 'white', n: 3, d: 0.4, h: -0.1, at: 0, arc: 70 },
      { f: GYPSOPHILA, c: 'white', n: 8, d: 0.88, h: 0, at: 22, tilt: 15 },
    ],
  },
  {
    id: 'red-rose-white-lily', name: 'Passion & Purity', occasion: 'Anniversary, romance',
    evidence: 'Red rose with white lily is the most-cited classic pairing in florist guides (Bloomsybox and others; 2 researchers).',
    sources: ['https://www.bloomsybox.com/what-are-some-popular-flower-combinations-for-mixed-bouquets', 'https://www.interflora.co.nz/p-infinite-tenderness-tendresse-infinie-417675', 'https://sendflowers.io/florists/teleflora/products/tev60-9'],
    shape: 'round', wrap: kraft('ivory'),
    groups: [
      { f: 'lily', c: 'white', n: 1, d: 0.05, h: 0.45, at: 180 },
      { f: 'lily', c: 'white', n: 2, d: 0.45, h: 0.25, at: 0, arc: 140 },
      { f: 'rose', c: 'red', n: 4, d: 0.36, at: 180, arc: 210 },
      { f: 'rose', c: 'red', n: 8, d: 0.62, at: 22 },
      { f: 'rose', c: 'pink', n: 5, d: 0.88, at: 0, tilt: 12 },
      { f: GYPSOPHILA, c: 'white', n: 5, d: 0.87, h: 0, at: 36, tilt: 15 },
    ],
  },
  {
    id: 'sunflower-daisy', name: 'Sunshine: Sunflowers & Daisies', occasion: 'Get well, thank you',
    evidence: 'UrbanStems The Optimist and The Citron; Direct2florist and ProFlowers name sunflowers, gerberas and daisies as the best get-well flowers.',
    sources: ['https://urbanstems.com/blogs/news/top-mothers-day-flowers', 'https://direct2florist.co.uk/blog/guides/popular-get-well-soon-flowers/', 'https://proflowers.com/blog/tips-for-choosing-get-well-flowers', 'https://www.bourguignonfloristas.es/en/bouquet-sunflowers-daisies/', 'https://sendflowers.io/florists/proflowers/products/v5519d'],
    shape: 'loose', wrap: bare('gold'),
    groups: [
      { f: 'daisy', c: 'yellow', n: 3, d: 0.15, h: 0.1 },
      { f: 'daisy', c: 'yellow', n: 5, d: 0.42, at: 0, arc: 130 },
      { f: 'sunflower', c: 'yellow', n: 2, d: 0.45, h: 0.15, at: 180, arc: 120 },
      { f: 'rose', c: 'yellow', n: 4, d: 0.72, h: 0.15, at: 180, arc: 150 },
      { f: 'sunflower', c: 'yellow', n: 3, d: 0.85, at: 0, arc: 140 },
      { f: 'daisy', c: 'white', n: 4, d: 0.96, at: 180, arc: 90, tilt: 15 },
    ],
  },
  {
    id: 'rose-sunflower', name: 'Sunflowers & Red Roses', occasion: 'Birthday, friendship',
    evidence: 'Called a classic, bold pairing in 3 or more florist blogs (2 researchers).',
    sources: ['https://www.bloomsybox.com/what-are-some-popular-flower-combinations-for-mixed-bouquets'],
    shape: 'round', wrap: bare('red'),
    groups: [
      { f: 'carnation', c: 'white', n: 2, d: 0.1, h: 0.05 },
      { f: 'sunflower', c: 'yellow', n: 3, d: 0.38, h: 0.1, at: 30 },
      { f: 'rose', c: 'red', n: 3, d: 0.36, at: 90 },
      { f: 'rose', c: 'yellow', n: 6, d: 0.66, at: 0 },
      { f: 'rose', c: 'red', n: 6, d: 0.7, at: 30 },
      { f: 'sunflower', c: 'yellow', n: 2, d: 0.95, at: 60, arc: 180, tilt: 10 },
    ],
  },
  {
    id: 'spring-tulips', name: 'Spring Tulip Bunch', occasion: "Spring, Mother's Day",
    evidence: '1-800-Flowers Assorted Tulips named a top Mother\'s Day seller; Bloom & Wild florist\'s pick 4.84 from 61 reviews; tulip searches up 127% (Arena Flowers).',
    sources: ['https://urbanstems.com/blogs/news/top-mothers-day-flowers', 'https://www.bloomandwild.com/send-flowers/send/our-florist-s-pick-2603/77992'],
    shape: 'round', wrap: kraft('ivory'),
    groups: [
      { f: 'tulip', c: 'pink', n: 1, d: 0, h: 0.2 },
      { f: 'tulip', c: 'red', n: 4, d: 0.28, h: 0.15, at: 0 },
      { f: 'tulip', c: 'white', n: 4, d: 0.3, h: 0.15, at: 45 },
      { f: 'tulip', c: 'pink', n: 8, d: 0.6, h: 0.05, at: 0 },
      { f: 'tulip', c: 'red', n: 4, d: 0.62, h: 0.05, at: 22 },
      { f: 'tulip', c: 'white', n: 6, d: 0.88, at: 30, tilt: 15 },
      { f: 'tulip', c: 'pink', n: 6, d: 0.9, at: 0, tilt: 18 },
    ],
  },
  {
    id: 'white-yellow-roses', name: 'Sunny Roses', occasion: 'Birthday, congratulations',
    evidence: 'Marks & Spencer Fairtrade rose bouquet, 4.2 stars from 620 reviews: 6 white roses, 6 yellow roses and 10 alstroemeria (daisies stand in).',
    sources: ['https://www.marksandspencer.com/fairtrade-rose-and-alstroemeria-bouquet/p/p60020552'],
    shape: 'round', wrap: kraft('gold'),
    groups: [
      { f: 'rose', c: 'yellow', n: 3, d: 0.3, h: 0.1, at: 0 },
      { f: 'rose', c: 'white', n: 3, d: 0.3, h: 0.1, at: 60 },
      { f: 'daisy', c: 'yellow', n: 5, d: 0.62, at: 0 },
      { f: 'daisy', c: 'white', n: 5, d: 0.62, at: 36 },
      { f: 'rose', c: 'yellow', n: 3, d: 0.9, at: 30, tilt: 10 },
      { f: 'rose', c: 'white', n: 3, d: 0.9, at: 90, tilt: 10 },
    ],
  },
  {
    id: 'red-pink-roses', name: 'Red & Pink Roses', occasion: "Romance, Mother's Day",
    evidence: 'UrbanStems The Verona, best seller, 4.4 stars from 510 reviews.',
    sources: ['https://urbanstems.com/blogs/news/top-mothers-day-flowers'],
    shape: 'round', wrap: bare('red'),
    groups: [
      { f: 'rose', c: 'red', n: 1, d: 0, h: 0.15 },
      { f: 'rose', c: 'red', n: 3, d: 0.25, h: 0.1, at: 0 },
      { f: 'rose', c: 'pink', n: 3, d: 0.25, h: 0.1, at: 60 },
      { f: 'rose', c: 'red', n: 5, d: 0.52, at: 18 },
      { f: 'rose', c: 'pink', n: 5, d: 0.52, at: 54 },
      { f: 'rose', c: 'red', n: 6, d: 0.8, at: 0, tilt: 8 },
      { f: 'rose', c: 'pink', n: 6, d: 0.8, at: 30, tilt: 8 },
    ],
  },
  {
    id: 'peaceful-whites', name: 'Peaceful Whites', occasion: 'Sympathy',
    evidence: 'UrbanStems The Peace, 4.7 stars from 187 reviews; white lilies, roses and carnations are the traditional sympathy flowers (Bloomsybox, Instacart).',
    sources: ['https://urbanstems.com/blogs/news/top-mothers-day-flowers', 'https://bloomsybox.com/blog/posts/flowers-to-express-sympathy-and-support'],
    shape: 'round', wrap: kraft('ivory'),
    groups: [
      { f: 'lily', c: 'white', n: 2, d: 0.3, h: 0.3, at: 0, arc: 70 },
      { f: 'lily', c: 'white', n: 2, d: 0.42, h: 0.55, at: 200, arc: 60 },
      { f: 'rose', c: 'white', n: 4, d: 0.52, at: 270, arc: 90 },
      { f: 'rose', c: 'white', n: 2, d: 0.55, at: 100, arc: 50 },
      { f: 'carnation', c: 'white', n: 6, d: 0.82, at: 30 },
      { f: GYPSOPHILA, c: 'white', n: 5, d: 0.97, at: 0, tilt: 15 },
    ],
  },
  {
    id: 'hydrangea-rose-bridal', name: 'Ivory Garden Rose Bridal', occasion: 'Wedding',
    evidence: 'Flower Moxie classic hydrangea bridal recipe (6-7 hydrangea, 8-9 garden roses); the same pairing at 1-800-Flowers and Kabloom. The designer\'s white hydrangea model is too rough, so white carnations stand in for the hydrangea.',
    sources: ['https://flowermoxie.com/products/classic-hydrangea-bridal-bouquet'],
    shape: 'round', wrap: bare('ivory'),
    groups: [
      { f: 'rose', c: 'cream', n: 1, d: 0, h: 0.15 },
      { f: 'rose', c: 'cream', n: 5, d: 0.36, h: 0.1, at: 0, arc: 200 },
      { f: 'carnation', c: 'white', n: 3, d: 0.42, at: 180, arc: 100 },
      { f: 'carnation', c: 'white', n: 8, d: 0.7, at: 22 },
      { f: 'rose', c: 'cream', n: 4, d: 0.72, at: 0 },
      { f: GYPSOPHILA, c: 'white', n: 4, d: 0.97, at: 45, tilt: 15 },
    ],
  },
  {
    id: 'white-carnation-cloud', name: "White Carnations & Baby's Breath", occasion: 'Wedding, sympathy',
    evidence: 'A bridal and sympathy staple in florist guides (2 researchers); winter carnation bouquets on Rooted Revival.',
    sources: ['https://windflowerflorist.com/blogs/news/flowers-that-go-well-with-carnations', 'https://rootedrevival.com/10-winter-flower-arrangements-that-instantly-transform-any-room/'],
    shape: 'round', wrap: paper('tissue', 'white', 'blush'),
    groups: [
      { f: 'carnation', c: 'white', n: 1, d: 0, h: 0.05 },
      { f: 'carnation', c: 'white', n: 6, d: 0.28 },
      { f: 'carnation', c: 'white', n: 12, d: 0.6, at: 15 },
      { f: GYPSOPHILA, c: 'white', n: 6, d: 0.86, h: -0.2, at: 30, tilt: 10 },
    ],
  },
  {
    id: 'romantic-blush', name: 'Romantic Blush', occasion: 'Wedding',
    evidence: 'Floral Design Institute romantic wedding bouquet: 7 garden roses, 7 blush carnations, 7 ranunculus, 7 lisianthus, 5 Queen Anne\'s lace.',
    sources: ['https://floraldesigninstitute.com/blogs/flower-school-video-library/romantic-wedding-bouquet'],
    shape: 'round', wrap: bare('blush'),
    groups: [
      { f: 'rose', c: 'pink', n: 3, d: 0.15, h: 0.2 },
      { f: 'rose', c: 'cream', n: 4, d: 0.42, h: 0.1, at: 60 },
      { f: 'carnation', c: 'white', n: 6, d: 0.72, at: 0 },
      { f: 'rose', c: 'pink', n: 3, d: 0.72, at: 30, arc: 240 },
      { f: GYPSOPHILA, c: 'white', n: 4, d: 0.97, h: 0.1, at: 45, tilt: 18 },
    ],
  },
  {
    id: 'cottage-garden', name: 'Cottage Garden', occasion: 'Summer, cottage style',
    evidence: 'French Country Cottage garden arrangement and Floret\'s May bouquet; described by 2 researchers.',
    sources: ['https://www.frenchcountrycottage.net/cottage-garden-flower-arrangement/', 'https://floretflowers.com/the-seasonal-flower-alliance-may-15'],
    shape: 'loose', wrap: paper('matte', 'white', 'sage'),
    groups: [
      { f: DAHLIA_PINK, c: 'pink', n: 3, d: 0.3, h: 0.05, at: 60 },
      { f: 'tulip', c: 'purple', n: 2, d: 0.25, h: 0.55, at: 200, arc: 140 },
      { f: FOXGLOVE, c: 'pink', n: 1, d: 0.5, h: 0.9, at: 120 },
      { f: DELPHINIUM_PURPLE, c: 'purple', n: 2, d: 0.45, h: 0.8, at: 250, arc: 60 },
      { f: ANEMONE, c: 'white', n: 3, d: 0.5, at: 150, arc: 120 },
      { f: 'rose', c: 'white', n: 8, d: 0.78, h: -0.15, at: 0, tilt: 15 },
    ],
  },
  {
    id: 'farm-market', name: 'Farmers-Market Summer Bunch', occasion: 'Summer',
    evidence: 'Team Flower retail and farmers-market bouquet lesson (zinnias and cosmos); sunflower, zinnia and cosmos named the summer staples by flower farms.',
    sources: ['https://education.teamflower.org/learn/design/ssl/video-making-bouquets-for-retail-or-farmers-market', 'https://www.epicgardening.com/plant-summer-bouquet/'],
    shape: 'round', wrap: kraft('red'),
    groups: [
      { f: DAHLIA_ORANGE, c: 'orange', n: 1, d: 0, h: 0.15 },
      { f: 'daisy', c: 'pink', n: 4, d: 0.32, at: 0 },
      { f: 'sunflower', c: 'yellow', n: 4, d: 0.38, h: 0.05, at: 45 },
      { f: GYPSOPHILA, c: 'white', n: 6, d: 0.62, at: 0 },
      { f: DAHLIA_ORANGE, c: 'orange', n: 3, d: 0.7, at: 30, arc: 240 },
      { f: 'daisy', c: 'pink', n: 4, d: 0.86, at: 45, tilt: 10 },
      { f: MARIGOLD, c: 'orange', n: 4, d: 0.9, at: 0, tilt: 12 },
      { f: GYPSOPHILA, c: 'white', n: 4, d: 0.98, h: 0.05, at: 22, tilt: 15 },
    ],
  },
  {
    id: 'wildflower', name: 'Wildflower Meadow', occasion: 'Spring, early summer',
    evidence: 'Floral Design Institute wildflower hand-tied bouquet (40 stems, focal cluster in the centre); airy wildflower styles named a 2025 trend.',
    sources: ['https://www.floraldesigninstitute.com/blogs/flower-school-video-library/wildflower-hand-tied-bouquet', 'https://commons.wikimedia.org/wiki/File:Field_flowers_-_2015.jpg', 'https://commons.wikimedia.org/wiki/File:Feldblumenstrau%C3%9F_-_Veld_bloemen_boeket.jpg'],
    shape: 'loose', wrap: kraft('ivory'),
    groups: [
      { f: BUGLOSS, c: 'blue', n: 3, d: 0.2, h: 0.8 },
      { f: FOXGLOVE, c: 'pink', n: 2, d: 0.38, h: 0.9, at: 180, arc: 90 },
      { f: 'daisy', c: 'white', n: 8, d: 0.58, at: 20 },
      { f: POPPY, c: 'red', n: 4, d: 0.75, h: 0.1, at: 270, arc: 120 },
      { f: RANUNCULUS, c: 'yellow', n: 3, d: 0.82, at: 90, arc: 90 },
      { f: GYPSOPHILA, c: 'white', n: 5, d: 0.97, h: 0.15, at: 0, tilt: 20 },
    ],
  },
  {
    id: 'spring-garden', name: 'Spring Garden', occasion: 'Spring',
    evidence: 'Floral Design Institute colourful spring hand-tied (tulips, paperwhites, ranunculus); Teleflora Springtime\'s Here (tulips and daffodils).',
    sources: ['https://www.floraldesigninstitute.com/blogs/flower-school-video-library/colorful-spring-hand-tied-bouquet', 'https://sendflowers.io/florists/teleflora/products/tsp02-1'],
    shape: 'round', wrap: kraft('sage'),
    groups: [
      { f: DAFFODIL, c: 'yellow', n: 1, d: 0, h: 0.35 },
      { f: 'tulip', c: 'pink', n: 4, d: 0.3, h: 0.1, at: 0 },
      { f: DAFFODIL, c: 'yellow', n: 4, d: 0.45, h: 0.3, at: 45 },
      { f: HYACINTH_BLUE, c: 'blue', n: 4, d: 0.65, at: 0 },
      { f: 'carnation', c: 'pink', n: 8, d: 0.88, at: 22, tilt: 12 },
    ],
  },
  {
    id: 'autumn-citrus', name: 'Autumn Citrus', occasion: 'Autumn',
    evidence: 'Jerome Florists (New York) Erly Sunset and Fall in Love bouquets: orange and yellow roses, callas, small sunflowers, kraft wrap.',
    sources: ['https://jeromeflorists.com/blogs/news/autumn-flower-bouquet-2025'],
    shape: 'round', wrap: kraft('blush'),
    groups: [
      { f: 'rose', c: 'orange', n: 1, d: 0, h: 0.1 },
      { f: 'rose', c: 'orange', n: 4, d: 0.3, h: 0.05, at: 0 },
      { f: MARIGOLD, c: 'orange', n: 4, d: 0.32, h: 0.05, at: 45 },
      { f: 'rose', c: 'cream', n: 3, d: 0.58, at: 60 },
      { f: MARIGOLD, c: 'orange', n: 3, d: 0.6, at: 0 },
      { f: ORCHID_WHITE, c: 'white', n: 2, d: 0.82, h: -0.15, at: 0, arc: 60 },
      { f: CALLA, c: 'red', n: 4, d: 0.85, h: 0.25, at: 180, arc: 240 },
      { f: 'rose', c: 'orange', n: 2, d: 0.85, at: 0, arc: 150 },
    ],
  },
  {
    id: 'autumn-harvest', name: 'Autumn Harvest', occasion: 'Autumn',
    evidence: 'Farm and florist autumn guides: sunflowers, chrysanthemums, asters and zinnias (2 researchers).',
    sources: ['https://jeromeflorists.com/blogs/news/autumn-flower-bouquet-2025'],
    shape: 'round', wrap: kraft('orange'),
    groups: [
      { f: 'sunflower', c: 'yellow', n: 1, d: 0, h: 0.1 },
      { f: 'rose', c: 'yellow', n: 4, d: 0.36, at: 0 },
      { f: 'rose', c: 'orange', n: 4, d: 0.4, at: 45 },
      { f: DAHLIA_ORANGE, c: 'orange', n: 3, d: 0.64, at: 15 },
      { f: MARIGOLD, c: 'orange', n: 3, d: 0.72, at: 80 },
      { f: 'tulip', c: 'yellow', n: 4, d: 0.5, h: 0.3, at: 0, arc: 240 },
      { f: 'rose', c: 'yellow', n: 4, d: 0.86, at: 0, tilt: 10 },
      { f: CHRYSANTHEMUM_ORANGE, c: 'orange', n: 4, d: 0.9, at: 45, tilt: 10 },
    ],
  },
  {
    id: 'winter-amaryllis', name: 'Winter Amaryllis', occasion: 'Christmas, winter',
    evidence: 'Rooted Revival and Livingetc winter arrangements: three amaryllis, one taller in the centre, with white flowers and evergreens.',
    sources: ['https://rootedrevival.com/10-winter-flower-arrangements-that-instantly-transform-any-room/', 'https://livingetc.com/advice/best-winter-foliage', 'https://somethingturquoise.com/2014/12/18/diy-red-christmas-wedding-bouquet/', 'https://www.flowers.nl/contents/en-us/p1013.html'],
    shape: 'round', wrap: bare('red'),
    groups: [
      { f: AMARYLLIS, c: 'red', n: 2, d: 0.28, h: 0.2, at: 0, arc: 110 },
      { f: AMARYLLIS, c: 'red', n: 1, d: 0.55, h: -0.1, at: 0 },
      { f: 'rose', c: 'red', n: 5, d: 0.42, h: 0.25, at: 180, arc: 160 },
      { f: 'carnation', c: 'pink', n: 4, d: 0.7, at: 0, arc: 160 },
      { f: 'carnation', c: 'red', n: 5, d: 0.86, at: 180, arc: 240, tilt: 10 },
    ],
  },
  {
    id: 'winter-white', name: 'Winter White Roses', occasion: 'Winter, wedding',
    evidence: 'Rooted Revival winter arrangement: white roses in a light dome with snowdrops and evergreens at the base.',
    sources: ['https://rootedrevival.com/10-winter-flower-arrangements-that-instantly-transform-any-room/'],
    shape: 'loose', wrap: bare('sage'),
    groups: [
      { f: 'rose', c: 'white', n: 1, d: 0, h: 0.15 },
      { f: 'rose', c: 'white', n: 5, d: 0.35, h: 0.1 },
      { f: ANEMONE, c: 'white', n: 3, d: 0.6, at: 0 },
      { f: 'rose', c: 'cream', n: 6, d: 0.72, at: 30 },
      { f: GYPSOPHILA, c: 'white', n: 4, d: 0.97, h: 0.1, at: 45, tilt: 20 },
    ],
  },
  {
    id: 'calla-cascade', name: 'Calla & Carnation Cascade', occasion: 'Wedding',
    evidence: 'Floral Design Institute miniature calla cascade: 18 mini callas and 10 antique carnations, the three largest callas grouped as the focal point.',
    sources: ['https://www.floraldesigninstitute.com/blogs/flower-school-video-library/calla-cascade-wedding-bouquet'],
    shape: 'cascade', wrap: bare('ivory'),
    groups: [
      { f: CALLA, c: 'red', n: 3, d: 0.15, h: 0.2, at: 0 },
      { f: CALLA, c: 'red', n: 6, d: 0.5, h: 0.1, at: 180, arc: 300 },
      { f: 'carnation', c: 'pink', n: 10, d: 0.68, at: 18 },
      { f: CALLA, c: 'red', n: 3, d: 0.84, h: -0.1, at: 0, arc: 60 },
      { f: CALLA, c: 'red', n: 2, d: 1, h: -0.2, at: 0, arc: 40 },
    ],
  },
  {
    id: 'orchid-cascade', name: 'White Orchid Cascade', occasion: 'Wedding',
    evidence: 'Floral Design Institute cascading phalaenopsis bouquet: orchids woven down the front with ivory and white roses and hydrangea.',
    sources: ['https://www.floraldesigninstitute.com/blogs/flower-school-video-library/cascading-phalaenopsis-bouquet'],
    shape: 'cascade', wrap: bare('ivory'),
    groups: [
      { f: 'rose', c: 'white', n: 5, d: 0.25, h: 0.1, at: 180, arc: 200 },
      { f: 'rose', c: 'cream', n: 3, d: 0.55, at: 180, arc: 120 },
      { f: ORCHID_WHITE, c: 'white', n: 3, d: 0.46, at: 0, arc: 80 },
      { f: ORCHID_WHITE, c: 'white', n: 3, d: 0.73, h: -0.05, at: 0, arc: 50 },
      { f: ORCHID_WHITE, c: 'white', n: 3, d: 1, h: -0.1, at: 0, arc: 40 },
    ],
  },
  {
    id: 'garden-glamour', name: 'Garden Glamour', occasion: 'Wedding, summer',
    evidence: 'Floral Design Institute garden glamour bouquet: garden roses in mocha pink, cream and orange with 9 cosmos, grouped by colour at differing heights.',
    sources: ['https://www.floraldesigninstitute.com/blogs/flower-school-video-library/garden-glamour-wedding-bouquet'],
    shape: 'round', wrap: paper('tissue', 'white', 'gold'),
    groups: [
      { f: 'rose', c: 'red', n: 1, d: 0, h: 0.1 },
      { f: DAHLIA_ORANGE, c: 'orange', n: 4, d: 0.3, at: 0 },
      { f: DAHLIA_PINK, c: 'pink', n: 4, d: 0.32, at: 45 },
      { f: 'rose', c: 'cream', n: 3, d: 0.56, at: 20 },
      { f: DAHLIA_PINK, c: 'pink', n: 3, d: 0.64, at: 70 },
      { f: 'rose', c: 'red', n: 4, d: 0.84, at: 0, tilt: 10 },
      { f: 'daisy', c: 'orange', n: 4, d: 0.88, at: 45, tilt: 12 },
    ],
  },
  {
    id: 'lavender-garden', name: 'Lavender Garden', occasion: 'Wedding, spring',
    evidence: 'Floral Design Institute hand-tied and spring wedding recipes: lavender roses with sweet peas and lilac, fuller at the front.',
    sources: ['https://www.floraldesigninstitute.com/blogs/flower-school-video-library/hand-tied-bouequet-tutorial', 'https://www.floraldesigninstitute.com/blogs/flower-school-video-library/spring-wedding-bouquet'],
    shape: 'round', wrap: bare('lilac'),
    groups: [
      { f: 'rose', c: 'purple', n: 1, d: 0, h: 0.1 },
      { f: 'rose', c: 'purple', n: 5, d: 0.25, h: 0.05 },
      { f: 'carnation', c: 'red', n: 4, d: 0.48, at: 36 },
      { f: AGAPANTHUS_BLUE, c: 'blue', n: 3, d: 0.42, h: 0.3, at: 0 },
      { f: DELPHINIUM_PURPLE, c: 'purple', n: 3, d: 0.55, h: 0.5, at: 200, arc: 120 },
      { f: 'rose', c: 'purple', n: 4, d: 0.66, at: 45 },
      { f: SWEET_PEA, c: 'pink', n: 6, d: 0.78, h: 0.2, at: 15, tilt: 15 },
      { f: GYPSOPHILA, c: 'white', n: 3, d: 0.61, h: 0.3, at: 45, tilt: 12 },
    ],
  },
  {
    id: 'whimsical-pink', name: 'Whimsical Pink', occasion: 'Birthday, wedding',
    evidence: 'Floral Design Institute whimsical pink hand-tie: 3 hydrangea at the base, roses tucked in, 5 carnations grouped low, 7 geraniums framing the sides (red carnations here), airy stems rising through the centre.',
    sources: ['https://floraldesigninstitute.com/blogs/flower-school-video-library/whimsical-pink-hand-tie'],
    shape: 'loose', wrap: bare('blush'),
    groups: [
      { f: 'rose', c: 'pink', n: 1, d: 0, h: -0.05 },
      { f: 'rose', c: 'pink', n: 5, d: 0.3, h: -0.1 },
      { f: SNAPDRAGON, c: 'pink', n: 3, d: 0.5, h: 0.9, at: 45 },
      { f: DELPHINIUM_PURPLE, c: 'purple', n: 3, d: 0.4, h: 0.9, at: 200, arc: 100 },
      { f: HYDRANGEA_PURPLE, c: 'purple', n: 2, d: 0.55, at: 240, arc: 50 },
      { f: 'daisy', c: 'pink', n: 5, d: 0.65, h: 0.3, at: 30 },
      { f: GERANIUM_PURPLE, c: 'purple', n: 4, d: 0.85, h: -0.25, at: 90, arc: 180, tilt: 15 },
    ],
  },
  {
    id: 'poppy-peony', name: 'Red Poppies & Pale Peonies', occasion: 'Wedding, early summer',
    evidence: 'Red and white wedding pairing in florist guides; Confetti Daydreams wild garden bouquet of peonies and poppies (2 researchers).',
    sources: ['https://confettidaydreams.com/hand-tied-garden-bouquet-tutorial/'],
    shape: 'loose', wrap: bare('ivory'),
    groups: [
      { f: PEONY_PINK, c: 'pink', n: 1, d: 0, h: 0.15 },
      { f: PEONY_PALE, c: 'pink', n: 4, d: 0.35, h: 0.1, at: 45 },
      { f: POPPY, c: 'red', n: 3, d: 0.55, h: 0.2, at: 0, arc: 120 },
      { f: 'rose', c: 'cream', n: 4, d: 0.6, at: 180, arc: 180 },
      { f: PEONY_PINK, c: 'pink', n: 3, d: 0.71, at: -30, arc: 160 },
      { f: SWEET_PEA, c: 'pink', n: 5, d: 0.8, h: 0.25, at: 180, arc: 200, tilt: 12 },
      { f: GYPSOPHILA, c: 'white', n: 3, d: 0.97, at: 0, arc: 120, tilt: 15 },
    ],
  },
  {
    id: 'bright-get-well', name: 'Bright Get-Well Mix', occasion: 'Get well, congratulations',
    evidence: 'Direct2florist and ProFlowers get-well guides: sunflowers, gerberas, daisies and warm roses, no lilies; UrbanStems The Firecracker (916 reviews) is a bright mix.',
    sources: ['https://direct2florist.co.uk/blog/guides/popular-get-well-soon-flowers/', 'https://proflowers.com/blog/tips-for-choosing-get-well-flowers', 'https://sendflowers.io/blog/get-well-flowers'],
    shape: 'round', wrap: kraft('orange'),
    groups: [
      { f: 'sunflower', c: 'yellow', n: 1, d: 0, h: 0.3 },
      { f: 'sunflower', c: 'yellow', n: 3, d: 0.38, h: 0.25, at: 60 },
      { f: MARIGOLD, c: 'orange', n: 3, d: 0.42, at: 0 },
      { f: 'tulip', c: 'red', n: 5, d: 0.68, h: 0.1, at: 0 },
      { f: 'daisy', c: 'pink', n: 3, d: 0.66, at: 36 },
      { f: MARIGOLD, c: 'orange', n: 4, d: 0.92, at: 18, tilt: 15 },
    ],
  },
  {
    id: 'tropical', name: 'Tropical Bold', occasion: 'Summer, tropical',
    evidence: 'Kremp florist tropical arrangements (anthurium, orchids) and tropical florist guides (2 researchers).',
    sources: ['https://www.kremp.com/blogs/the-kremp-florist-blog/relive-summer-with-tropical-flower-arrangements', 'https://www.floraldesigninstitute.com/blogs/flower-school-video-library/summer-tropical-wedding-bouquet'],
    shape: 'round', wrap: bare('orange'),
    groups: [
      { f: BIRD_OF_PARADISE, c: 'orange', n: 1, d: 0, h: 0.8 },
      { f: BIRD_OF_PARADISE, c: 'orange', n: 1, d: 0.32, h: 0.55, at: 200 },
      { f: 'rose', c: 'pink', n: 3, d: 0.36, h: 0.05, at: 0, arc: 110 },
      { f: ANTHURIUM, c: 'red', n: 2, d: 0.52, at: 130, arc: 60 },
      { f: HYDRANGEA_BLUE, c: 'blue', n: 2, d: 0.6, at: 250, arc: 60 },
      { f: ORCHID_PINK, c: 'pink', n: 3, d: 0.7, at: 20, arc: 100 },
      { f: HIBISCUS, c: 'red', n: 3, d: 0.88, at: 45 },
      { f: MARIGOLD, c: 'orange', n: 3, d: 0.92, at: 90, arc: 180, tilt: 12 },
    ],
  },
];

/** The first three get their own buttons; the rest are behind "Explore more". */
export const FEATURED_PRESETS = 3;

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Turns a viewing angle (0 = front) into the stored one, which depends on the shape. */
function storedAngle(shape: ShapeId, viewDegrees: number): number {
  const v = ((viewDegrees % 360) + 540) % 360 - 180; // -180 to 180
  return SHAPE_OF[shape].storedAngle(v);
}

function groupAngles(g: Group): number[] {
  const at = g.at ?? 0;
  const arc = g.arc ?? 360;
  if (arc >= 360) return Array.from({ length: g.n }, (_, i) => at + (i * 360) / g.n);
  if (g.n === 1) return [at];
  return Array.from({ length: g.n }, (_, i) => at - arc / 2 + (i * arc) / (g.n - 1));
}

/** The preset list: the featured few, the rest, and the bouquet each one builds. */
export class Presets {
  constructor(private readonly editor: BouquetEditor, readonly all: readonly Preset[] = PRESETS) {}

  /** The ones with their own buttons. */
  get featured(): readonly Preset[] {
    return this.all.slice(0, FEATURED_PRESETS);
  }

  /** The ones behind "Explore more". */
  get others(): readonly Preset[] {
    return this.all.slice(FEATURED_PRESETS);
  }

  find(id: string): Preset | undefined {
    return this.all.find((p) => p.id === id);
  }

  /** The bouquet for a preset, checked like a saved design; null if it uses a flower or colour the catalogue lacks. */
  build(preset: Preset): Bouquet | null {
    const stems = preset.groups.flatMap((g) => groupAngles(g).map((angle) => ({
      flower: g.f, colour: g.c,
      angle: storedAngle(preset.shape, angle),
      dist: g.d,
      height: clamp(DEFAULT_HEIGHT + (g.h ?? 0), -1, 1),
      tilt: clamp(rad(g.tilt ?? 0), -0.5, 0.5),
    })));
    return this.editor.validate({ version: 1, shape: preset.shape, wrap: preset.wrap, stems: stems.map((s, i) => ({ id: `s${i + 1}`, ...s })) });
  }
}
