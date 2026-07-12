import { describe, expect, it } from "vitest";
import { masteryLevelFromXp, masteryProgress, masteryXpForLevel, poiseForHealth, SIGNATURES } from "../src/game/combat";

describe("combat progression", () => {
  it("advances mastery at deterministic thresholds", () => {
    expect(masteryLevelFromXp(0)).toBe(1);
    expect(masteryLevelFromXp(masteryXpForLevel(1) - 1)).toBe(1);
    expect(masteryLevelFromXp(masteryXpForLevel(1))).toBe(2);
    expect(masteryProgress(masteryXpForLevel(1) + 7)).toEqual({ level: 2, current: 7, needed: masteryXpForLevel(2) });
  });

  it("gives every relic a distinct affordable signature", () => {
    const names = Object.values(SIGNATURES).map((signature) => signature.name);
    expect(new Set(names).size).toBe(3);
    expect(Object.values(SIGNATURES).every((signature) => signature.staminaCost > 0 && signature.cooldown > 0)).toBe(true);
  });

  it("makes aggressive creatures harder to stagger", () => {
    expect(poiseForHealth(40, "aggressive")).toBeGreaterThan(poiseForHealth(40, "passive"));
  });
});
