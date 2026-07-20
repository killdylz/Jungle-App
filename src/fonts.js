// ─── Self-hosted skin fonts (P7 / audit 1.2) ─────────────────────────────────
// The three preset skins' six families, bundled at build time instead of fetched
// from the Google Fonts CDN at runtime.
//
// WHY THIS IS NOT COSMETIC. The offline claim ("survives Wi-Fi loss for a full
// class") could not be true while the type came off a CDN: a Room TV cold-loaded
// on gym Wi-Fi with no internet rendered a fallback face, and every load flashed
// unstyled text first. A display in the gym's brand is the member's first
// impression of the studio, so it cannot depend on fonts.googleapis.com being
// reachable. It also removes a third-party request that saw every gym's IP on
// every load, which is one less thing to explain in a PDPA conversation.
//
// Only the weights each skin actually renders are imported, latin subset only.
// Loading every weight of six families would trade a network problem for a
// bundle problem. Anton and Instrument Serif ship 400 alone — that is the whole
// family, not an omission.

// Canopy — Space Grotesk (display) + Hanken Grotesk (body)
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-500.css";
import "@fontsource/hanken-grotesk/latin-600.css";
import "@fontsource/hanken-grotesk/latin-700.css";
import "@fontsource/hanken-grotesk/latin-800.css";

// Pulse — Anton (display) + Archivo (body)
import "@fontsource/anton/latin-400.css";
import "@fontsource/archivo/latin-400.css";
import "@fontsource/archivo/latin-500.css";
import "@fontsource/archivo/latin-600.css";
import "@fontsource/archivo/latin-700.css";
import "@fontsource/archivo/latin-800.css";

// Atelier — Instrument Serif (display) + Manrope (body)
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";

// Space Grotesk tops out at 700 and Anton/Instrument Serif at 400. Anything in
// the UI asking for 800 in those faces gets synthesised by the browser, exactly
// as it did when these came from the CDN — no visual change, just no request.
