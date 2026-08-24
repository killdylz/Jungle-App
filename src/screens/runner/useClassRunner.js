// ─── useClassRunner — everything that makes a class RUN ───────────────────────
// I6 stage 5. The runner's surfaces moved into this folder; this is the state
// and the clock behind them, lifted out of App.jsx's root component in the same
// change. The point is not line count: it is that "what happens when a stage
// ends" used to be four `useEffect`s scattered between the skin loader and the
// share-card handler, and reading them in order meant reading the whole root.
//
// What stays in App.jsx and is passed IN, deliberately:
//   • `stages` / `sessionName` — the Builder owns the class; the runner only
//     plays it. Moving them here would make the Builder ask the runner for the
//     plan it is editing.
//   • `sessionHistory` — the Dashboard and the profile modal both read it.
//   • the Spotify handles — `useSpotify()` is called once at the root.
//   • `view` / `setView` — routing is the root's job, and three of the effects
//     below are gated on which screen the coach is looking at.
//
// Everything else is here, and the returned object is the whole runner API.
import { useState, useEffect, useRef } from "react";
import { FLAGS } from "../../config/flags.js";
import * as store from "../../lib/store.js";
import { onRoomState, sendRoomState } from "../../lib/room.js";
import { localDateStr } from "../../lib/format.js";
import { apiPlay, rampVolume } from "../../music/index.js";

// The end-of-stage siren. Three descending tones, because one beep is lost in a
// room with music and twenty people in it.
function fireSiren() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    [0,0.55,1.1].forEach(off => {
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(880,ctx.currentTime+off);
      o.frequency.linearRampToValueAtTime(440,ctx.currentTime+off+0.42);
      g.gain.setValueAtTime(0.28,ctx.currentTime+off);
      g.gain.linearRampToValueAtTime(0,ctx.currentTime+off+0.5);
      o.start(ctx.currentTime+off); o.stop(ctx.currentTime+off+0.52);
    });
  } catch(_) {}
}

export function useClassRunner({
  view, setView, stages, sessionName, setSessionName,
  player, deviceId, activeDeviceId, nowPlaying, crossfade,
  sessionHistory, setSessionHistory, gymId,
}) {
  // Class Runner umbrella (B+C): sub-mode within the runner view, and which of
  // the merged Room TV surfaces is showing.
  const [runnerTab,  setRunnerTab]  = useState("run");     // "run" | "dj"
  const [roomTvMode, setRoomTvMode] = useState("studio");  // "studio" | "floor" | "coach"
  // Realtime room: a Room TV on another device can FOLLOW the active runner.
  const [followRoom, setFollowRoom] = useState(false);
  const [remoteRoom, setRemoteRoom] = useState(null);      // last broadcast { stages, sessionName, liveState, nowPlaying, at }
  const [liveState,  setLiveState]  = useState({ playing:false, idx:0, elapsed:0 });

  const saveSession = () => {
    const totalElapsed = stages.slice(0, liveState.idx).reduce((a,s)=>a+s.dur,0) + liveState.elapsed;
    if (totalElapsed < 10) return;
    // 🔴 LOCAL calendar date (S31 §2.4). This was `toISOString().slice(0,10)`,
    // and `ProfileModal` DISPLAYS it — so a coach teaching at 7am in Singapore
    // saw yesterday's date against the session they had just finished. It must
    // move together with the streak reader in ProfileModal, which compares
    // against it: changing either alone breaks the count.
    const record = { date:localDateStr(), name:sessionName, stages:stages.length,
      durMin:Math.round(totalElapsed/60), ts:Date.now(), stageTypes:[...new Set(stages.map(s=>s.type))] };
    const updated = [record, ...sessionHistory].slice(0,100);
    setSessionHistory(updated);
    store.saveHistory(updated);        // local: whole capped array
    store.appendSessionHistory(record); // server: immutable insert of this session
  };

  // ── Session timer ─────────────────────────────────────────────────────────
  const stagesRef = useRef(stages);
  stagesRef.current = stages;
  const liveStateRef = useRef(liveState);
  liveStateRef.current = liveState;
  const crossfadeRef = useRef(crossfade);
  crossfadeRef.current = crossfade;
  useEffect(() => {
    if (view!=="live"&&view!=="room-tv") return;
    if (!liveState.playing) return;
    const iv = setInterval(() => {
      setLiveState(ls => {
        const ss = stagesRef.current;
        const dur = ss[ls.idx]?.dur||1;
        const next = ls.elapsed+1;
        if (next >= dur) {
          fireSiren();
          if (ls.idx < ss.length-1) return {...ls, idx:ls.idx+1, elapsed:0};
          if (player) player.pause().catch(()=>{});
          clearInterval(iv);
          saveSession();
          return {...ls, playing:false, elapsed:dur};
        }
        return {...ls, elapsed:next};
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [view, liveState.playing, player]);

  useEffect(() => {
    // FLAGS.music first so the whole effect body — and with it the only
    // remaining root-side reference to apiPlay/rampVolume — folds away with
    // music cut. `view!=="live"` alone is runtime state and folds nothing.
    if (!FLAGS.music) return;
    if (view!=="live"||!liveState.playing) return;
    const uris = (stages[liveState.idx]?.tracks||[]).map(t=>t.uri).filter(Boolean);
    if (!uris.length) return;
    const dev = activeDeviceId||deviceId;
    if (!dev) return;
    apiPlay(dev, uris).catch(()=>{});
    if (crossfadeRef.current > 0 && player) rampVolume(player, 0, 0.8, crossfadeRef.current);
  }, [view, liveState.playing, liveState.idx]);

  // F7: Global Space = play/pause. Prevents Space from clicking whatever button has focus.
  // Live view is owned by LiveScreen's own handler, so skip it here to avoid a double toggle.
  useEffect(() => {
    const onSpace = (e) => {
      if (e.key !== " " && e.code !== "Space") return;
      if (view === "live") return;
      const el = e.target;
      if (el && (["INPUT","TEXTAREA","SELECT"].includes(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      const willPlay = !liveStateRef.current.playing;
      if (player) { willPlay ? player.resume().catch(()=>{}) : player.pause().catch(()=>{}); }
      setLiveState(ls => ({ ...ls, playing: willPlay }));
    };
    window.addEventListener("keydown", onSpace);
    return () => window.removeEventListener("keydown", onSpace);
  }, [view, player]);

  // ── Realtime room (B+C): runner broadcasts, a following Room TV mirrors ────
  // Broadcasts ride the 1/s live tick while the runner is playing; tracks are
  // stripped (the TV never needs Spotify URIs) to keep payloads small.
  useEffect(() => {
    if (!gymId || view !== "live" || !liveState.playing) return;
    sendRoomState(gymId, {
      sessionName,
      liveState,
      at: Date.now(),
      stages: stagesRef.current.map(s => ({ ...s, tracks: [] })),
      nowPlaying: nowPlaying ? { name: nowPlaying.name, artists: (nowPlaying.artists || []).map(a => ({ name: a.name })) } : null,
    });
  }, [view, liveState, sessionName, gymId]);
  useEffect(() => {
    if (!gymId || view !== "room-tv" || !followRoom) return;
    return onRoomState(gymId, p => setRemoteRoom(p));
  }, [gymId, view, followRoom]);

  // ── Transport ─────────────────────────────────────────────────────────────
  const handleNextStage = () => setLiveState(ls => ls.idx<stages.length-1 ? {...ls,idx:ls.idx+1,elapsed:0} : ls);
  // The Runner's back button was wired to `handleNextStage` — the same handler as
  // forward — so a coach who advanced too early and reached for "back" skipped
  // the room ANOTHER stage on. Found by the accessible-name sweep: the control
  // had no name, so nothing in the suite had ever referred to it, and both
  // buttons render a correct-looking icon either way.
  const handlePrevStage = () => setLiveState(ls => ls.idx>0 ? {...ls,idx:ls.idx-1,elapsed:0} : ls);
  const handleSkipTimer = secs => setLiveState(ls => ({...ls, elapsed:Math.max(0,Math.min(ls.elapsed+secs,(stages[ls.idx]?.dur||1)-1))}));

  // ── §3A: the coach starts a class FROM the Schedule ───────────────────────
  // The join between the Schedule and the Runner used to be a name and a clock,
  // and nothing made the Builder's `sessionName` equal the schedule rule's name —
  // so publishing a week and then running that class produced TWO class_instances
  // rows, with the check-ins on the Runner's and the published one stuck at zero
  // attendance forever. Loosening the match would have been worse than the bug:
  // guessing which scheduled occurrence a coach is running attaches attendance to
  // the wrong class, permanently and invisibly.
  //
  // So the occurrence is chosen, not inferred. `pinnedClass` holds it for as long
  // as the coach is running it, and CheckInPanel resolves by that id.
  const [pinnedClass, setPinnedClass] = useState(null);
  const handleStartScheduled = (occ) => {
    const r = store.startScheduledClass(occ);
    if (!r) return;
    setPinnedClass(r.instance);
    // The name follows the schedule, which is the other half of the fix: even if
    // the pin is lost (a reload — this is in-memory state), `sessionName` is
    // persisted with the draft, so the name-and-window join in
    // ensureClassInstance lands on the same published row rather than a new one.
    setSessionName(r.instance.name);
    setLiveState({ playing:false, idx:0, elapsed:0 });
    // The Builder, not the runner: the coach still has to confirm which PLAN this
    // class runs, and dropping them into a live timer over whatever draft happened
    // to be loaded — now wearing the scheduled class's name — would be the
    // confident wrong guess this repo keeps deleting.
    setView("builder");
  };

  return {
    liveState, setLiveState,
    runnerTab, setRunnerTab,
    roomTvMode, setRoomTvMode,
    followRoom, setFollowRoom,
    remoteRoom,
    pinnedClass, setPinnedClass,
    handleNextStage, handlePrevStage, handleSkipTimer,
    handleStartScheduled,
    saveSession,
  };
}
