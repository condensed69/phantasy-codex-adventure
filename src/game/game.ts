import { levelProgress } from "./progression";
import { masteryLevelFromXp, SIGNATURES, poiseForHealth } from "./combat";
import { SeededRandom } from "./rng";
import { CodexSound } from "./sound";
import type {
  Creature,
  FloatingText,
  Particle,
  PlayerStats,
  Projectile,
  UpgradeChoice,
  Vector,
  WeaponKind,
  WeaponState,
} from "./types";
import { createWeaponStates, rollUpgradeChoices } from "./upgrades";
import { generateWorld, isWalkable, TILE_SIZE, tileAt, WORLD_SIZE, WORLD_TILES } from "./world";

export interface GameSnapshot {
  stats: PlayerStats;
  weapons: Record<WeaponKind, WeaponState>;
  weapon: WeaponKind;
  region: string;
  seed: number;
  elapsedSeconds: number;
  defeated: number;
  abilityCooldown: number;
  dodgeCooldown: number;
}

export interface GameOverSummary extends GameSnapshot {
  sessionId: string;
}

interface GameHooks {
  onStats: (snapshot: GameSnapshot) => void;
  onWeapon: (weapon: WeaponKind) => void;
  onLevelUp: (level: number, choices: UpgradeChoice[]) => void;
  onGameOver: (summary: GameOverSummary) => void;
}

interface Player {
  position: Vector;
  direction: Vector;
  radius: number;
  hurtCooldown: number;
  attackCooldown: number;
  attackVisual: number;
  attackKind: WeaponKind;
  walkCycle: number;
  dodgeCooldown: number;
  dodgeTimer: number;
  dodgeDirection: Vector;
}

const COLORS = {
  grass: ["#4d9a68", "#43895f"],
  flowers: ["#529f68", "#48905f"],
  water: ["#337c91", "#2f7088"],
  sand: ["#c8ad68", "#bca15e"],
  forest: ["#285b45", "#244f3d"],
  stone: ["#697481", "#606a78"],
  ruins: ["#8b8376", "#777365"],
} as const;

const WEAPON_DATA: Record<WeaponKind, { cost: number; cooldown: number; baseDamage: number; label: string; glyph: string }> = {
  sword: { cost: 10, cooldown: 0.32, baseDamage: 14, label: "Sunblade", glyph: "⚔" },
  spear: { cost: 13, cooldown: 0.44, baseDamage: 18, label: "Thornlance", glyph: "↟" },
  wand: { cost: 8, cooldown: 0.38, baseDamage: 11, label: "Starwand", glyph: "✦" },
};

const CREATURE_DATA = {
  mossling: { temperament: "passive", health: 26, damage: 6, speed: 48, xp: 20, radius: 12 },
  hornhare: { temperament: "passive", health: 35, damage: 8, speed: 70, xp: 28, radius: 11 },
  emberfox: { temperament: "aggressive", health: 42, damage: 10, speed: 78, xp: 38, radius: 12 },
  boneguard: { temperament: "aggressive", health: 64, damage: 13, speed: 45, xp: 55, radius: 14 },
  wisp: { temperament: "aggressive", health: 30, damage: 9, speed: 64, xp: 35, radius: 10 },
} as const;

type CreatureKind = keyof typeof CREATURE_DATA;
type Mode = "idle" | "playing" | "paused" | "levelup" | "sheet" | "dead";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(vector: Vector): Vector {
  const length = Math.hypot(vector.x, vector.y);
  return length > 0.0001 ? { x: vector.x / length, y: vector.y / length } : { x: 0, y: 0 };
}

function angleDifference(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export class PhantasyGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly hooks: GameHooks;
  readonly sound = new CodexSound();
  private mode: Mode = "idle";
  private resumeMode: Mode = "playing";
  private world = generateWorld(1);
  private rng = new SeededRandom(1);
  private player: Player = this.createPlayer();
  private stats = this.createStats();
  private weapons = createWeaponStates();
  private weapon: WeaponKind = "sword";
  private creatures: Creature[] = [];
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private lastFrame = performance.now();
  private spawnTimer = 2.5;
  private elapsedSeconds = 0;
  private defeated = 0;
  private entityId = 1;
  private shake = 0;
  private flash = 0;
  private lastReported = 0;
  private sessionId = "";
  private abilityCooldown = 0;
  private signatureVisual = 0;
  private signatureKind: WeaponKind = "sword";

  constructor(canvas: HTMLCanvasElement, hooks: GameHooks) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is not supported.");
    this.context = context;
    this.context.imageSmoothingEnabled = false;
    this.hooks = hooks;
    this.bindInput();
    requestAnimationFrame(this.frame);
  }

  private createPlayer(): Player {
    return {
      position: { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 + 80 },
      direction: { x: 0, y: 1 },
      radius: 11,
      hurtCooldown: 0,
      attackCooldown: 0,
      attackVisual: 0,
      attackKind: "sword",
      walkCycle: 0,
      dodgeCooldown: 0,
      dodgeTimer: 0,
      dodgeDirection: { x: 0, y: 1 },
    };
  }

  private createStats(): PlayerStats {
    return {
      maxHealth: 120,
      health: 120,
      maxStamina: 60,
      stamina: 60,
      power: 6,
      armor: 2,
      speed: 150,
      luck: 4,
      totalXp: 0,
      level: 1,
    };
  }

  private bindInput(): void {
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "tab"].includes(key)) event.preventDefault();
      if (!this.keys.has(key)) this.pressed.add(key);
      this.keys.add(key);
      if (key === "1" || key === "2" || key === "3") this.setWeapon(({ "1": "sword", "2": "spear", "3": "wand" } as const)[key]);
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.key.toLowerCase()));
    this.canvas.addEventListener("pointerdown", () => {
      this.pressed.add("j");
      this.canvas.focus();
    });
    window.addEventListener("blur", () => this.keys.clear());
  }

  start(seed: number, sessionId: string): void {
    this.world = generateWorld(seed);
    this.rng = new SeededRandom(seed ^ 0xa53c9e17);
    this.player = this.createPlayer();
    this.stats = this.createStats();
    this.weapons = createWeaponStates();
    this.weapon = "sword";
    this.creatures = [];
    this.projectiles = [];
    this.particles = [];
    this.texts = [];
    this.elapsedSeconds = 0;
    this.defeated = 0;
    this.spawnTimer = 2.5;
    this.shake = 0;
    this.flash = 0;
    this.sessionId = sessionId;
    this.abilityCooldown = 0;
    this.signatureVisual = 0;
    this.mode = "playing";
    this.lastFrame = performance.now();
    this.hooks.onWeapon(this.weapon);
    this.reportStats(true);
    this.canvas.focus();
  }

  resetToIdle(): void {
    this.mode = "idle";
  }

  queueAction(action: "j" | "f" | "shift"): void {
    if (this.mode !== "playing") return;
    this.pressed.add(action);
    this.canvas.focus();
  }

  setWeapon(kind: WeaponKind): void {
    if (this.mode === "dead" || this.mode === "idle") return;
    this.weapon = kind;
    this.hooks.onWeapon(kind);
    this.addText(this.player.position, `${WEAPON_DATA[kind].glyph} ${WEAPON_DATA[kind].label}`, "#fff0ad", 0.75, 0.85);
    this.sound.tone(kind === "wand" ? 650 : 320, 0.08, "square", 0.02, 60);
    this.reportStats(true);
  }

  togglePause(): boolean {
    if (this.mode === "playing") this.mode = "paused";
    else if (this.mode === "paused") this.mode = "playing";
    return this.mode === "paused";
  }

  toggleSheet(): boolean {
    if (this.mode === "idle" || this.mode === "dead" || this.mode === "levelup") return false;
    if (this.mode === "sheet") this.mode = this.resumeMode;
    else {
      this.resumeMode = this.mode === "paused" ? "paused" : "playing";
      this.mode = "sheet";
    }
    return this.mode === "sheet";
  }

  chooseUpgrade(choice: UpgradeChoice): void {
    if (this.mode !== "levelup") return;
    choice.apply(this.stats, this.weapons);
    this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + Math.ceil(this.stats.maxHealth * 0.2));
    this.stats.stamina = this.stats.maxStamina;
    this.mode = "playing";
    this.addText(this.player.position, choice.title, choice.rarity === "mythic" ? "#e3a8ff" : "#ffdb72", 1.2, 1.1);
    this.burst(this.player.position, choice.rarity === "mythic" ? "#dba0ff" : "#ffce62", 24, 130);
    this.sound.reward();
    this.reportStats(true);
  }

  getSnapshot(): GameSnapshot {
    return {
      stats: { ...this.stats },
      weapons: {
        sword: { ...this.weapons.sword },
        spear: { ...this.weapons.spear },
        wand: { ...this.weapons.wand },
      },
      weapon: this.weapon,
      region: this.world.title,
      seed: this.world.seed,
      elapsedSeconds: Math.floor(this.elapsedSeconds),
      defeated: this.defeated,
      abilityCooldown: this.abilityCooldown,
      dodgeCooldown: this.player.dodgeCooldown,
    };
  }

  private readonly frame = (now: number): void => {
    const delta = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;

    if (this.mode === "playing") this.update(delta);
    this.render(now / 1000);
    this.pressed.clear();
    requestAnimationFrame(this.frame);
  };

  private update(delta: number): void {
    this.elapsedSeconds += delta;
    this.player.attackCooldown = Math.max(0, this.player.attackCooldown - delta);
    this.player.hurtCooldown = Math.max(0, this.player.hurtCooldown - delta);
    this.player.attackVisual = Math.max(0, this.player.attackVisual - delta);
    this.player.dodgeCooldown = Math.max(0, this.player.dodgeCooldown - delta);
    this.player.dodgeTimer = Math.max(0, this.player.dodgeTimer - delta);
    this.abilityCooldown = Math.max(0, this.abilityCooldown - delta);
    this.signatureVisual = Math.max(0, this.signatureVisual - delta);
    this.shake = Math.max(0, this.shake - delta * 18);
    this.flash = Math.max(0, this.flash - delta * 3.5);

    this.updateMovement(delta);
    if (this.pressed.has("j") || this.pressed.has("z") || this.pressed.has("enter") || this.pressed.has(" ")) this.attack();
    if (this.pressed.has("f")) this.useSignature();
    if (this.pressed.has("p") || this.pressed.has("escape")) this.mode = "paused";
    this.updateSpawning(delta);
    this.updateCreatures(delta);
    this.updateProjectiles(delta);
    this.updateEffects(delta);

    this.stats.stamina = Math.min(this.stats.maxStamina, this.stats.stamina + delta * 14);
    this.reportStats();
  }

  private updateMovement(delta: number): void {
    const input = {
      x: Number(this.keys.has("d") || this.keys.has("arrowright")) - Number(this.keys.has("a") || this.keys.has("arrowleft")),
      y: Number(this.keys.has("s") || this.keys.has("arrowdown")) - Number(this.keys.has("w") || this.keys.has("arrowup")),
    };
    const movement = normalize(input);
    if (this.pressed.has("shift") && this.player.dodgeCooldown <= 0 && this.stats.stamina >= 16) {
      const dodgeDirection = movement.x !== 0 || movement.y !== 0 ? movement : this.player.direction;
      this.player.dodgeDirection = dodgeDirection;
      this.player.direction = dodgeDirection;
      this.player.dodgeTimer = 0.2;
      this.player.dodgeCooldown = 0.72;
      this.stats.stamina -= 16;
      this.burst(this.player.position, "#8be8d4", 8, 72);
      this.sound.tone(260, 0.12, "sine", 0.025, 300);
    }

    if (this.player.dodgeTimer > 0) {
      this.moveWithCollision(
        this.player.position,
        this.player.dodgeDirection.x * this.stats.speed * 3.15 * delta,
        this.player.dodgeDirection.y * this.stats.speed * 3.15 * delta,
        this.player.radius,
      );
      if (this.rng.chance(0.55)) this.burst(this.player.position, "#80d9c0", 1, 18);
      return;
    }
    const speed = this.stats.speed;

    if (movement.x !== 0 || movement.y !== 0) {
      this.player.direction = movement;
      this.player.walkCycle += delta * speed * 0.08;
      this.moveWithCollision(this.player.position, movement.x * speed * delta, movement.y * speed * delta, this.player.radius);
    }
  }

  private moveWithCollision(position: Vector, dx: number, dy: number, radius: number): void {
    const nextX = clamp(position.x + dx, radius, WORLD_SIZE - radius);
    if (this.canStand(nextX, position.y, radius)) position.x = nextX;
    const nextY = clamp(position.y + dy, radius, WORLD_SIZE - radius);
    if (this.canStand(position.x, nextY, radius)) position.y = nextY;
  }

  private canStand(x: number, y: number, radius: number): boolean {
    return [
      [x - radius, y - radius],
      [x + radius, y - radius],
      [x - radius, y + radius],
      [x + radius, y + radius],
    ].every(([px, py]) => isWalkable(tileAt(this.world, px ?? x, py ?? y)));
  }

  private attack(): void {
    const data = WEAPON_DATA[this.weapon];
    const weapon = this.weapons[this.weapon];
    if (this.player.attackCooldown > 0 || this.stats.stamina < data.cost) return;
    this.stats.stamina -= data.cost;
    this.player.attackCooldown = Math.max(0.14, data.cooldown - weapon.speedBonus);
    this.player.attackVisual = this.weapon === "wand" ? 0.18 : 0.2;
    this.player.attackKind = this.weapon;
    this.sound.attack(this.weapon);

    if (this.weapon === "wand") {
      const speed = 420 + weapon.tier * 12;
      const castDirection = this.assistedCastDirection();
      this.projectiles.push({
        id: this.entityId++,
        weapon: "wand",
        position: {
          x: this.player.position.x + castDirection.x * 18,
          y: this.player.position.y + castDirection.y * 18,
        },
        velocity: { x: castDirection.x * speed, y: castDirection.y * speed },
        radius: 6 + Math.min(3, weapon.tier),
        damage: data.baseDamage + this.stats.power + weapon.damageBonus,
        life: 1.15,
        color: "#bda0ff",
        pierce: weapon.tier >= 4 ? 1 : 0,
        poiseDamage: 10 + weapon.tier * 2,
        hitIds: new Set(),
      });
      return;
    }

    const reach = this.weapon === "sword" ? 55 + weapon.tier * 2 : 82 + weapon.tier * 4;
    const halfArc = this.weapon === "sword" ? 1.1 + weapon.tier * 0.035 : 0.38;
    const directionAngle = Math.atan2(this.player.direction.y, this.player.direction.x);
    let hits = 0;
    const pierceLimit = this.weapon === "spear" ? 1 + weapon.special : 99;

    for (const creature of this.creatures.sort((a, b) => distance(a.position, this.player.position) - distance(b.position, this.player.position))) {
      const targetDistance = distance(creature.position, this.player.position);
      const targetAngle = Math.atan2(creature.position.y - this.player.position.y, creature.position.x - this.player.position.x);
      if (targetDistance <= reach + creature.radius && Math.abs(angleDifference(targetAngle, directionAngle)) <= halfArc) {
        const falloff = this.weapon === "spear" && targetDistance > reach * 0.7 ? 1.25 : 1;
        this.damageCreature(
          creature,
          Math.round((data.baseDamage + this.stats.power + weapon.damageBonus) * falloff),
          this.player.direction,
          this.weapon,
          this.weapon === "spear" ? 22 + weapon.tier * 3 : 16 + weapon.tier * 2,
        );
        hits += 1;
        if (hits >= pierceLimit) break;
      }
    }
  }

  private useSignature(): void {
    const signature = SIGNATURES[this.weapon];
    const weapon = this.weapons[this.weapon];
    if (this.abilityCooldown > 0 || this.stats.stamina < signature.staminaCost) return;
    this.stats.stamina -= signature.staminaCost;
    this.abilityCooldown = signature.cooldown * Math.max(0.72, 1 - (weapon.masteryLevel - 1) * 0.04);
    this.signatureVisual = 0.42;
    this.signatureKind = this.weapon;
    this.player.attackVisual = 0;
    this.sound.tone(this.weapon === "wand" ? 720 : 190, 0.28, "sawtooth", 0.035, this.weapon === "spear" ? 380 : 160);
    this.addText(this.player.position, signature.name.toUpperCase(), "#fff1a6", 0.9, 0.82);

    const data = WEAPON_DATA[this.weapon];
    const baseDamage = data.baseDamage + this.stats.power + weapon.damageBonus;
    if (this.weapon === "sword") {
      for (const creature of [...this.creatures]) {
        const targetDirection = normalize({ x: creature.position.x - this.player.position.x, y: creature.position.y - this.player.position.y });
        if (distance(creature.position, this.player.position) <= 106 + creature.radius) {
          this.damageCreature(creature, Math.round(baseDamage * 1.7), targetDirection, "sword", 68 + weapon.tier * 6);
        }
      }
      this.burst(this.player.position, "#ffd967", 30, 175);
      this.shake = 8;
      return;
    }

    if (this.weapon === "spear") {
      const start = { ...this.player.position };
      const length = 148 + weapon.tier * 6;
      for (const creature of [...this.creatures]) {
        const relative = { x: creature.position.x - start.x, y: creature.position.y - start.y };
        const along = relative.x * this.player.direction.x + relative.y * this.player.direction.y;
        const sideways = Math.abs(relative.x * this.player.direction.y - relative.y * this.player.direction.x);
        if (along >= 0 && along <= length && sideways <= 28 + creature.radius) {
          this.damageCreature(creature, Math.round(baseDamage * 1.85), this.player.direction, "spear", 74 + weapon.tier * 7);
        }
      }
      this.moveWithCollision(
        this.player.position,
        this.player.direction.x * length,
        this.player.direction.y * length,
        this.player.radius,
      );
      this.burst(this.player.position, "#8ee5b7", 22, 145);
      this.shake = 7;
      return;
    }

    const angle = Math.atan2(this.player.direction.y, this.player.direction.x);
    for (const spread of [-0.24, 0, 0.24]) {
      const direction = { x: Math.cos(angle + spread), y: Math.sin(angle + spread) };
      this.projectiles.push({
        id: this.entityId++,
        weapon: "wand",
        position: { x: this.player.position.x + direction.x * 20, y: this.player.position.y + direction.y * 20 },
        velocity: { x: direction.x * 470, y: direction.y * 470 },
        radius: 8,
        damage: Math.round(baseDamage * 1.45),
        life: 1.25,
        color: "#d7b4ff",
        pierce: 2,
        poiseDamage: 34 + weapon.tier * 4,
        hitIds: new Set(),
      });
    }
    this.burst(this.player.position, "#b997ff", 28, 130);
  }

  private assistedCastDirection(): Vector {
    let best: { direction: Vector; distance: number } | null = null;
    for (const creature of this.creatures) {
      const target = {
        x: creature.position.x - this.player.position.x,
        y: creature.position.y - this.player.position.y,
      };
      const targetDistance = Math.hypot(target.x, target.y);
      if (targetDistance > 340 || targetDistance < 0.001) continue;
      const direction = normalize(target);
      const facingDot = direction.x * this.player.direction.x + direction.y * this.player.direction.y;
      if (facingDot < 0.42) continue;
      if (!best || targetDistance < best.distance) best = { direction, distance: targetDistance };
    }
    return best?.direction ?? this.player.direction;
  }

  private updateSpawning(delta: number): void {
    this.spawnTimer -= delta;
    const maxCreatures = Math.min(38, 12 + this.stats.level * 2);
    if (this.spawnTimer > 0 || this.creatures.length >= maxCreatures) return;
    this.spawnTimer = Math.max(0.48, 1.48 - this.stats.level * 0.03);

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const angle = this.rng.next() * Math.PI * 2;
      const spawnDistance = this.rng.int(280, 455);
      const position = {
        x: clamp(this.player.position.x + Math.cos(angle) * spawnDistance, 30, WORLD_SIZE - 30),
        y: clamp(this.player.position.y + Math.sin(angle) * spawnDistance, 30, WORLD_SIZE - 30),
      };
      if (!this.canStand(position.x, position.y, 15)) continue;

      const roll = this.rng.next() + Math.min(0.35, this.stats.level * 0.012);
      let kind: CreatureKind = "mossling";
      if (roll > 1.14) kind = "boneguard";
      else if (roll > 0.94) kind = "wisp";
      else if (roll > 0.73) kind = "emberfox";
      else if (roll > 0.35) kind = "hornhare";
      const base = CREATURE_DATA[kind];
      const scale = 1 + Math.max(0, this.stats.level - 1) * 0.055;
      const maxHealth = Math.round(base.health * scale);
      const maxPoise = poiseForHealth(maxHealth, base.temperament);
      this.creatures.push({
        id: this.entityId++,
        kind,
        temperament: base.temperament,
        position,
        velocity: { x: 0, y: 0 },
        health: maxHealth,
        maxHealth,
        poise: maxPoise,
        maxPoise,
        brokenTimer: 0,
        damage: Math.round(base.damage * (1 + (this.stats.level - 1) * 0.035)),
        speed: base.speed * (1 + Math.min(0.25, this.stats.level * 0.008)),
        xp: Math.round(base.xp * (1 + (this.stats.level - 1) * 0.04)),
        radius: base.radius,
        aggro: base.temperament === "aggressive",
        hurtFlash: 0,
        attackCooldown: this.rng.next(),
        wanderAngle: this.rng.next() * Math.PI * 2,
        wanderTimer: this.rng.next() * 2,
      });
      break;
    }
  }

  private updateCreatures(delta: number): void {
    for (const creature of this.creatures) {
      creature.hurtFlash = Math.max(0, creature.hurtFlash - delta * 6);
      creature.attackCooldown = Math.max(0, creature.attackCooldown - delta);
      if (creature.brokenTimer > 0) {
        creature.brokenTimer = Math.max(0, creature.brokenTimer - delta);
        creature.velocity = { x: 0, y: 0 };
        if (creature.brokenTimer === 0) creature.poise = creature.maxPoise;
        continue;
      }
      const playerDistance = distance(creature.position, this.player.position);
      if (creature.temperament === "aggressive" && playerDistance < 300) creature.aggro = true;
      if (creature.aggro && playerDistance < 470) {
        const direction = normalize({ x: this.player.position.x - creature.position.x, y: this.player.position.y - creature.position.y });
        creature.velocity.x = direction.x * creature.speed;
        creature.velocity.y = direction.y * creature.speed;
      } else {
        creature.wanderTimer -= delta;
        if (creature.wanderTimer <= 0) {
          creature.wanderTimer = this.rng.int(10, 30) / 10;
          creature.wanderAngle += (this.rng.next() - 0.5) * 2.4;
        }
        creature.velocity.x = Math.cos(creature.wanderAngle) * creature.speed * 0.28;
        creature.velocity.y = Math.sin(creature.wanderAngle) * creature.speed * 0.28;
      }
      this.moveWithCollision(creature.position, creature.velocity.x * delta, creature.velocity.y * delta, creature.radius);

      if (playerDistance < this.player.radius + creature.radius + 4 && creature.attackCooldown <= 0) {
        creature.attackCooldown = 0.75 + this.rng.next() * 0.25;
        this.hurtPlayer(creature.damage, normalize({ x: this.player.position.x - creature.position.x, y: this.player.position.y - creature.position.y }));
      }
    }
  }

  private updateProjectiles(delta: number): void {
    for (const projectile of this.projectiles) {
      projectile.life -= delta;
      projectile.position.x += projectile.velocity.x * delta;
      projectile.position.y += projectile.velocity.y * delta;
      if (!isWalkable(tileAt(this.world, projectile.position.x, projectile.position.y))) projectile.life = 0;

      for (const creature of this.creatures) {
        if (projectile.hitIds.has(creature.id)) continue;
        if (distance(projectile.position, creature.position) <= projectile.radius + creature.radius) {
          projectile.hitIds.add(creature.id);
          this.damageCreature(creature, projectile.damage, normalize(projectile.velocity), projectile.weapon, projectile.poiseDamage);
          if (projectile.pierce > 0) projectile.pierce -= 1;
          else projectile.life = 0;
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0);
  }

  private damageCreature(creature: Creature, baseDamage: number, direction: Vector, weapon: WeaponKind, poiseDamage: number): void {
    if (creature.health <= 0) return;
    const critical = this.rng.next() < 0.06 + this.stats.luck * 0.008;
    const brokenBonus = creature.brokenTimer > 0 ? 1.32 : 1;
    const damage = Math.round(baseDamage * (critical ? 1.75 : 1) * brokenBonus * (0.92 + this.rng.next() * 0.16));
    creature.health -= damage;
    creature.poise = Math.max(0, creature.poise - poiseDamage * (critical ? 1.4 : 1));
    creature.aggro = true;
    creature.hurtFlash = 1;
    creature.position.x += direction.x * (critical ? 12 : 7);
    creature.position.y += direction.y * (critical ? 12 : 7);
    this.addText(creature.position, critical ? `✦ ${damage}!` : `${damage}`, critical ? "#ffdf65" : "#fff1bc", 0.65, critical ? 1.3 : 0.9);
    this.burst(creature.position, critical ? "#ffda5a" : "#f4f0c6", critical ? 10 : 5, critical ? 110 : 70);
    this.shake = Math.max(this.shake, critical ? 7 : 3);
    this.sound.hit(critical);
    this.gainMastery(weapon, creature.health <= 0 ? 8 : 2);
    if (creature.poise <= 0 && creature.health > 0 && creature.brokenTimer <= 0) {
      creature.brokenTimer = 1.35;
      this.addText(creature.position, "◆ BREAK!", "#72e7ef", 0.85, 1.1);
      this.burst(creature.position, "#63dce8", 16, 125);
      this.shake = Math.max(this.shake, 8);
      this.sound.tone(140, 0.2, "square", 0.025, 240);
    }
    if (creature.health <= 0) this.defeatCreature(creature);
  }

  private gainMastery(kind: WeaponKind, amount: number): void {
    const weapon = this.weapons[kind];
    const previousLevel = weapon.masteryLevel;
    weapon.masteryXp += amount;
    weapon.masteryLevel = masteryLevelFromXp(weapon.masteryXp);
    if (weapon.masteryLevel <= previousLevel) return;
    weapon.damageBonus += (weapon.masteryLevel - previousLevel) * 2;
    this.addText(this.player.position, `${WEAPON_DATA[kind].label} MASTERY ${weapon.masteryLevel}`, "#75e5ef", 1.2, 0.9);
    this.burst(this.player.position, "#70e0eb", 20, 115);
    this.sound.reward();
  }

  private defeatCreature(creature: Creature): void {
    this.defeated += 1;
    const xp = creature.xp + (this.rng.chance(this.stats.luck * 0.006) ? Math.ceil(creature.xp * 0.5) : 0);
    this.stats.totalXp += xp;
    this.addText(creature.position, `+${xp} XP`, "#b9a6ff", 0.9, 0.9);
    this.burst(creature.position, creature.temperament === "passive" ? "#80d6a6" : "#ff826e", 14, 95);
    if (this.rng.chance(0.08 + this.stats.luck * 0.006)) {
      const heal = 5 + Math.ceil(this.stats.level / 2);
      this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + heal);
      this.addText(creature.position, `♥ +${heal}`, "#77e39e", 0.8, 0.9);
    }
    creature.health = -999;
    this.creatures = this.creatures.filter((candidate) => candidate.id !== creature.id);
    const progress = levelProgress(this.stats.totalXp);
    if (progress.level > this.stats.level) {
      this.stats.level = progress.level;
      this.mode = "levelup";
      this.flash = 1;
      this.sound.levelUp();
      this.hooks.onLevelUp(progress.level, rollUpgradeChoices(this.world.seed, progress.level));
    } else {
      this.sound.reward();
    }
  }

  private hurtPlayer(amount: number, direction: Vector): void {
    if (this.player.hurtCooldown > 0 || this.player.dodgeTimer > 0) return;
    const damage = Math.max(1, amount - this.stats.armor);
    this.stats.health = Math.max(0, this.stats.health - damage);
    this.player.hurtCooldown = 0.78;
    this.player.position.x += direction.x * 16;
    this.player.position.y += direction.y * 16;
    this.addText(this.player.position, `-${damage}`, "#ff6f7b", 0.65, 1.05);
    this.burst(this.player.position, "#ff6876", 8, 90);
    this.shake = 9;
    this.flash = 0.5;
    this.sound.hurt();
    if (this.stats.health <= 0) this.gameOver();
  }

  private gameOver(): void {
    this.mode = "dead";
    this.burst(this.player.position, "#ffe18a", 34, 180);
    this.sound.tone(220, 0.8, "triangle", 0.04, -140);
    this.reportStats(true);
    this.hooks.onGameOver({ ...this.getSnapshot(), sessionId: this.sessionId });
  }

  private addText(position: Vector, text: string, color: string, life: number, scale: number): void {
    this.texts.push({
      id: this.entityId++,
      position: { x: position.x, y: position.y - 15 },
      text,
      color,
      life,
      maxLife: life,
      scale,
    });
  }

  private burst(position: Vector, color: string, count: number, speed: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = this.rng.next() * Math.PI * 2;
      const velocity = speed * (0.35 + this.rng.next() * 0.65);
      const life = 0.25 + this.rng.next() * 0.45;
      this.particles.push({
        id: this.entityId++,
        position: { ...position },
        velocity: { x: Math.cos(angle) * velocity, y: Math.sin(angle) * velocity },
        color,
        size: 2 + this.rng.int(0, 3),
        life,
        maxLife: life,
      });
    }
  }

  private updateEffects(delta: number): void {
    for (const particle of this.particles) {
      particle.life -= delta;
      particle.position.x += particle.velocity.x * delta;
      particle.position.y += particle.velocity.y * delta;
      particle.velocity.x *= 0.94;
      particle.velocity.y *= 0.94;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    for (const text of this.texts) {
      text.life -= delta;
      text.position.y -= delta * 28;
    }
    this.texts = this.texts.filter((text) => text.life > 0);
  }

  private reportStats(force = false): void {
    if (!force && this.elapsedSeconds - this.lastReported < 0.1) return;
    this.lastReported = this.elapsedSeconds;
    this.hooks.onStats(this.getSnapshot());
  }

  private render(time: number): void {
    const ctx = this.context;
    const shakeX = this.shake > 0 ? (this.rng.next() - 0.5) * this.shake : 0;
    const shakeY = this.shake > 0 ? (this.rng.next() - 0.5) * this.shake : 0;
    const camera = {
      x: clamp(this.player.position.x - this.canvas.width / 2 + shakeX, 0, WORLD_SIZE - this.canvas.width),
      y: clamp(this.player.position.y - this.canvas.height / 2 + shakeY, 0, WORLD_SIZE - this.canvas.height),
    };
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.renderWorld(ctx, camera, time);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    this.renderShrine(ctx, time);
    for (const creature of this.creatures) this.renderCreature(ctx, creature, time);
    for (const projectile of this.projectiles) this.renderProjectile(ctx, projectile, time);
    if (this.mode !== "dead") this.renderPlayer(ctx, time);
    for (const particle of this.particles) this.renderParticle(ctx, particle);
    for (const text of this.texts) this.renderText(ctx, text);
    this.renderSignature(ctx);
    ctx.restore();

    if (this.mode === "paused") {
      ctx.fillStyle = "rgba(8, 15, 29, .58)";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff3c4";
      ctx.font = "900 36px Trebuchet MS, sans-serif";
      ctx.fillText("Chapter paused", this.canvas.width / 2, this.canvas.height / 2 - 8);
      ctx.fillStyle = "#9cabc4";
      ctx.font = "500 15px Cascadia Mono, monospace";
      ctx.fillText("Press P or Esc to wander on", this.canvas.width / 2, this.canvas.height / 2 + 25);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 245, 184, ${this.flash * 0.18})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private renderSignature(ctx: CanvasRenderingContext2D): void {
    if (this.signatureVisual <= 0) return;
    const progress = 1 - this.signatureVisual / 0.42;
    const alpha = Math.max(0, 1 - progress);
    const { x, y } = this.player.position;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 8 - progress * 4;
    if (this.signatureKind === "sword") {
      ctx.strokeStyle = "#ffe27a";
      ctx.beginPath();
      ctx.arc(0, 0, 42 + progress * 70, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.signatureKind === "spear") {
      ctx.rotate(Math.atan2(this.player.direction.y, this.player.direction.x));
      ctx.strokeStyle = "#8ff1bf";
      ctx.beginPath();
      ctx.moveTo(-110 + progress * 80, -12);
      ctx.lineTo(30 + progress * 90, 0);
      ctx.lineTo(-110 + progress * 80, 12);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#c7a1ff";
      for (let index = 0; index < 3; index += 1) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.strokeRect(20 + progress * 28, -5, 10, 10);
      }
    }
    ctx.restore();
  }

  private renderWorld(ctx: CanvasRenderingContext2D, camera: Vector, time: number): void {
    const startX = Math.floor(camera.x / TILE_SIZE);
    const startY = Math.floor(camera.y / TILE_SIZE);
    const endX = Math.min(WORLD_TILES - 1, Math.ceil((camera.x + this.canvas.width) / TILE_SIZE));
    const endY = Math.min(WORLD_TILES - 1, Math.ceil((camera.y + this.canvas.height) / TILE_SIZE));
    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const tile = this.world.tiles[y * WORLD_TILES + x];
        if (!tile) continue;
        const px = x * TILE_SIZE - camera.x;
        const py = y * TILE_SIZE - camera.y;
        const palette = COLORS[tile];
        ctx.fillStyle = palette[(x + y) % 2] ?? palette[0];
        ctx.fillRect(Math.floor(px), Math.floor(py), TILE_SIZE + 1, TILE_SIZE + 1);
        const detail = ((x * 17 + y * 31 + this.world.seed) >>> 0) % 11;
        if (tile === "water") {
          ctx.strokeStyle = "rgba(150,225,225,.27)";
          ctx.lineWidth = 2;
          const wave = Math.sin(time * 2 + x + y) * 2;
          ctx.beginPath();
          ctx.moveTo(px + 5, py + 15 + wave);
          ctx.lineTo(px + 15, py + 15 + wave);
          ctx.moveTo(px + 19, py + 25 - wave);
          ctx.lineTo(px + 28, py + 25 - wave);
          ctx.stroke();
        } else if (tile === "forest") {
          ctx.fillStyle = "#173c31";
          ctx.fillRect(px + 13, py + 20, 6, 12);
          ctx.fillStyle = detail > 4 ? "#347050" : "#2f6649";
          ctx.beginPath();
          ctx.arc(px + 16, py + 14, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(126,202,112,.28)";
          ctx.fillRect(px + 10, py + 7, 5, 4);
        } else if (tile === "flowers" && detail > 4) {
          ctx.fillStyle = detail > 7 ? "#ffce6c" : "#f58ca8";
          ctx.fillRect(px + 8, py + 11, 3, 3);
          ctx.fillRect(px + 23, py + 24, 3, 3);
        } else if (tile === "grass" && detail > 7) {
          ctx.strokeStyle = "rgba(25,80,55,.35)";
          ctx.beginPath();
          ctx.moveTo(px + 9, py + 26);
          ctx.lineTo(px + 7, py + 21);
          ctx.moveTo(px + 9, py + 26);
          ctx.lineTo(px + 12, py + 20);
          ctx.stroke();
        } else if (tile === "ruins") {
          ctx.strokeStyle = "rgba(48,52,54,.25)";
          ctx.strokeRect(px + 2, py + 2, 28, 28);
        }
      }
    }
  }

  private renderShrine(ctx: CanvasRenderingContext2D, time: number): void {
    const { x, y } = this.world.shrine;
    const pulse = 0.72 + Math.sin(time * 2) * 0.15;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(255,215,112,.15)";
    ctx.beginPath();
    ctx.arc(0, 0, 42 + pulse * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a6272";
    ctx.fillRect(-24, 12, 48, 14);
    ctx.fillStyle = "#838a92";
    ctx.fillRect(-18, -10, 36, 24);
    ctx.fillStyle = "#ffe07a";
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(12, -12);
    ctx.lineTo(0, 2);
    ctx.lineTo(-12, -12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private renderPlayer(ctx: CanvasRenderingContext2D, time: number): void {
    const { x, y } = this.player.position;
    const bob = Math.sin(this.player.walkCycle) * 1.5;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + bob));
    if (this.player.hurtCooldown > 0 && Math.floor(time * 18) % 2 === 0) ctx.globalAlpha = 0.38;
    ctx.fillStyle = "rgba(8,20,25,.25)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#322f56";
    ctx.fillRect(-9, 0, 18, 14);
    ctx.fillStyle = "#e9a97c";
    ctx.fillRect(-7, -12, 14, 13);
    ctx.fillStyle = "#613f68";
    ctx.fillRect(-9, -15, 18, 7);
    ctx.fillRect(-10, -9, 4, 8);
    ctx.fillStyle = "#f4d86c";
    ctx.fillRect(-3, 2, 6, 9);
    ctx.fillStyle = "#1b263b";
    const eyeX = this.player.direction.x > 0.2 ? 4 : this.player.direction.x < -0.2 ? -4 : 0;
    ctx.fillRect(eyeX - 1, -7, 2, 2);
    ctx.restore();
    this.renderAttack(ctx);
  }

  private renderAttack(ctx: CanvasRenderingContext2D): void {
    if (this.player.attackVisual <= 0) return;
    const progress = 1 - this.player.attackVisual / 0.2;
    const angle = Math.atan2(this.player.direction.y, this.player.direction.x);
    const { x, y } = this.player.position;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (this.player.attackKind === "sword") {
      ctx.strokeStyle = "#ffe187";
      ctx.lineWidth = 7;
      ctx.globalAlpha = 1 - progress * 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, 42, -0.9 + progress * 0.5, 0.9 + progress * 0.5);
      ctx.stroke();
    } else if (this.player.attackKind === "spear") {
      ctx.strokeStyle = "#a9e8b9";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(75 - Math.abs(progress - 0.5) * 40, 0);
      ctx.stroke();
      ctx.fillStyle = "#efffc4";
      ctx.beginPath();
      ctx.moveTo(82 - Math.abs(progress - 0.5) * 40, 0);
      ctx.lineTo(68 - Math.abs(progress - 0.5) * 40, -7);
      ctx.lineTo(68 - Math.abs(progress - 0.5) * 40, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderCreature(ctx: CanvasRenderingContext2D, creature: Creature, time: number): void {
    const { x, y } = creature.position;
    const bob = Math.sin(time * 4 + creature.id) * 1.5;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + bob));
    ctx.fillStyle = "rgba(6,18,22,.25)";
    ctx.beginPath();
    ctx.ellipse(0, creature.radius * 0.75, creature.radius, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    const flash = creature.hurtFlash > 0;
    if (creature.kind === "mossling") {
      ctx.fillStyle = flash ? "#fff8d0" : "#79c66c";
      ctx.beginPath();
      ctx.arc(0, 0, 11, Math.PI, 0);
      ctx.lineTo(11, 8);
      ctx.lineTo(-11, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#173730";
      ctx.fillRect(-5, 0, 2, 2);
      ctx.fillRect(4, 0, 2, 2);
    } else if (creature.kind === "hornhare") {
      ctx.fillStyle = flash ? "#fff8d0" : "#d7c58f";
      ctx.fillRect(-8, -6, 16, 16);
      ctx.fillRect(-7, -18, 5, 13);
      ctx.fillRect(2, -18, 5, 13);
      ctx.fillStyle = "#453b45";
      ctx.fillRect(-4, -1, 2, 2);
      ctx.fillRect(3, -1, 2, 2);
    } else if (creature.kind === "emberfox") {
      ctx.fillStyle = flash ? "#fff8d0" : "#e96f58";
      ctx.beginPath();
      ctx.moveTo(-12, 7);
      ctx.lineTo(-8, -10);
      ctx.lineTo(-2, -5);
      ctx.lineTo(7, -11);
      ctx.lineTo(12, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff0bb";
      ctx.fillRect(-4, 2, 8, 6);
    } else if (creature.kind === "boneguard") {
      ctx.fillStyle = flash ? "#fff8d0" : "#d7d1b2";
      ctx.fillRect(-11, -12, 22, 20);
      ctx.fillStyle = "#4b5162";
      ctx.fillRect(-7, -5, 4, 5);
      ctx.fillRect(3, -5, 4, 5);
      ctx.fillRect(-8, 10, 6, 7);
      ctx.fillRect(2, 10, 6, 7);
    } else {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = flash ? "#fff8d0" : "#8f82eb";
      ctx.beginPath();
      ctx.arc(0, -2, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, 3);
      ctx.lineTo(-4, 15);
      ctx.lineTo(0, 7);
      ctx.lineTo(5, 15);
      ctx.lineTo(8, 3);
      ctx.fill();
    }
    if (creature.aggro) {
      ctx.fillStyle = "#ff5f68";
      ctx.fillRect(-2, -creature.radius - 10, 4, 4);
    }
    if (creature.health < creature.maxHealth) {
      ctx.fillStyle = "#121928";
      ctx.fillRect(-13, creature.radius + 6, 26, 3);
      ctx.fillStyle = "#ff6876";
      ctx.fillRect(-13, creature.radius + 6, 26 * clamp(creature.health / creature.maxHealth, 0, 1), 3);
    }
    if (creature.poise < creature.maxPoise || creature.brokenTimer > 0) {
      ctx.fillStyle = "#10202b";
      ctx.fillRect(-13, creature.radius + 11, 26, 2);
      ctx.fillStyle = creature.brokenTimer > 0 ? "#fff0a6" : "#62dce8";
      ctx.fillRect(-13, creature.radius + 11, 26 * clamp(creature.poise / creature.maxPoise, 0, 1), 2);
    }
    ctx.restore();
  }

  private renderProjectile(ctx: CanvasRenderingContext2D, projectile: Projectile, time: number): void {
    ctx.save();
    ctx.translate(projectile.position.x, projectile.position.y);
    ctx.rotate(time * 8);
    ctx.fillStyle = "rgba(188,161,255,.25)";
    ctx.beginPath();
    ctx.arc(0, 0, projectile.radius * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = projectile.color;
    ctx.fillRect(-projectile.radius, -projectile.radius, projectile.radius * 2, projectile.radius * 2);
    ctx.fillStyle = "#fff7d0";
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }

  private renderParticle(ctx: CanvasRenderingContext2D, particle: Particle): void {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(Math.round(particle.position.x), Math.round(particle.position.y), particle.size, particle.size);
    ctx.globalAlpha = 1;
  }

  private renderText(ctx: CanvasRenderingContext2D, text: FloatingText): void {
    ctx.save();
    ctx.globalAlpha = clamp(text.life / text.maxLife, 0, 1);
    ctx.textAlign = "center";
    ctx.font = `900 ${Math.round(14 * text.scale)}px Trebuchet MS, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(17,24,43,.75)";
    ctx.strokeText(text.text, text.position.x, text.position.y);
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, text.position.x, text.position.y);
    ctx.restore();
  }
}
