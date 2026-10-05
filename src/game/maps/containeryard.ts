import type { ArenaMap } from '../arena-map-data';
import { B, C, shell, slab, spawnAt, steps, sym, symPoints } from './kit';

// Point-symmetric spaceport cargo bays; stable network ID, completely new layout.
export const CONTAINERYARD: ArenaMap = (() => {
  const { boxes, bounds } = shell(34, 29, 26);
  boxes.push(...sym([
    C(19, -13, 10, 6, 0, 3, 'cargo'), C(19, -13, 7, 6, 3, 6, 'cargo'),
    C(22, -13, 2, 5, 6, 9, 'cargo'), C(20, 11, 9, 7, 0, 6, 'cargo'),
    C(23, 11, 4, 7, 6, 9, 'cargo'), C(10, -21, 3, 6, 0, 3, 'service'),
    C(28, 3, 3, 8, 0, 3, 'cargo'), C(10, 11, 3, 5, 0, 3, 'cargo'),
    slab(13, -23, 27, -19, 6, 'boarding', 0.7),
    ...steps('+z', -19, -8, 27, 31, 0, 6, { tag: 'steps' }),
    slab(13, -8, 25, -4, 9, 'boarding'), slab(8, -2, 22, 2, 9, 'bridge', 0.7),
    B(13, 0, -4, 15, 9, -2, 'support'), C(4, -15, 3, 5, 0, 3, 'service'),
    C(19, 22, 8, 2, 0, 3, 'service'),
  ], 'rot'));
  boxes.push(
    C(-5, 0, 3, 9, 0, 8.3, 'support'), C(5, 0, 3, 9, 0, 8.3, 'support'),
    slab(-8, -6, 8, 6, 9, 'control', 0.7), C(0, 0, 2, 2, 9, 14.3, 'antenna'),
    slab(-3.5, -3.5, 3.5, 3.5, 15, 'apex', 0.7),
    C(0, -7.5, 4, 3, 0, 3, 'cargo'), C(0, 7.5, 4, 3, 0, 3, 'cargo'),
  );
  const spawns = symPoints([
    spawnAt(28, -24), spawnAt(-28, -24), spawnAt(-28, 3),
    spawnAt(13, 22), spawnAt(20, -21, 6),
  ], 'rot');
  return { name: 'Spaceport', revision: 2, boxes, bounds, spawns, spawn: spawns[0], openTop: true, accent: 0xe69ccf };
})();
