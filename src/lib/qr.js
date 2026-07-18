// Local QR generation.
//
// Replaces `api.qrserver.com`, which was on the Fable deprecation list for two
// reasons that both bite hardest exactly where QR matters most (F4 attendance
// check-in): a third party must not sit in the check-in path — if their host is
// slow or down, nobody checks in and the retention instrument starves (A7) — and
// the encoded payload must never travel through someone else's URL, because at
// F4 that payload identifies a member.
//
// `qrcode` renders to a data: URL entirely in the browser, so the QR works
// offline (design principle P7, degrade gracefully) and leaks nothing.
import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Defaults match the room-display palette the old service was asked for.
export function toQrDataUrl(text, opts = {}) {
  const { size = 240, dark = "#EEEEEE", light = "#060D18", margin = 2 } = opts;
  if (!text) return Promise.resolve("");
  return QRCode.toDataURL(text, {
    width: size,
    margin,
    color: { dark, light },
    // "M" (~15% recovery) is the right trade for a screen-displayed code read at
    // arm's length: higher levels inflate module count and shrink each module.
    errorCorrectionLevel: "M",
  });
}

// Hook form: generation is async, so a component can't render it inline.
// Returns "" until ready, and on failure — callers already handle an empty src.
export function useQrDataUrl(text, opts) {
  const [src, setSrc] = useState("");
  const { size, dark, light, margin } = opts || {};
  useEffect(() => {
    let alive = true;
    if (!text) { setSrc(""); return undefined; }
    toQrDataUrl(text, { size, dark, light, margin })
      .then(url => { if (alive) setSrc(url); })
      .catch(() => { if (alive) setSrc(""); });
    // Guards against a stale async result overwriting a newer one when the
    // encoded payload changes mid-flight (stage edits re-derive the URL).
    return () => { alive = false; };
  }, [text, size, dark, light, margin]);
  return src;
}
