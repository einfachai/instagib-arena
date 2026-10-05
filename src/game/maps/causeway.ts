import type { ArenaMap } from '../arena-map-data';
import { B, C, shell, slab, spawnAt, steps, sym, symPoints } from './kit';

// Orbital station: twin hangars, exposed transfer bridges and sheltered service loops.
export const CAUSEWAY: ArenaMap = (() => {
  const { boxes, bounds } = shell(48, 36, 30);
  boxes.push(...sym([
    B(19, 0, -18, 20.2, 4.5, -9, 'hangar'), B(19, 0, 9, 20.2, 4.5, 18, 'hangar'),
    B(41, 0, -18, 42.2, 3, 18, 'hangar'),
    B(20.2, 0, -18, 28, 6, -16.8, 'hangar'), B(35, 0, -18, 41, 6, -16.8, 'hangar'),
    B(20.2, 0, 16.8, 28, 6, 18, 'hangar'), B(35, 0, 16.8, 41, 6, 18, 'hangar'),
    slab(20.2, -16.8, 41, -10, 6, 'deck', 0.7), slab(20.2, 10, 41, 16.8, 6, 'deck', 0.7),
    slab(37, -10, 41, 10, 6, 'deck', 0.7),
    ...steps('-z', -10, 0, 36, 41, 0, 6, { tag: 'steps' }),
    ...steps('+z', 0, 10, 22, 27, 0, 6, { tag: 'steps' }),
    slab(28, 12, 41, 16.8, 10, 'gallery', 0.7),
    ...steps('+x', 20.2, 28, 12, 16.8, 6, 10, { tag: 'steps' }),
    slab(20.2, -9, 25, -5, 9, 'deck'),
    C(30, -6, 5, 4, 0, 3, 'cargo'), C(31, 6, 5, 4, 0, 2.4, 'cargo'),
    C(24, 24, 10, 3, 0, 3, 'service'), C(35, 27, 3, 9, 0, 4.5, 'service'),
    C(11, 20, 3, 7, 0, 3, 'service'),
    slab(7, -2.5, 20.2, 2.5, 6, 'bridge', 0.7), C(13, -8, 4, 4, 0, 3, 'cargo'),
    C(9, 5.5, 3, 3, 0, 13, 'relay'), slab(7, 12, 20.2, 16, 6, 'bridge', 0.7),
    C(3.5, 24, 3, 5, 0, 3, 'service'),
  ], 'rot'));
  boxes.push(
    C(0, 0, 18, 14, 0, 2.4, 'dais'), C(0, 0, 4, 4, 2.4, 9.3, 'relay'),
    slab(-7, -5, 7, 5, 10, 'control', 0.7), C(0, 0, 3, 3, 10, 17.3, 'relay'),
    slab(-4, -4, 4, 4, 18, 'apex', 0.7),
    ...steps('+z', -12, -7, -4, 4, 0, 2.4, { tag: 'steps' }),
    ...steps('-z', 7, 12, -4, 4, 0, 2.4, { tag: 'steps' }),
  );
  const spawns = symPoints([
    spawnAt(43.8, -27), spawnAt(42.5, 26), spawnAt(21, -28), spawnAt(6, -29),
    spawnAt(30, -13, 6), spawnAt(39, 2, 6), spawnAt(30, 23), spawnAt(13, -17),
  ], 'rot');
  return { name: 'Causeway', revision: 2, boxes, bounds, spawns, spawn: spawns[0], openTop: true, accent: 0x85d9ef };
})();
