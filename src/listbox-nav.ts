/** Index after an arrow/Home/End key in a list of `count` options; stays put for other keys, -1 for an empty list. */
export function moveIndex(current: number, count: number, key: string): number {
  if (count <= 0) return -1;
  if (key === 'ArrowDown') return Math.min(current + 1, count - 1);
  if (key === 'ArrowUp') return Math.max(current - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return current;
}

/**
 * Type-ahead: the first option whose label starts with `typed` (any case). A single letter, repeated, starts the search
 * after `current`, so pressing it again steps through the matches; longer text may match `current` itself.
 */
export function typeAhead(labels: readonly string[], typed: string, current: number): number {
  const q = typed.toLowerCase();
  const n = labels.length;
  const start = q.length === 1 ? current + 1 : current;
  for (let k = 0; k < n; k++) {
    const i = (((start + k) % n) + n) % n;
    if (labels[i].toLowerCase().startsWith(q)) return i;
  }
  return -1;
}
