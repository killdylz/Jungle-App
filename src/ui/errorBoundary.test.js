import { describe, it, expect, beforeEach, vi } from "vitest";
import { recordCrash, getCrashLog, CRASH_LOG_KEY } from "./ErrorBoundary.jsx";

// The crash log runs on the error path, which is the one place a defect is
// guaranteed to compound: a logger that throws turns a recoverable panel error
// into the white screen the boundary exists to prevent.

describe("crash log", () => {
  beforeEach(() => localStorage.clear());

  it("records what is needed to identify which panel died", () => {
    recordCrash("Class Runner", new Error("boom"), { componentStack: "\n  at LiveScreen" });
    const [entry] = getCrashLog();
    expect(entry.panel).toBe("Class Runner");
    expect(entry.message).toBe("boom");
    expect(entry.componentStack).toContain("LiveScreen");
    expect(Date.parse(entry.at)).not.toBeNaN();
  });

  it("keeps the most recent first and caps the list", () => {
    // Unbounded, this fills localStorage and breaks the app far more thoroughly
    // than whatever it was logging.
    for (let i = 0; i < 9; i++) recordCrash("p", new Error(`e${i}`), {});
    const log = getCrashLog();
    expect(log).toHaveLength(5);
    expect(log[0].message).toBe("e8");
  });

  it("truncates stacks instead of filling the quota", () => {
    const huge = new Error("big");
    huge.stack = "x".repeat(50_000);
    recordCrash("p", huge, { componentStack: "y".repeat(50_000) });
    const [entry] = getCrashLog();
    expect(entry.stack.length).toBeLessThanOrEqual(2000);
    expect(entry.componentStack.length).toBeLessThanOrEqual(1000);
  });

  it("never throws, whatever it is handed", () => {
    expect(() => recordCrash(undefined, undefined, undefined)).not.toThrow();
    expect(() => recordCrash(null, "a string, not an Error", null)).not.toThrow();
    expect(() => recordCrash("p", { message: null }, {})).not.toThrow();
  });

  it("survives a full localStorage without breaking the boundary", () => {
    // Spied on the localStorage OBJECT, not Storage.prototype: this suite runs
    // against a lightweight shim where the DOM `Storage` class does not exist.
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => recordCrash("p", new Error("boom"), {})).not.toThrow();
    spy.mockRestore();
  });

  it("returns an empty log rather than throwing on corrupt storage", () => {
    localStorage.setItem(CRASH_LOG_KEY, "not json");
    expect(getCrashLog()).toEqual([]);
    localStorage.setItem(CRASH_LOG_KEY, JSON.stringify({ not: "an array" }));
    expect(getCrashLog()).toEqual([]);
  });
});
