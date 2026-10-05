import type { ArenaMap } from '../arena-map-data';
import { B, C, shell, slab, spawnAt, steps, sym, symPoints } from './kit';

// Fusion plant: maintenance loop below machinery galleries, upper transfer gantries.
export const REACTOR: ArenaMap = (() => {
  const { boxes, bounds } = shell(48, 36, 30);
  boxes.push(...sym([
    B(16, 0, -27, 17, 3, -16, 'divider'), B(16, 0, -10, 17, 3, -4, 'divider'),
    B(16, 0, 4, 17, 3, 10, 'divider'), B(16, 0, 16, 17, 3, 27, 'divider'),
    C(26, -15, 12, 9, 0, 4.5, 'machine'), C(27, 14, 10, 10, 0, 3, 'machine'),
    C(27, 14, 6, 6, 3, 6, 'machine'), C(31, -15, 3, 3, 4.5, 7, 'machine'),
    C(22, 0, 3, 5, 0, 3, 'machine'),
    slab(37, -27, 45, 27, 6, 'gallery', 0.7),
    slab(17, -27, 37, -21, 6, 'gallery', 0.7), slab(17, 21, 37, 27, 6, 'gallery', 0.7),
    ...steps('+z', -10, 0, 38, 44, 0, 6, { tag: 'steps' }),
    ...steps('-x', 30, 37, -27, -22, 6, 9, { tag: 'steps' }),
    slab(20, -27, 30, -22, 9, 'gallery'),
    slab(5, -2.5, 32, 2.5, 12, 'gantry', 0.7), C(28, 0, 4, 4, 0, 11.3, 'support'),
    C(9, -11, 3, 6, 0, 3, 'machine'), C(10, 22, 3, 6, 0, 3, 'machine'),
    C(8, -31, 4, 3, 0, 3, 'service'), C(31, -31, 3, 5, 0, 3, 'service'),
  ], 'rot'));
  boxes.push(
    slab(-45, -34, 45, -28, 6, 'gallery', 0.7), slab(-45, 28, 45, 34, 6, 'gallery', 0.7),
    C(0, 0, 12, 12, 0, 3, 'core-base'), C(0, 0, 6, 6, 3, 17.3, 'core'),
    slab(-9, -6, 9, 6, 6, 'apron'), slab(-6, -9, 6, 9, 12, 'control'),
    slab(-5, -5, 5, 5, 18, 'apex', 0.7),
    ...steps('-z', 6, 14, -9, -5, 0, 6, { tag: 'steps' }),
    ...steps('+z', -14, -6, 5, 9, 0, 6, { tag: 'steps' }),
  );
  const spawns = symPoints([
    spawnAt(42, -23), spawnAt(26, -5), spawnAt(7, -22), spawnAt(21, -31),
    spawnAt(28, 18, 3), spawnAt(42, 20), spawnAt(41, 5, 6), spawnAt(23, -24, 9),
  ], 'rot');
  return { name: 'Reactor', revision: 2, boxes, bounds, spawns, spawn: spawns[0], accent: 0x7cdcc8 };
})();
