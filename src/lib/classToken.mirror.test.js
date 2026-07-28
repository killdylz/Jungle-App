import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { extractCore } from "../../scripts/sync-token-core.mjs";

// ─── The copies must stay byte-identical, and only a test can enforce that ───
//
// A Supabase Edge Function is deployed by pasting ONE file into a dashboard, so
// it cannot import from src/. The token core therefore exists three times. That
// is not a style problem, it is a correctness problem with a nasty shape: if
// `summary-token` signs with one implementation and `summary-read` verifies
// with a drifted one, every member link ever minted starts returning
// "bad-signature", and it looks exactly like a wrong secret. Nobody would find
// it by reading either file, because each file is individually correct.
//
// So this reads the REAL .ts files off disk and compares them to the canonical
// block, the same way dbConstraints.test.js parses the real migrations instead
// of restating them. Restating the expected bytes here would pin the copies
// against a fourth copy and catch nothing.
//
// If this fails: run `node scripts/sync-token-core.mjs`.

const FUNCTIONS = [
  "supabase/functions/summary-token/index.ts",
  "supabase/functions/summary-read/index.ts",
];

const repoFile = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

describe("shared token core — mirrored into the Edge Functions", () => {
  const canonical = extractCore(repoFile("src/lib/classToken.js"));

  it("finds a core worth comparing (the extractor is not silently returning nothing)", () => {
    // Session 16's rule: assert your scanner found something. A regex that
    // matched nothing would make every comparison below trivially pass.
    expect(canonical.length).toBeGreaterThan(1500);
    expect(canonical).toContain("export async function signClassToken");
    expect(canonical).toContain("export async function verifyClassToken");
    expect(canonical).toContain("crypto.subtle.verify");
  });

  it.each(FUNCTIONS)("%s carries the core byte for byte", (rel) => {
    expect(repoFile(rel)).toContain(canonical);
  });

  it.each(FUNCTIONS)("%s has no leftover placeholder", (rel) => {
    expect(repoFile(rel)).not.toContain("__TOKEN_CORE__");
  });

  it("keeps both functions on the same token version", () => {
    for (const rel of FUNCTIONS) {
      expect(repoFile(rel), rel).toContain('export const TOKEN_VERSION = "v1"');
    }
  });

  it("never lets the read function reach a table that holds a person", () => {
    // The security claim in summary-read's header is "it never reads members,
    // attendance, consent_records or profiles". A claim in a comment is worth
    // nothing; this is the same claim as a test. If a future edit adds such a
    // read, this fails and the header has to be argued with rather than
    // quietly outgrown.
    const src = repoFile("supabase/functions/summary-read/index.ts");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    for (const table of ["members", "attendance", "consent_records", "profiles", "retention_actions"]) {
      expect(code, table).not.toContain(`${table}?`);
    }
    // And it does read the four it is supposed to.
    for (const table of ["class_instances?", "class_summaries?", "gyms?"]) {
      expect(code, table).toContain(table);
    }
  });

  it("keeps the service-role key out of the issuing function", () => {
    // summary-token runs entirely under the caller's JWT so RLS is the
    // authorization check. Reaching for the service-role key there would
    // silently remove that property.
    expect(repoFile("supabase/functions/summary-token/index.ts")).not.toContain("SERVICE_ROLE");
  });
});
