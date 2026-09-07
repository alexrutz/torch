// Save/load via localStorage.
//
// Terrain is never written — it regenerates from the seed. A save is the seed,
// the tiles the player changed, and the entities that matter.

const KEY = 'torch.save.v1';
const VERSION = 1;

export function hasSave() {
  try { return localStorage.getItem(KEY) != null; } catch { return false; }
}

export function saveGame(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, at: Date.now(), ...data }));
    return true;
  } catch (e) {
    // Private mode, or the quota is full. Neither should crash the game.
    console.warn('save failed', e);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== VERSION) return null;
    return data;
  } catch (e) {
    console.warn('load failed', e);
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}

/** A short human summary for the title screen's Continue button. */
export function saveSummary() {
  const d = loadGame();
  if (!d) return null;
  return {
    day: d.clock?.day ?? 1,
    seedName: d.seedName || 'unknown',
    dimension: d.player?.dimension ?? 'surface',
    at: d.at,
  };
}
