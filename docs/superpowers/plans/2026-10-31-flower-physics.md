# Flower Physics Plan

**Goal:** while a flower is dragged, or its height is changed, the flowers around it move out of the way in real time, like a straw through water, instead of being passed through. When it stops, they spring back as far as there is room.

**Why this approach:** a position-based simulation (Verlet with contact projection) is unconditionally stable, which suits violent input, and needs no physics library. Stems pivot at the tie, so a flower has only two free coordinates: its position on the bouquet disc. Contacts are measured in 3D, so a raised flower clears lower ones and height changes count.

## Model (`src/physics.ts`, no Babylon imports)

- State per stem: disc position `(u, v)`, where `u = dist cos(angle)`, `v = dist sin(angle)`, plus velocity and height. Limit: `dist <= 1`.
- Fixed 120 Hz step. Frame time is capped, so a slow frame cannot spiral.
- Free flowers: a spring to their home, damped so they bounce once and stop.
- Held flower: moves toward the pointer at a capped speed. A pointer that jumps across the bouquet therefore sweeps through it and cannot tunnel.
- Contacts: heads against heads, and a head against the stem of a longer flower. Stem contact fades towards the tie, where stems converge and a head simply nestles among them.
- A real bouquet rests with slight overlaps. Each pair keeps the overlap it has at rest, or the bouquet would burst when touched. The held flower's allowance fades as it moves.
- Viscosity: nearby flowers pick up some of the held flower's velocity, so they part before contact, like fluid.
- Sleeps when still, so an idle page costs nothing.

## Drop

`settle()` works out the rest result synchronously, starting from the bouquet at rest with the flower at its drop point. So the result depends only on where it was dropped, never on the path: shaking it and putting it back changes nothing. It is committed at once, the move and its pushed neighbours as one undo step. The live view then springs into that result with contacts off, because every flower's home is known to be good. Nothing is stored for flowers that did not move.

## Drawing

Rebuilding stems every frame is too slow. `FlowerView.swing()` rotates the built stem about the tie and scales it to length, and moves the head. The next `place()` clears it.

## Wiring

- `view.render(bouquet, selected, heldId)`: Designer passes the selected stem for drafts.
- `view.settle(bouquet, heldId)`: Designer calls it on drag end and on slider commit.
- A render that changes homes for any other reason (undo, preset, shape) snaps with no animation.

## Tests

`tests/physics.test.ts`: every preset and shape is still at rest; a dragged flower pushes neighbours and ends clear of them; shaking and teleporting stay finite, inside the disc and under the speed cap; settling always finishes; height up and down both push; two drags in a row are stable; `settle` returns the same object when nothing moved.

Chrome, on the real app: slow drag, violent shaking, press/release spam, drag cancelled by losing focus, height and tilt slider sweeps and spam, undo and redo during motion, every shape, 40 stems, frame rate, console errors, front/side/back views.

## Removal

The whole feature is one commit: `git revert <hash>`.
