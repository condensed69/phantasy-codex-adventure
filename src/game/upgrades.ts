import type { UpgradeChoice, WeaponKind, WeaponState } from "./types";
import { SeededRandom } from "./rng";

const upgrade = (
  id: string,
  icon: string,
  title: string,
  description: string,
  rarity: UpgradeChoice["rarity"],
  apply: UpgradeChoice["apply"],
): UpgradeChoice => ({ id, icon, title, description, rarity, apply });

const POOL: UpgradeChoice[] = [
  upgrade("heart", "♥", "Hero's Heart", "+18 maximum health and heal 18.", "common", (stats) => {
    stats.maxHealth += 18;
    stats.health = Math.min(stats.maxHealth, stats.health + 18);
  }),
  upgrade("wind", "≋", "Windstep", "+8% movement speed and +10 stamina.", "common", (stats) => {
    stats.speed *= 1.08;
    stats.maxStamina += 10;
    stats.stamina = stats.maxStamina;
  }),
  upgrade("power", "✹", "Giant's Verse", "+3 power to every relic weapon.", "rare", (stats) => {
    stats.power += 3;
  }),
  upgrade("armor", "◆", "Stone Psalm", "+2 armor and restore 25 health.", "common", (stats) => {
    stats.armor += 2;
    stats.health = Math.min(stats.maxHealth, stats.health + 25);
  }),
  upgrade("fortune", "♧", "Fortune's Wink", "+6 luck: more critical strikes and richer drops.", "rare", (stats) => {
    stats.luck += 6;
  }),
  upgrade("sword", "⚔", "Sunblade Temper", "Sword tier +1: wider, faster, and fiercer arcs.", "rare", (_stats, weapons) => {
    weapons.sword.tier += 1;
    weapons.sword.damageBonus += 3;
    weapons.sword.speedBonus += 0.06;
  }),
  upgrade("spear", "↟", "Thornlance Temper", "Spear tier +1: longer thrusts with stronger pierce.", "rare", (_stats, weapons) => {
    weapons.spear.tier += 1;
    weapons.spear.damageBonus += 4;
    weapons.spear.special += 1;
  }),
  upgrade("wand", "✦", "Starwand Temper", "Wand tier +1: brighter bolts and quicker casting.", "rare", (_stats, weapons) => {
    weapons.wand.tier += 1;
    weapons.wand.damageBonus += 3;
    weapons.wand.speedBonus += 0.07;
  }),
  upgrade("trinity", "❖", "Relic Concord", "All three weapons gain damage and attack speed.", "mythic", (_stats, weapons) => {
    (Object.keys(weapons) as WeaponKind[]).forEach((kind) => {
      weapons[kind].damageBonus += 2;
      weapons[kind].speedBonus += 0.04;
    });
  }),
];

export function createWeaponStates(): Record<WeaponKind, WeaponState> {
  return {
    sword: { kind: "sword", tier: 1, damageBonus: 0, speedBonus: 0, special: 0, masteryLevel: 1, masteryXp: 0 },
    spear: { kind: "spear", tier: 1, damageBonus: 0, speedBonus: 0, special: 1, masteryLevel: 1, masteryXp: 0 },
    wand: { kind: "wand", tier: 1, damageBonus: 0, speedBonus: 0, special: 0, masteryLevel: 1, masteryXp: 0 },
  };
}

export function rollUpgradeChoices(seed: number, level: number): UpgradeChoice[] {
  const rng = new SeededRandom(seed ^ Math.imul(level, 0x9e3779b1));
  const available = [...POOL];
  const choices: UpgradeChoice[] = [];

  while (choices.length < 3 && available.length > 0) {
    const index = rng.int(0, available.length - 1);
    const [choice] = available.splice(index, 1);
    if (choice) choices.push(choice);
  }

  return choices;
}
