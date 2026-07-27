// The Class Runner cluster (I6 stage 5).
//
// Everything the coach uses to RUN a class, and every surface the ROOM sees
// while it runs. App.jsx imports from this barrel and from nowhere inside the
// folder, so the cluster's internals — the display kit, the check-in panel, the
// three Room TV modes — can be rearranged without touching the root.
//
// Not lazy, on purpose. `React.lazy` here would put a network fetch between a
// coach tapping "Start class" and the room seeing a timer, and the runner is
// the one screen in this product that has to work when the studio wifi does
// not. The personas cluster is split because a coach opens it once a week; this
// is opened every class. See src/screens/personas for the other side of that call.
export { LiveScreen } from "./LiveScreen.jsx";
export { RoomTV } from "./RoomTV.jsx";
export { useClassRunner } from "./useClassRunner.js";
