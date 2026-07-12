export type WeaponKind = "sword" | "spear" | "wand";
export type CreatureTemperament = "passive" | "aggressive";
export type TileKind = "water" | "grass" | "flowers" | "sand" | "forest" | "stone" | "ruins";

export interface Vector {
  x: number;
  y: number;
}

export interface PlayerStats {
  maxHealth: number;
  health: number;
  maxStamina: number;
  stamina: number;
  power: number;
  armor: number;
  speed: number;
  luck: number;
  totalXp: number;
  level: number;
}

export interface WeaponState {
  kind: WeaponKind;
  tier: number;
  damageBonus: number;
  speedBonus: number;
  special: number;
}

export interface Creature {
  id: number;
  kind: "mossling" | "hornhare" | "emberfox" | "boneguard" | "wisp";
  temperament: CreatureTemperament;
  position: Vector;
  velocity: Vector;
  health: number;
  maxHealth: number;
  damage: number;
  speed: number;
  xp: number;
  radius: number;
  aggro: boolean;
  hurtFlash: number;
  attackCooldown: number;
  wanderAngle: number;
  wanderTimer: number;
}

export interface Projectile {
  id: number;
  position: Vector;
  velocity: Vector;
  radius: number;
  damage: number;
  life: number;
  color: string;
  pierce: number;
  hitIds: Set<number>;
}

export interface FloatingText {
  id: number;
  position: Vector;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface Particle {
  id: number;
  position: Vector;
  velocity: Vector;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export interface UpgradeChoice {
  id: string;
  icon: string;
  title: string;
  description: string;
  rarity: "common" | "rare" | "mythic";
  apply: (stats: PlayerStats, weapons: Record<WeaponKind, WeaponState>) => void;
}
