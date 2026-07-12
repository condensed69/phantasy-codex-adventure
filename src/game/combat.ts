import type { WeaponKind } from "./types";

export interface SignatureData {
  name: string;
  description: string;
  cooldown: number;
  staminaCost: number;
}

export const SIGNATURES: Record<WeaponKind, SignatureData> = {
  sword: {
    name: "Solar Cyclone",
    description: "A radiant full-circle cleave that crushes poise.",
    cooldown: 6.4,
    staminaCost: 20,
  },
  spear: {
    name: "Comet Rush",
    description: "Dash through a line of foes with a piercing thrust.",
    cooldown: 5.8,
    staminaCost: 22,
  },
  wand: {
    name: "Triune Nova",
    description: "Cast three echoing bolts that pierce their first target.",
    cooldown: 6.8,
    staminaCost: 18,
  },
};

export function masteryXpForLevel(level: number): number {
  return 32 + Math.max(0, level - 1) * 28;
}

export function masteryLevelFromXp(totalXp: number): number {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= masteryXpForLevel(level)) {
    remaining -= masteryXpForLevel(level);
    level += 1;
  }
  return level;
}

export function masteryProgress(totalXp: number): { level: number; current: number; needed: number } {
  let level = 1;
  let current = Math.max(0, Math.floor(totalXp));
  while (current >= masteryXpForLevel(level)) {
    current -= masteryXpForLevel(level);
    level += 1;
  }
  return { level, current, needed: masteryXpForLevel(level) };
}

export function poiseForHealth(health: number, temperament: "passive" | "aggressive"): number {
  const temperamentBonus = temperament === "aggressive" ? 8 : 0;
  return Math.max(18, Math.round(health * 0.58) + temperamentBonus);
}
