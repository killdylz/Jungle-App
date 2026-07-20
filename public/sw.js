/* Jungle service worker — the offline half of P7.
 *
 * THE SCENARIO THIS EXISTS FOR: a Room TV and a coach's phone are running a
 * class on gym Wi-Fi, and the router drops for five minutes. Nothing
 * member-visible should change. Before this file, a reload in that window gave
 * the dinosaur.
 *
 * Deliberately hand-written rather than generated. It is ~60 lines of policy
 * that decide what a gym sees when the network dies, and that is worth being
 * able to read in one sitting.
 *
 * THREE RULES, in order:
 *   1. Navigations   → network-first, fall back to the cached shell.
 *      Network-first so a deploy is picked up promptly; the fallback is what
 *      makes an offline reload mid-class survive.
 *   2. Static assets → cache-first, refreshed in the background.
 *      Vite content-hashes these filenames, so a cache hit can never be stale:
 *      a changed file is a different URL. Fonts and icons ride this path too.
 *   3. Everything else (Supabase, any API) → straight to the network, never
 *      cached. Serving a stale roster or attendance count from a cache would be
 *      worse than an honest failure, and the app already has its own local-first
 *      layer for that data.
 */

const VERSION = "jungle-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

// Scope-relative, so this works under the /Jungle-App/ base path on GitHub Pages
// and at the root on a custom domain without edits.
const SHELL_URL = new URL("./", self.registration.scope).pathname;

// Filled in at build time by scripts/build-sw.mjs — the hashed bundle, the CSS
// and every self-hosted font file.
//
// These MUST be precached rather than left to the runtime rule below. Fonts are
// fetched lazily by the browser, only when a glyph needs them, and once they sit
// in the HTTP cache no further fetch event reaches this worker — so they were
// never entering the cache at all. Offline, the gym's typography quietly fell
// back to system sans while everything else worked, which is the kind of "mostly
// fine" that makes a display look broken to a member and nobody can explain why.
// Caught by pulling the server down and asking document.fonts, not by reading it.
const PRECACHE = self.__JUNGLE_PRECACHE__ || [];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Each entry is added independently: one 404 in the list must not abort the
    // whole install and leave the gym with no offline support at all.
    await Promise.all(
      [SHELL_URL, "./manifest.webmanifest", "./favicon.svg", ...PRECACHE].map((u) =>
        cache.add(u).catch((e) => console.warn("[sw] precache miss:", u, e?.message || e)),
      ),
    );
  })());
  // NOTE: no skipWaiting(). A new worker taking over mid-class could swap assets
  // under a running timer. It activates on the next full load instead — stability
  // during a class beats a few minutes' update latency.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isStatic = (url) =>
  /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|ico)$/i.test(new URL(url).pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Rule 3: never cache cross-origin (Supabase, Google Fonts, anything else).
  if (url.origin !== self.location.origin) return;

  // Rule 1: navigations.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL);
        cache.put(SHELL_URL, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(SHELL_URL, { ignoreVary: true })) || Response.error();
      }
    })());
    return;
  }

  // Rule 2: hashed static assets.
  if (isStatic(request.url)) {
    event.respondWith((async () => {
      // ignoreVary is LOAD-BEARING, not a tidy-up. The server sends
      // `Vary: Origin` on assets. Precached entries are stored from a plain
      // same-origin request with no Origin header, but the browser fetches
      // @font-face files in CORS mode WITH one — so the two never matched, every
      // font request missed the cache, and offline the app rendered in system
      // sans while every other asset served fine. Found by stopping the server
      // and asking document.fonts, which reported NetworkError while a manual
      // fetch() of the same URL returned 200.
      const cached = await caches.match(request, { ignoreVary: true });
      const network = fetch(request).then((res) => {
        // Clone SYNCHRONOUSLY, before this response is returned and its body
        // read. Cloning inside a later `.then` looks equivalent and is not: by
        // then the body can already be consumed, the put silently no-ops, and
        // the cache stays empty — which is exactly how this was written first,
        // and it took an offline test to notice.
        if (res && res.ok) {
          const copy = res.clone();
          // waitUntil keeps the worker alive long enough for the write; without
          // it the SW can be killed mid-put once the response is delivered.
          event.waitUntil(caches.open(ASSETS).then((c) => c.put(request, copy)));
        }
        return res;
      }).catch(() => null);
      return cached || (await network) || Response.error();
    })());
  }
});
