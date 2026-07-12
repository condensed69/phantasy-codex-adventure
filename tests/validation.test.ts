import { describe, expect, it } from "vitest";
import { isPlausibleRun, validateRunSubmission } from "../worker/validation";
import { levelFromTotalXp } from "../src/game/progression";

const sessionId = "123e4567-e89b-12d3-a456-426614174000";

describe("leaderboard validation", () => {
  it("normalizes the name and derives level server-side", () => {
    const result = validateRunSubmission({ sessionId, playerName: "  Rune   Fox ", totalXp: 12_345, weapon: "wand" });
    expect(result.playerName).toBe("Rune Fox");
    expect(result.level).toBe(levelFromTotalXp(12_345));
  });

  it("rejects unsafe names and unknown weapons", () => {
    expect(() => validateRunSubmission({ sessionId, playerName: "<script>", totalXp: 5, weapon: "wand" })).toThrow();
    expect(() => validateRunSubmission({ sessionId, playerName: "Hero", totalXp: 5, weapon: "axe" })).toThrow();
  });

  it("places a generous ceiling on client score claims", () => {
    expect(isPlausibleRun(1_000, 30)).toBe(true);
    expect(isPlausibleRun(50_000, 30)).toBe(false);
    expect(isPlausibleRun(100, 2)).toBe(false);
  });
});
