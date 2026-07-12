import { describe, expect, it } from "vitest";
import { levelFromTotalXp, totalXpForLevel, xpForNextLevel } from "../src/game/progression";

describe("progression", () => {
  it("increases XP requirements each level", () => {
    expect(xpForNextLevel(5)).toBeGreaterThan(xpForNextLevel(1));
    expect(xpForNextLevel(20)).toBeGreaterThan(xpForNextLevel(5));
  });

  it("derives levels from authoritative total XP", () => {
    expect(levelFromTotalXp(0)).toBe(1);
    expect(levelFromTotalXp(totalXpForLevel(7))).toBe(7);
    expect(levelFromTotalXp(totalXpForLevel(7) - 1)).toBe(6);
  });
});
