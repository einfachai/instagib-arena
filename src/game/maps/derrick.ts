import type { ArenaMap } from '../arena-map-data';
import { B, C, shell, slab, spawnAt, steps, sym, symPoints } from './kit';

// Alien extraction site: rotational chamber roofs feed opposite drill gantries.
export const DERRICK: ArenaMap = (() => {
  const { boxes, bounds } = shell(34, 29, 26);
  boxes.push(...sym([
    B(10, 0, -24, 27, 7.2, -23, 'chamber'),
    B(10, 0, -23, 11, 7.2, -17, 'chamber'), B(10, 0, -12, 11, 7.2, -7, 'chamber'),
    B(26, 0, -23, 27, 7.2, -17, 'chamber'), B(26, 0, -12, 27, 7.2, -7, 'chamber'),
    B(11, 0, -8, 13, 7.2, -7, 'chamber'), B(23, 0, -8, 26, 7.2, -7, 'chamber'),
    slab(11, -23, 16, -8, 7.2, 'roof', 0.7), slab(21, -23, 26, -8, 7.2, 'roof', 0.7),
    slab(16, -23, 21, -20, 7.2, 'roof', 0.7),
    ...steps('+x', 2, 10, -23, -18, 0, 7.2, { tag: 'steps' }),
    C(22, 5, 7, 6, 0, 3, 'machine'), C(22, 5, 4, 5, 3, 5, 'machine'),
    C(13, 20, 9, 4, 0, 3, 'machine'), C(29, 18, 3, 7, 0, 3, 'service'),
    C(5, -13, 3, 5, 0, 3, 'machine'),
    slab(6, -13, 11, -8, 7.2, 'bridge'), slab(4, -8, 11, -4, 10, 'gantry'),
    C(9, -6, 2, 2, 0, 9.5, 'support'), C(13, 6, 5, 5, 0, 5, 'machine'),
    slab(7, 3, 13, 7, 5, 'bridge'),
  ], 'rot'));
  boxes.push(
    C(0, 0, 6, 6, 0, 4.5, 'drill'), slab(-8, -4, 8, 4, 5, 'apron'),
    C(0, 0, 3, 3, 5, 14.3, 'drill'), slab(-4, -8, 4, 8, 10, 'control'),
    slab(-3.5, -3.5, 3.5, 3.5, 15, 'apex', 0.7),
    ...steps('+z', -10, -4, -8, -4, 0, 5, { tag: 'steps' }),
    ...steps('-z', 4, 10, 4, 8, 0, 5, { tag: 'steps' }),
  );
  const spawns = symPoints([
    spawnAt(-28.5, -23), spawnAt(-29, 14), spawnAt(18, -15), spawnAt(-13.5, 15, 7.2),
  ], 'rot');
  return { name: 'Extraction', revision: 2, boxes, bounds, spawns, spawn: spawns[0], openTop: true, accent: 0xf1b077 };
})();
