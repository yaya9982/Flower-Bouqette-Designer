/**
 * Which row of a vertical list a pointer at height `y` belongs to: the row it is over, otherwise the nearest one, so the
 * gaps between rows and the list's own padding count as a row too and the flower picture never flickers off in between.
 * Returns -1 for no rows or a `y` that is not a number.
 */
export function rowAt(spans: readonly { top: number; bottom: number }[], y: number): number {
  if (Number.isNaN(y)) return -1;
  const at = Math.min(Math.max(y, -1e9), 1e9);
  let best = -1;
  let bestGap = 0;
  spans.forEach((s, i) => {
    const gap = at < s.top ? s.top - at : at > s.bottom ? at - s.bottom : 0;
    if (best < 0 || gap < bestGap) { best = i; bestGap = gap; }
  });
  return best;
}
