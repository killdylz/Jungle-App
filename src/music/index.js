// ─── The music subsystem — quarantined behind FLAGS.music ────────────────────
//
// Every music surface in Jungle is reachable only through this barrel, which is
// the point of decomposition stage 3: "is this music?" is now answerable by a
// path, not by reading 500 scattered lines of App.jsx.
//
// The subsystem is CUT from the sellable product (audit 2.1 / I7): Spotify's
// consumer ToS prohibits commercial-premises playback, and public performance in
// Singapore needs COMPASS/RIPS licences the GYM must hold. It is quarantined
// rather than deleted so the post-pilot decision stays reversible — and a
// quarantine you cannot reverse without a white screen is not a quarantine, which
// is why the phantom <SpotifySearchModal/> was resolved as part of this move.
//
// TempoGuide is deliberately NOT here: it needs no licence and is the display's
// honest no-music state, so it stays with the display code in App.jsx.
export { useSpotify, MUSIC_OFF } from "./useSpotify.js";
export { IS_CONFIGURED, redirectToSpotify } from "./spotifyAuth.js";
export { apiPlay, rampVolume, enrichTracksWithBpm } from "./spotifyApi.js";
export { TrackItem, TrackSearch } from "./TrackSearch.jsx";
export { MusicHubScreen } from "./MusicHubScreen.jsx";
export { PlaylistImportModal } from "./PlaylistImportModal.jsx";
export { SpotifyDevicePicker } from "./DevicePicker.jsx";
export { DjPlaylistModal, AutoDjPanel } from "./AutoDjPanel.jsx";
export { runDjOrchestrator } from "./djOrchestrator.js";
export { ConnectSpotifyPrompt } from "./ConnectSpotifyPrompt.jsx";
