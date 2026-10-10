// Personal bests, kept in this browser only.
const KEY = '2048ls-records';
export const RECORD_KEYS = ['time', 'tile', 'kills', 'score'];

export function loadRecords() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

// Merges a finished run into the records; returns the records and which stats were beaten.
export function saveRun(run) {
  const records = loadRecords(), beaten = {};
  for (const k of RECORD_KEYS) {
    if (run[k] > (records[k] ?? 0)) beaten[k] = true;
    records[k] = Math.max(run[k], records[k] ?? 0);
  }
  try { localStorage.setItem(KEY, JSON.stringify(records)); } catch { /* storage blocked */ }
  return { records, beaten };
}
