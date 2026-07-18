// Minimal in-memory localStorage for the Node test environment.
//
// src/lib/store.js is a localStorage seam, so testing it needs the API to exist.
// A full DOM (jsdom/happy-dom) would work but costs a heavyweight dependency and
// seconds per run to provide one object we can write in a dozen lines. Semantics
// that matter are preserved: values are coerced to STRINGS (so a test can't pass
// by accident where the real browser would have stringified), and a missing key
// returns null rather than undefined.
class MemoryStorage {
  #data = new Map();
  get length() { return this.#data.size; }
  key(i) { return [...this.#data.keys()][i] ?? null; }
  getItem(k) { return this.#data.has(String(k)) ? this.#data.get(String(k)) : null; }
  setItem(k, v) { this.#data.set(String(k), String(v)); }
  removeItem(k) { this.#data.delete(String(k)); }
  clear() { this.#data.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
