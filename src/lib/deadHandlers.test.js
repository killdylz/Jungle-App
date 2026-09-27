import { describe, it, expect } from "vitest";
import fs from "node:fs";

// ─── A `handle…` in App.jsx that nothing calls is a door into a room nobody enters ─
//
// Session 39 counted "five whole-class replacements" and gave each an undo. One
// of them, `handleSelectTemplate`, had no caller at all: the Builder's presets
// picker goes through `onImportClass`, and the Templates screen that used to call
// it is retired in flags.js. So the undo it was given guarded nothing, the count
// in the comment was wrong, and a later reader would spend time proving a guard
// on code the product cannot run. Session 41 deleted it.
//
// `npm run lint` would report it as unused, but that report is 211 advisory
// problems long and nobody reads it. This is the one class of unused binding
// that has already misled a session, so it gets its own gate.

const APP = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");

// Comments name handlers to explain them; a mention in prose is not a call.
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

export function uncalledHandlers(src) {
  const code = strip(src);
  const declared = [...code.matchAll(/\bconst\s+(handle[A-Z]\w*)\s*=/g)].map((m) => m[1]);
  return declared.filter((name) => (code.match(new RegExp(`\\b${name}\\b`, "g")) || []).length < 2);
}

describe("every handle… declared in App.jsx has a caller", () => {
  it("the scanner finds an uncalled handler, and ignores one named only in a comment", () => {
    // Positive control: a scan that found nothing and a scan that matched nothing
    // look the same from the assertion's side.
    const src = `
      const handleUsed = () => 1;
      const handleDead = () => 2;
      // handleDead is explained here, which is not a call
      <Thing onGo={handleUsed}/>`;
    expect(uncalledHandlers(src)).toEqual(["handleDead"]);
  });

  it("App.jsx has none", () => {
    const declared = [...strip(APP).matchAll(/\bconst\s+(handle[A-Z]\w*)\s*=/g)];
    // An empty scan passes trivially — App.jsx has dozens of handlers.
    expect(declared.length).toBeGreaterThan(10);
    expect(uncalledHandlers(APP)).toEqual([]);
  });
});
