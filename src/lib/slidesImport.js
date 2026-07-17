// Google Slides import (workstream D, chunk 3).
//
// Reads a coach's class-plan decks straight from their Google Drive folder:
// Google Identity Services token client → Drive files.list (presentations in
// the folder) → Slides presentations.get → concatenated slide text, ready for
// persona-ai task:"extract".
//
// Uses a DEDICATED OAuth client in its own Google Cloud project (consent
// screen in Testing mode, coaches added as test users) so the live login
// OAuth app is never touched. The client ID is public by design — only the
// read-only scopes below are requested, and Google grants them per-user.
const SLIDES_CLIENT_ID = import.meta.env.VITE_GOOGLE_SLIDES_CLIENT_ID;
const SCOPE_SLIDES = "https://www.googleapis.com/auth/presentations.readonly";
const SCOPE_DRIVE  = "https://www.googleapis.com/auth/drive.readonly";
const SCOPES = `${SCOPE_SLIDES} ${SCOPE_DRIVE}`;

export const slidesEnabled = !!SLIDES_CLIENT_ID;

// ── Google Identity Services loader + token cache ──────────────────────────
let gisPromise = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { gisPromise = null; reject(new Error("Couldn't load Google sign-in — check your connection.")); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

// Access token kept in memory only (never persisted); Google tokens last ~1h.
let cachedToken = null; // { token, exp }

export async function getSlidesToken() {
  if (!slidesEnabled) throw new Error("Google Slides import isn't configured (missing VITE_GOOGLE_SLIDES_CLIENT_ID).");
  if (cachedToken && Date.now() < cachedToken.exp - 60_000) return cachedToken.token;
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: SLIDES_CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
        // Google's consent popup shows a CHECKBOX per permission and users can
        // grant only some. A token without the Drive scope fails every call
        // downstream ("insufficient authentication scopes") — catch it here,
        // never cache it, and say exactly what to re-tick.
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE_SLIDES, SCOPE_DRIVE)) {
          reject(new Error('Google granted only part of the access. Click again and tick BOTH checkboxes on the Google popup ("See your Google Slides presentations" and "See and download your Google Drive files").'));
          return;
        }
        cachedToken = { token: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 };
        resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err?.message || "Google sign-in was cancelled.")),
    });
    client.requestAccessToken();
  });
}

// ── Drive: resolve whatever the coach pastes ───────────────────────────────
// Accepts a folder URL (…/drive/folders/<id>), a presentation URL
// (docs.google.com/presentation/d/<id>/edit…), any …/d/<id> or ?id=<id> link,
// or a bare ID. Returns just the ID — resolveDriveTarget then asks Drive what
// it actually is (a bare ID could be either a folder or a single deck).
export function parseDriveId(input) {
  const s = (input || "").trim();
  if (!s) return "";
  const m = s.match(/\/folders\/([A-Za-z0-9_-]+)/)
         || s.match(/\/d\/([A-Za-z0-9_-]+)/)
         || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : "";
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
const SLIDES_MIME = "application/vnd.google-apps.presentation";

// One files.get tells us whether the pasted link is a whole folder or a single
// deck: { kind:"folder", id } or { kind:"presentation", deck:{id,name,modifiedTime} }.
export async function resolveDriveTarget(token, input) {
  const id = parseDriveId(input);
  if (!id) throw new Error("Paste a Drive folder link, a Slides deck link, or its ID.");
  const f = await gapi(token, `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,modifiedTime`);
  if (f.mimeType === FOLDER_MIME) return { kind: "folder", id: f.id };
  if (f.mimeType === SLIDES_MIME) return { kind: "presentation", deck: { id: f.id, name: f.name, modifiedTime: f.modifiedTime || "" } };
  throw new Error(`That link is a ${f.mimeType?.split(".").pop() || "file"}, not a folder or Slides deck.`);
}

async function gapi(token, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let msg = `Google API error ${res.status}`;
    try { msg = (await res.json())?.error?.message || msg; } catch { /* keep status text */ }
    if (/insufficient.*scopes/i.test(msg)) {
      cachedToken = null; // drop the partial-grant token so the next click re-prompts
      msg = 'Google granted only part of the access. Click again and tick BOTH checkboxes on the Google popup ("See your Google Slides presentations" and "See and download your Google Drive files").';
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function listPresentations(token, folderId) {
  const decks = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and mimeType='application/vnd.google-apps.presentation' and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const data = await gapi(token, url);
    decks.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return decks;
}

// ── Slides: pull every text run out of a presentation ──────────────────────
// Slide text lives in shapes, tables and grouped elements; speaker notes ride
// along on each slide's notes page. All of it is signal for extraction.
function elementText(el, out) {
  (el.shape?.text?.textElements || []).forEach(te => { const t = te.textRun?.content; if (t) out.push(t); });
  (el.table?.tableRows || []).forEach(row => (row.tableCells || []).forEach(cell =>
    (cell.text?.textElements || []).forEach(te => { const t = te.textRun?.content; if (t) out.push(t); })));
  (el.elementGroup?.children || []).forEach(child => elementText(child, out));
}

export async function fetchPresentationText(token, presentationId) {
  const data = await gapi(token, `https://slides.googleapis.com/v1/presentations/${presentationId}`);
  const parts = [];
  (data.slides || []).forEach((slide, i) => {
    const body = [];
    (slide.pageElements || []).forEach(el => elementText(el, body));
    const notes = [];
    (slide.slideProperties?.notesPage?.pageElements || []).forEach(el => elementText(el, notes));
    let text = body.join("").trim();
    const notesText = notes.join("").trim();
    if (notesText) text += `\nNotes: ${notesText}`;
    if (text.trim()) parts.push(`--- Slide ${i + 1} ---\n${text.trim()}`);
  });
  return { title: data.title || "", text: parts.join("\n\n") };
}

// A coach's deck often holds a WHOLE HISTORY of classes — one class per slide
// (e.g. an "S360" deck with 18 dated sessions). fetchPresentationText tags each
// slide "--- Slide N ---"; split back on that so each class can be extracted on
// its own (the extractor handles one class at a time). Returns [{ n, text }].
export function splitDeckSlides(deckText) {
  const t = (deckText || "").trim();
  if (!t) return [];
  const slides = [];
  const re = /^--- Slide (\d+) ---$/gm;
  let m, prev = null;
  while ((m = re.exec(t)) !== null) {
    if (prev) slides.push({ n: prev.n, text: t.slice(prev.end, m.index).trim() });
    prev = { n: Number(m[1]), end: m.index + m[0].length };
  }
  if (prev) slides.push({ n: prev.n, text: t.slice(prev.end).trim() });
  // No markers at all (single unlabelled deck) → treat the whole thing as one.
  const filled = slides.filter(s => s.text);
  return filled.length ? filled : [{ n: 1, text: t }];
}

const MONTHS = ["january","february","march","april","may","june","july","august",
                "september","october","november","december"];
// Pull a plan date out of a slide's own text ("11 July 2026" → "2026-07-11") so
// each dated session keeps its real date instead of the deck's last-modified time.
export function slideDate(text) {
  const m = (text || "").match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
  if (!m) return "";
  const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}
