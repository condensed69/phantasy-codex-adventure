export const MAX_LEVEL = 99;

export function xpForNextLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return 45 + safeLevel * 10 + Math.floor(safeLevel ** 1.55 * 4);
}

export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let current = 1; current < Math.min(MAX_LEVEL, level); current += 1) {
    total += xpForNextLevel(current);
  }
  return total;
}

export function levelFromTotalXp(totalXp: number): number {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let threshold = 0;

  while (level < MAX_LEVEL) {
    const next = xpForNextLevel(level);
    if (xp < threshold + next) break;
    threshold += next;
    level += 1;
  }

  return level;
}

export function levelProgress(totalXp: number): { level: number; current: number; needed: number } {
  const level = levelFromTotalXp(totalXp);
  const floor = totalXpForLevel(level);
  return {
    level,
    current: Math.max(0, totalXp - floor),
    needed: level === MAX_LEVEL ? 1 : xpForNextLevel(level),
  };
}
