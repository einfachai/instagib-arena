import type { Settings } from '../app-types';
import { DEFAULT_VIEWMODEL_OFFSET, mergeKeybinds, MIN_SENSITIVITY, MAX_SENSITIVITY, M_YAW_DEG } from '../game/constants';
import { DEFAULT_CROSSHAIR, DEFAULT_SETTINGS, musicSettings } from './codec';

export const SETTINGS_KEY = 'instagib-settings-v2';

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged: Settings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      ...musicSettings(parsed),
      // Nested objects need an explicit merge so newly-added fields survive.
      crosshair: { ...DEFAULT_CROSSHAIR, ...(parsed.crosshair ?? {}) },
      keybinds: mergeKeybinds(parsed.keybinds),
      viewmodelOffset: { ...DEFAULT_VIEWMODEL_OFFSET, ...(parsed.viewmodelOffset ?? {}) },
    };
    // Migrate legacy sensitivity: the old model stored radians/pixel (~0.0022).
    // Anything below the new minimum is a legacy value → convert to the
    // Source-style sens number so people keep roughly the same feel.
    if (typeof parsed.sensitivity === 'number' && parsed.sensitivity < MIN_SENSITIVITY) {
      merged.sensitivity = Math.min(
        MAX_SENSITIVITY,
        parsed.sensitivity / (M_YAW_DEG * (Math.PI / 180)),
      );
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Auto-generated placeholder name (see the mount effect). Matches the shape we
// create so we can avoid persisting it.
const AUTO_NAME_RE = /^Player-[0-9A-Z]{4}$/;

export function saveSettings(s: Settings) {
  if (typeof window === 'undefined') return;
  try {
    // Don't persist the auto-generated name (#21): if we did, every tab on this
    // machine would load the same "Player-XXXX", making the scoreboard/killfeed
    // ambiguous when testing with two tabs. Each tab regenerates its own until
    // the user types a real one (which is then persisted normally).
    const toSave = AUTO_NAME_RE.test(s.playerName) ? { ...s, playerName: '' } : s;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(toSave));
  } catch {
    // ignore
  }
}
