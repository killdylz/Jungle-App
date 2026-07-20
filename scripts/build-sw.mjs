// Inject the built asset list into the service worker's precache.
//
// Vite content-hashes every filename, so the worker cannot know them ahead of
// time. This runs after `vite build` and rewrites dist/sw.js with the real list.
//
// It exists because runtime caching alone was NOT enough for fonts: the browser
// fetches a woff2 lazily and then serves it from the HTTP cache, so the worker's
// fetch handler often never sees it and it never enters the cache. Offline, the
// app worked but rendered in system sans. Precaching removes the guesswork.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = new URL("../dist/", import.meta.url);
// fileURLToPath, not `.pathname` — on Linux `.pathname` starts with "/" and
// naive stripping turns an absolute path into a relative one; on Windows it
// carries a leading slash before the drive letter. Either way the size report
// silently reads nothing.
const DIST_PATH = fileURLToPath(DIST);
const ASSET_DIR = new URL("assets/", DIST);
const SW = new URL("sw.js", DIST);

if (!fs.existsSync(SW)) {
  console.error("build-sw: dist/sw.js not found — did vite build run?");
  process.exit(1);
}

// Everything the app needs to render with no network. Deliberately NOT images
// beyond the icons: a gym logo upload lives in localStorage, not here.
const PRECACHE_EXT = /\.(?:js|css|woff2?)$/i;

const assets = fs.existsSync(ASSET_DIR)
  ? fs.readdirSync(ASSET_DIR).filter((f) => PRECACHE_EXT.test(f)).map((f) => `./assets/${f}`)
  : [];

const icons = ["icon-192.png", "icon-512.png", "icon-512-maskable.png"]
  .filter((f) => fs.existsSync(new URL(f, DIST)))
  .map((f) => `./${f}`);

const list = [...assets, ...icons];

const src = fs.readFileSync(SW, "utf8");
const marker = "self.__JUNGLE_PRECACHE__";
if (!src.includes(marker)) {
  console.error(`build-sw: '${marker}' not found in sw.js — the injection point moved`);
  process.exit(1);
}

const injected = `self.__JUNGLE_PRECACHE__ = ${JSON.stringify(list, null, 2)};\n${src}`;
fs.writeFileSync(SW, injected);

const bytes = list.reduce((n, rel) => {
  const p = path.join(DIST_PATH, rel.replace("./", ""));
  try { return n + fs.statSync(p).size; } catch { return n; }
}, 0);
console.log(`build-sw: precaching ${list.length} files (~${(bytes / 1024).toFixed(0)} KB)`);
