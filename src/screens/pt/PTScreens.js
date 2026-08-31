// One entry point for the 1:1 cluster, and it exists for a bundling reason
// rather than a tidiness one.
//
// App.jsx `React.lazy`s BOTH screens. Pointed at two different files, rollup
// emits two chunks and then a third for what they share (`lib/parq.js`,
// `lib/ptClients.js`) — and that third chunk gets a generated name that is not
// in `scripts/check-size.mjs`, which means it counts toward the file total and
// has no ceiling at all. The size guard's own header calls that out as the way a
// new lazy screen grows unchecked.
//
// Importing the same specifier twice gives one chunk, named after this file, with
// one budget line to keep honest.
export { PTScreen } from "./PTScreen.jsx";
export { ParqScreen } from "./ParqScreen.jsx";
