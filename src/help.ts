/** The "?" next to a panel section: a short demo clip (public/demos/, made by tools/record-demos.mjs) and what the section is for. */
export const HELP_KEYS = ['bouquet', 'actions', 'shape', 'selected'] as const;
export type HelpKey = (typeof HELP_KEYS)[number];

export const HELP: Record<HelpKey, { title: string; clip: string; text: string }> = {
  bouquet: {
    title: 'Your bouquet',
    clip: 'bouquet.mp4',
    text: 'Every kind of flower in your bouquet and how many stems of it. Press + to add another stem and − to take one away. The total price changes as you go, and a bouquet holds up to 40 flowers.',
  },
  actions: {
    title: 'Actions',
    clip: 'actions.mp4',
    text: 'Undo and Redo step back and forward through your changes. Re-arrange lays the same flowers out in a new composition each time you press it, and Undo brings the last one back. Reset view puts the camera back in front.',
  },
  shape: {
    title: 'Shape',
    clip: 'shape.mp4',
    text: 'Chooses how the flowers sit together: a round dome, a cascade, a loose bunch or one-sided. Your flowers and colours stay the same, only their places change.',
  },
  selected: {
    title: 'Selected flower',
    clip: 'selected.mp4',
    text: 'Click a flower in the 3D view to select it, then change its colour, height and tilt, swap it for another flower, or remove it. You can also drag a selected flower to move it. Drag empty space to turn the bouquet.',
  },
};
