import { describe, it, expect, beforeEach } from "vitest";
import {
  getMemberIdentities, inviteMemberToApp, revokeMemberAppAccess, memberAppAccess,
  getParqResponses, recordParq, recordParqClearance, parqStatus, PARQ_VALID_MONTHS,
  getPrograms, createProgram, activateProgram, setProgramStatus,
  getPtSessions, createPtSession, setPtSessionStatus, _sessionToRow,
  getSetLogs, logSet, correctSetLog, setLogsForSession, setLogsForMember, _setLogToRow,
} from "./store.js";

// ─── The PT store domain ─────────────────────────────────────────────────────
// localStorage-only here: `_synced()` is false without Supabase configured, so
// every push path is a no-op and what is under test is the local truth — which
// is the layer the trainer's phone actually reads mid-session, offline.

const MEMBER = "m-1";
beforeEach(() => localStorage.clear());

const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString();

describe("app access is three states, not a boolean", () => {
  it("reports none, invited and linked separately", () => {
    // "Invited 6 days ago, not opened" and "using the app" are different facts,
    // and a trainer chasing an unresponsive client needs to tell them apart.
    expect(memberAppAccess(MEMBER).state).toBe("none");

    inviteMemberToApp(MEMBER);
    expect(memberAppAccess(MEMBER).state).toBe("invited");
    expect(memberAppAccess(MEMBER).row.linkedAt).toBeNull();

    const list = getMemberIdentities().map(r => ({ ...r, linkedAt: daysAgo(1) }));
    localStorage.setItem("jungle_pt_identities", JSON.stringify(list));
    expect(memberAppAccess(MEMBER).state).toBe("linked");
  });

  it("re-inviting updates the row rather than adding a second one", () => {
    // member_id is the PRIMARY KEY server-side, so a second row is rejected —
    // and locally it would make "which link owns this record" ambiguous.
    inviteMemberToApp(MEMBER);
    inviteMemberToApp(MEMBER);
    expect(getMemberIdentities().length).toBe(1);
  });

  it("revoking keeps the row but ends access", () => {
    inviteMemberToApp(MEMBER);
    expect(revokeMemberAppAccess(MEMBER).ok).toBe(true);
    // The record of who granted access survives; the access does not.
    expect(getMemberIdentities().length).toBe(1);
    expect(getMemberIdentities()[0].revokedAt).toBeTruthy();
    expect(memberAppAccess(MEMBER).state).toBe("none");
  });

  it("refuses to revoke someone who was never invited", () => {
    expect(revokeMemberAppAccess(MEMBER)).toMatchObject({ ok: false, reason: "not-invited" });
  });
});

describe("parqStatus names the reason, because each needs a different action", () => {
  it("never-screened", () => {
    expect(parqStatus(MEMBER)).toMatchObject({ ok: false, reason: "never-screened" });
  });

  it("clears a clean form and dates its expiry twelve months out", () => {
    const { response } = recordParq({ memberId: MEMBER });
    expect(parqStatus(MEMBER).ok).toBe(true);
    const months = (new Date(response.expiresAt).getFullYear() - new Date(response.completedAt).getFullYear()) * 12
      + (new Date(response.expiresAt).getMonth() - new Date(response.completedAt).getMonth());
    expect(months).toBe(PARQ_VALID_MONTHS);
  });

  it("expired", () => {
    recordParq({ memberId: MEMBER, completedAt: daysAgo(400) });
    expect(parqStatus(MEMBER)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("flagged-uncleared, until clearance is recorded", () => {
    const { response } = recordParq({ memberId: MEMBER, flagged: true });
    expect(parqStatus(MEMBER)).toMatchObject({ ok: false, reason: "flagged-uncleared" });
    recordParqClearance(response.id, "Dr Tan 2026-08-14");
    expect(parqStatus(MEMBER).ok).toBe(true);
  });

  it("reads the LATEST form, so an older clean one cannot rescue a new flag", () => {
    // The newest answers are what the person most recently said about their own
    // health. A rule that took "any valid form" would let last year's clean
    // screening override this morning's disclosure of chest pain.
    recordParq({ memberId: MEMBER, completedAt: daysAgo(30) });
    recordParq({ memberId: MEMBER, completedAt: daysAgo(1), flagged: true });
    expect(parqStatus(MEMBER)).toMatchObject({ ok: false, reason: "flagged-uncleared" });
  });

  it("does not confuse one member's screening with another's", () => {
    recordParq({ memberId: "someone-else" });
    expect(parqStatus(MEMBER).ok).toBe(false);
  });
});

describe("programs are born draft and PAR-Q gates activation", () => {
  it("createProgram cannot produce anything but a draft", () => {
    // 0012's client-read policy refuses drafts, so a program born active would
    // appear in someone's app the instant a generator finished.
    const { program } = createProgram({ memberId: MEMBER, title: "Base 1", status: "active" });
    expect(program.status).toBe("draft");
  });

  it("refuses a program with no member or no title", () => {
    expect(createProgram({ title: "x" })).toMatchObject({ ok: false, reason: "no-member" });
    expect(createProgram({ memberId: MEMBER, title: "   " })).toMatchObject({ ok: false, reason: "no-title" });
  });

  it("refuses activation without screening, and says which screening problem", () => {
    const { program } = createProgram({ memberId: MEMBER, title: "Base 1" });
    const r = activateProgram(program.id);
    expect(r).toMatchObject({ ok: false, reason: "parq" });
    expect(r.screening.reason).toBe("never-screened");
    // …and the local row is untouched. A refused activation that still wrote
    // locally would fail 0013's trigger upstream and surface as a sync error,
    // which is the silent-failure shape this gate exists to avoid.
    expect(getPrograms()[0].status).toBe("draft");
  });

  it("activates once screening is valid", () => {
    recordParq({ memberId: MEMBER });
    const { program } = createProgram({ memberId: MEMBER, title: "Base 1" });
    expect(activateProgram(program.id).ok).toBe(true);
    expect(getPrograms()[0].status).toBe("active");
  });

  it("setProgramStatus cannot be used to route around the gate", () => {
    // The mistake this branch exists to catch: reaching for the generic setter
    // with "active" instead of the gated one.
    const { program } = createProgram({ memberId: MEMBER, title: "Base 1" });
    expect(setProgramStatus(program.id, "active")).toMatchObject({ ok: false, reason: "parq" });
    expect(getPrograms()[0].status).toBe("draft");
  });

  it("still allows the ungated transitions", () => {
    const { program } = createProgram({ memberId: MEMBER, title: "Base 1" });
    expect(setProgramStatus(program.id, "archived").ok).toBe(true);
    expect(getPrograms()[0].status).toBe("archived");
  });

  it("coerces an unknown status to draft rather than writing it", () => {
    const { program } = createProgram({ memberId: MEMBER, title: "Base 1" });
    setProgramStatus(program.id, "paused");        // not in the CHECK
    expect(getPrograms()[0].status).toBe("draft");
  });
});

describe("sessions satisfy the XOR by construction", () => {
  it("a PT session row always carries member_id and never class_instance_id", () => {
    // 0012's CHECK rejects a row with both or neither. The mapper cannot emit an
    // illegal row because classInstanceId is not a parameter at all.
    const { session } = createPtSession({ memberId: MEMBER, startsAt: daysAgo(0) });
    const row = _sessionToRow(session);
    expect(row.member_id).toBe(MEMBER);
    expect(row.class_instance_id).toBeNull();
  });

  it("refuses a session with no member or no time", () => {
    expect(createPtSession({ startsAt: daysAgo(0) })).toMatchObject({ ok: false, reason: "no-member" });
    expect(createPtSession({ memberId: MEMBER })).toMatchObject({ ok: false, reason: "no-time" });
  });

  it("normalises an unknown status to planned, never inventing a delivery", () => {
    // A lost status must not read as delivered: that would also spend a session
    // credit the client paid for.
    const { session } = createPtSession({ memberId: MEMBER, startsAt: daysAgo(0) });
    setPtSessionStatus(session.id, "attended");    // not in the CHECK
    expect(getPtSessions()[0].status).toBe("planned");
    expect(setPtSessionStatus(session.id, "delivered").ok).toBe(true);
    expect(getPtSessions()[0].status).toBe("delivered");
  });
});

describe("set logs are corrected by superseding, never by editing", () => {
  const seed = () => {
    const { session } = createPtSession({ memberId: MEMBER, startsAt: daysAgo(0) });
    const { log } = logSet({ sessionId: session.id, memberId: MEMBER,
                             movement: "Back Squat", setIndex: 1, reps: 5, loadKg: 100, rir: 2 });
    return { session, log };
  };

  it("records a set and normalises its source", () => {
    const { session } = createPtSession({ memberId: MEMBER, startsAt: daysAgo(0) });
    const { log } = logSet({ sessionId: session.id, memberId: MEMBER, movement: "Row",
                             setIndex: 1, reps: 10, source: "watch" });
    expect(log.source).toBe("trainer");            // not in the CHECK → coerced
    expect(_setLogToRow(log).source).toBe("trainer");
  });

  it("refuses a log with no movement or no session", () => {
    const { session } = createPtSession({ memberId: MEMBER, startsAt: daysAgo(0) });
    expect(logSet({ sessionId: session.id, memberId: MEMBER, movement: "  " }))
      .toMatchObject({ ok: false, reason: "no-movement" });
    expect(logSet({ memberId: MEMBER, movement: "Row" }))
      .toMatchObject({ ok: false, reason: "no-session" });
  });

  it("a correction adds a row and voids the original — the old values survive", () => {
    // The 100-for-10 typo. Both facts have to remain readable: what was recorded,
    // and that it was corrected.
    const { log } = seed();
    const r = correctSetLog(log.id, { loadKg: 10 });
    expect(r.ok).toBe(true);

    const all = getSetLogs();
    expect(all.length).toBe(2);
    const original = all.find(l => l.id === log.id);
    expect(original.voided).toBe(true);
    expect(original.loadKg).toBe(100);             // history is not rewritten
    expect(r.log.supersedesId).toBe(log.id);
    expect(r.log.loadKg).toBe(10);
    expect(r.log.voided).toBe(false);
  });

  it("carries unchanged fields onto the superseding row", () => {
    const { log } = seed();
    const { log: fixed } = correctSetLog(log.id, { loadKg: 10 });
    expect(fixed.reps).toBe(5);
    expect(fixed.movement).toBe("Back Squat");
    expect(fixed.performedAt).toBe(log.performedAt);   // when it happened, not when it was fixed
  });

  it("refuses to correct a row that is already superseded", () => {
    const { log } = seed();
    correctSetLog(log.id, { loadKg: 10 });
    expect(correctSetLog(log.id, { loadKg: 20 }))
      .toMatchObject({ ok: false, reason: "already-superseded" });
  });

  it("reads return current truth only", () => {
    const { session, log } = seed();
    correctSetLog(log.id, { loadKg: 10 });
    expect(setLogsForSession(session.id).length).toBe(1);
    expect(setLogsForSession(session.id)[0].loadKg).toBe(10);
    expect(setLogsForMember(MEMBER).length).toBe(1);
    // …while the superseded row is still in storage for the audit trail.
    expect(getSetLogs().length).toBe(2);
  });

  it("does not leak one member's sets into another's history", () => {
    const { session } = createPtSession({ memberId: MEMBER, startsAt: daysAgo(0) });
    logSet({ sessionId: session.id, memberId: MEMBER, movement: "Row", setIndex: 1, reps: 10 });
    logSet({ sessionId: session.id, memberId: "other", movement: "Row", setIndex: 1, reps: 10 });
    expect(setLogsForMember(MEMBER).length).toBe(1);
    expect(setLogsForMember("other").length).toBe(1);
  });
});
