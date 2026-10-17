import { describe, expect, it } from 'vitest';
import { distance, headDiameter, stemPose, surfaceRadius, TAU } from '../src/arrange';
import { MAX_STEMS } from '../src/bouquet';
import { FLOWERS } from '../src/catalog';
import { FEATURED_PRESETS, presetBouquet, PRESETS } from '../src/presets';

const built = PRESETS.map((p) => ({ preset: p, bouquet: presetBouquet(p, FLOWERS) }));

describe('presets', () => {
  it('has 30 presets with their own ids, three of them featured', () => {
    expect(PRESETS).toHaveLength(30);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(30);
    expect(FEATURED_PRESETS).toBe(3);
  });

  it('builds every preset into a valid bouquet that names its sources', () => {
    for (const { preset, bouquet } of built) {
      expect(bouquet, preset.id).not.toBeNull();
      expect(bouquet!.stems.length, preset.id).toBeLessThanOrEqual(MAX_STEMS);
      expect(preset.sources.length, preset.id).toBeGreaterThan(0);
      for (const url of preset.sources) expect(url, preset.id).toMatch(/^https:\/\//);
    }
  });

  it('places the one-sided front in the middle of the stored range', () => {
    // A flower at the front (0°) is stored at half a turn; a full ring stays inside the stored range.
    const front = presetBouquet({ ...PRESETS[0], shape: 'onesided', groups: [{ f: 'rose', c: 'red', n: 1, d: 0.5, at: 0 } as never] }, FLOWERS)!;
    expect(front.stems[0].angle).toBeCloseTo(Math.PI);
    const ring = presetBouquet({ ...PRESETS[0], shape: 'onesided', groups: [{ f: 'rose', c: 'red', n: 8, d: 0.5 } as never] }, FLOWERS)!;
    for (const s of ring.stems) expect(s.angle >= 0 && s.angle < TAU).toBe(true);
  });

  it('keeps flower heads from sitting inside one another', () => {
    const clashes: string[] = [];
    for (const { preset, bouquet } of built) {
      const b = bouquet!;
      const radius = surfaceRadius(b.stems, FLOWERS);
      const heads = b.stems.map((s) => stemPose(b.shape, s, radius).head);
      for (let i = 0; i < heads.length; i++) {
        for (let j = i + 1; j < heads.length; j++) {
          const room = (headDiameter(b.stems[i].flower, FLOWERS) + headDiameter(b.stems[j].flower, FLOWERS)) / 2;
          // Heads in a real bouquet touch and overlap a little; more than half sunk into each other looks wrong.
          const share = distance(heads[i], heads[j]) / room;
          if (share < 0.5) clashes.push(`${preset.id}: ${b.stems[i].id}/${b.stems[j].id} ${share.toFixed(2)}`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});
