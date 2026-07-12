import { levelFromTotalXp } from "../src/game/progression";
import type { WeaponKind } from "../src/game/types";

const PLAYER_NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,14}[A-Za-z0-9]$/;
const WEAPONS = new Set<WeaponKind>(["sword", "spear", "wand"]);

export interface SubmittedRun {
  sessionId: string;
  playerName: string;
  totalXp: number;
  weapon: WeaponKind;
}

export interface ValidatedRun extends SubmittedRun {
  level: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function validateRunSubmission(value: unknown): ValidatedRun {
  const data = asRecord(value);
  if (!data) throw new Error("Run data must be an object.");

  const sessionId = typeof data.sessionId === "string" ? data.sessionId : "";
  const playerName = typeof data.playerName === "string" ? data.playerName.trim().replace(/\s+/g, " ") : "";
  const totalXp = typeof data.totalXp === "number" ? Math.floor(data.totalXp) : Number.NaN;
  const weapon = data.weapon;

  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("The run session is invalid.");
  if (!PLAYER_NAME.test(playerName)) {
    throw new Error("Name must be 2–16 letters, numbers, spaces, dashes, or underscores.");
  }
  if (!Number.isSafeInteger(totalXp) || totalXp < 0 || totalXp > 10_000_000) {
    throw new Error("The XP total is invalid.");
  }
  if (typeof weapon !== "string" || !WEAPONS.has(weapon as WeaponKind)) {
    throw new Error("The weapon is invalid.");
  }

  return {
    sessionId,
    playerName,
    totalXp,
    weapon: weapon as WeaponKind,
    level: levelFromTotalXp(totalXp),
  };
}

export function isPlausibleRun(totalXp: number, durationSeconds: number): boolean {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 5 || durationSeconds > 43_200) return false;
  return totalXp <= 300 + durationSeconds * 120;
}
