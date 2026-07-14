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
const SCOPES = "https://www.googleapis.com/auth/presentations.readonly https://www.googleapis.com/auth/drive.readonly";

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
