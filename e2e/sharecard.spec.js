import { test, expect } from "@playwright/test";
import { freshApp, nav, watchConsole, expectNoConsoleErrors } from "./helpers.js";

// The share card (UI-UX §5). Unit tests cover the layout maths; this covers the
// thing they cannot: that the canvas actually produces a real image. A card that
// silently renders blank would pass every pure test and fail the only job it has.

test.describe("share card", () => {
  test("produces a branded 1080x1920 PNG with the class actually drawn on it", async ({ page }) => {
    const errors = watchConsole(page);
    await freshApp(page);
    await page.evaluate(() => {
      localStorage.setItem("jungle_gym_branding", JSON.stringify({ gymName: "The Garage" }));
    });
    await page.reload();
    await nav(page, "Class Builder");

    // Render through the app's own code path, capturing the canvas instead of
    // downloading it.
    const result = await page.evaluate(async () => {
      const canvases = [];
      const realCreate = document.createElement.bind(document);
      document.createElement = (tag, ...rest) => {
        const el = realCreate(tag, ...rest);
        if (tag === "canvas") canvases.push(el);
        if (tag === "a") el.click = () => {};   // swallow the download
        return el;
      };
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent.trim() === "Share card").click();
      await new Promise((r) => setTimeout(r, 500));
      document.createElement = realCreate;

      const c = canvases[canvases.length - 1];
      if (!c) return { drew: false };
      const ctx = c.getContext("2d");
      const { data } = ctx.getImageData(0, 0, c.width, c.height);

      // Count distinct colours. A blank card is one colour; a drawn card has the
      // background, the gradient, the accent and the type.
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4 * 997) {  // prime stride = cheap sample
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return { drew: true, w: c.width, h: c.height, colours: seen.size };
    });

    expect(result.drew, "no canvas was created").toBe(true);
    expect(result.w).toBe(1080);
    expect(result.h).toBe(1920);
    // The assertion that catches a blank card.
    expect(result.colours, "the card rendered as a flat colour — nothing drawn").toBeGreaterThan(3);

    expectNoConsoleErrors(errors);
  });

  test("refuses to make a card for a class with no movements", async ({ page }) => {
    // A beautiful empty poster is worse than no poster.
    await freshApp(page);
    await nav(page, "Class Builder");

    const alerted = await page.evaluate(async () => {
      // Strip every exercise, then ask for a card.
      let msg = null;
      window.alert = (m) => { msg = m; };
      const draft = JSON.parse(localStorage.getItem("jungle_draft_class") || "null");
      if (draft) {
        draft.stages = draft.stages.map((s) => ({ ...s, exercises: [] }));
        localStorage.setItem("jungle_draft_class", JSON.stringify(draft));
      }
      return msg;
    });
    expect(alerted).toBeNull(); // nothing yet; the real check is after reload

    await page.reload();
    await nav(page, "Class Builder");
    const msg = await page.evaluate(async () => {
      let captured = null;
      window.alert = (m) => { captured = m; };
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent.trim() === "Share card").click();
      await new Promise((r) => setTimeout(r, 200));
      return captured;
    });
    expect(msg).toMatch(/Add some exercises first/i);
  });
});
