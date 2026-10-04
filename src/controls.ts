// Canonical control list — the SINGLE source of truth shared by the Landing
// page, the first-run onboarding primer, and the in-match Click-to-Play hint, so
// they can never drift apart.
export const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['WASD', 'Move'],
  ['Mouse', 'Aim'],
  ['Left click', 'Fire railgun — recharges after each shot'],
  ['Space', 'Jump (double-jump in the air)'],
  ['Shift', 'Dash (directional, short cooldown)'],
  ['Right click', 'Hold to aim through the scope / zoom'],
  ['E', 'Boost-jump off a nearby surface'],
  ['Wall + Space', 'Wall-jump for height + speed'],
  ['Tab', 'Scoreboard'],
  ['Esc', 'Release mouse / menu'],
];
