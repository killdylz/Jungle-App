// ─── Local element ids ───────────────────────────────────────────────────────
//
// Stage and block ids for objects that exist only in the browser until they are
// saved. Deliberately NOT `crypto.randomUUID`: these are short, readable, and
// appear in React keys and in exported class JSON that a coach may open.
//
// ONE counter, in one module, shared by every caller. This lived in App.jsx and
// moved here when the personas cluster was extracted (I6 stage 4) — and it is
// the one piece of that extraction that could not be copied. Two modules with
// their own `_uid = 1` would both mint "s1", and the collision would surface as
// React reconciling two different stages as the same node: a rendering bug that
// looks like state corruption and would be miserable to trace back here.
let _uid = 1;
export const uid = () => `s${_uid++}`;
