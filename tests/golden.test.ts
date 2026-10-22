import { expect, it } from 'vitest';
import { BouquetEditor, SHAPES, type Stem } from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { Presets, PRESETS } from '../src/presets';
import { SHAPE_OF, TAU, type Vec3 } from '../src/shapes';

const editor = new BouquetEditor(new Catalog(FLOWERS));
const arranger = editor.arranger;
const presets = new Presets(editor);

/**
 * Every placement number as its exact float64 bits, so a refactor that changes even the last digit or the sign of
 * a zero fails. Update it with `-u` only for a deliberate change to the placement maths (as when the one-sided and
 * cascading shapes were made compact), never to make a refactor pass.
 */
const view = new DataView(new ArrayBuffer(8));
const hex = (n: number) => { view.setFloat64(0, n); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
const v = (p: Vec3) => `${hex(p.x)} ${hex(p.y)} ${hex(p.z)}`;
const stems = (list: Stem[]) => list.map((s) => `${s.id} ${s.flower} ${s.colour} ${hex(s.angle)} ${hex(s.dist)} ${hex(s.height)} ${hex(s.tilt)}`).join('\n');
const make = (spec: [string, number][]): Stem[] => spec.flatMap(([flower, count]) =>
  Array.from({ length: count }, (_, i) => ({ id: `${flower}${i}`, flower, colour: 'any', angle: 0, dist: 0, height: 0, tilt: 0 })));

it('placement maths is bit-identical to the recorded baseline', async () => {
  const out: string[] = [];
  for (const shape of SHAPES) {
    for (const radius of [0.05, 0.12, 0.3]) {
      out.push(`maxReach ${shape} ${hex(radius)} ${hex(SHAPE_OF[shape].maxReach(radius))}`);
      for (let angle = 0; angle < TAU; angle += 0.37) {
        for (let dist = 0; dist <= 1; dist += 0.125) {
          for (const height of [-1, -0.6, 0, 1]) {
            for (const tilt of [0, 0.3]) {
              const pose = SHAPE_OF[shape].surfacePoint(angle, dist, radius, height, tilt);
              const back = SHAPE_OF[shape].surfaceFromPoint(pose.head, radius);
              out.push(`${shape} ${hex(angle)} ${hex(dist)} ${height} ${tilt}: ${v(pose.head)} | ${v(pose.dir)} | ${v(pose.face)} | ${v(SHAPE_OF[shape].stemFoot(pose))} | ${hex(back.angle)} ${hex(back.dist)}`);
            }
          }
        }
      }
    }
  }
  const sets: [string, number][][] = [
    [['rose', 1]], [['rose', 5], ['tulip', 4], ['daisy', 3]], [['rose', 40]],
    [['rose', 10], ['tulip', 10], ['daisy', 8], ['lily', 6], ['sunflower', 6]], [['tulip', 39], ['sunflower', 1]],
  ];
  for (const set of sets) {
    const list = make(set);
    out.push(`radius ${hex(arranger.surfaceRadius(list))}`, stems(arranger.autoArrange(list)));
  }
  const order = ['lily', 'carnation', 'sunflower', 'rose', 'tulip', 'daisy'];
  let grown = arranger.autoArrange(make(sets[1]));
  for (let i = 0; i < 28; i++) {
    const gap = arranger.largestGap(grown, order[i % order.length]);
    out.push(`gap ${i} ${hex(gap.angle)} ${hex(gap.dist)}`);
    grown = [...grown, { id: `x${i}`, flower: order[i % order.length], colour: 'any', angle: gap.angle, dist: gap.dist, height: 0, tilt: 0 }];
  }
  let b = editor.createDefault();
  out.push('default', stems(b.stems));
  b = editor.add(b, 'lily');
  b = editor.move(b, 's1', 7.5, 0.4);
  b = editor.adjust(b, 's2', { height: 0.33, tilt: -0.2 });
  out.push('edited', stems(b.stems));
  for (const p of PRESETS) out.push(`preset ${p.id}`, stems(presets.build(p)?.stems ?? []));
  await expect(out.join('\n')).toMatchFileSnapshot('golden/placement.txt');
});
