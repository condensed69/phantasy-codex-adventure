import { SeededRandom } from "./rng";
import type { TileKind, Vector } from "./types";

export const TILE_SIZE = 32;
export const WORLD_TILES = 72;
export const WORLD_SIZE = TILE_SIZE * WORLD_TILES;

export interface GeneratedWorld {
  seed: number;
  tiles: TileKind[];
  shrine: Vector;
  title: string;
}

const ADJECTIVES = ["Verdant", "Moonlit", "Amber", "Whispering", "Starfall", "Ancient"] as const;
const NOUNS = ["March", "Wilds", "Hollow", "Reach", "Glen", "Isles"] as const;

function hashNoise(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374_761_393) + Math.imul(y, 668_265_263) + Math.imul(seed, 69069);
  n = Math.imul(n ^ (n >>> 13), 1_274_126_177);
  return ((n ^ (n >>> 16)) >>> 0) / 4_294_967_296;
}

function smoothNoise(x: number, y: number, seed: number, scale: number): number {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = sx - x0;
  const ty = sy - y0;
  const fade = (value: number) => value * value * (3 - 2 * value);
  const a = hashNoise(x0, y0, seed);
  const b = hashNoise(x0 + 1, y0, seed);
  const c = hashNoise(x0, y0 + 1, seed);
  const d = hashNoise(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * fade(tx);
  const bottom = c + (d - c) * fade(tx);
  return top + (bottom - top) * fade(ty);
}

export function tileAt(world: GeneratedWorld, x: number, y: number): TileKind {
  const tx = Math.max(0, Math.min(WORLD_TILES - 1, Math.floor(x / TILE_SIZE)));
  const ty = Math.max(0, Math.min(WORLD_TILES - 1, Math.floor(y / TILE_SIZE)));
  return world.tiles[ty * WORLD_TILES + tx] as TileKind;
}

export function isWalkable(tile: TileKind): boolean {
  return tile !== "water" && tile !== "forest";
}

export function generateWorld(seed: number): GeneratedWorld {
  const rng = new SeededRandom(seed);
  const tiles: TileKind[] = [];
  const center = WORLD_TILES / 2;

  for (let y = 0; y < WORLD_TILES; y += 1) {
    for (let x = 0; x < WORLD_TILES; x += 1) {
      const edge = Math.min(x, y, WORLD_TILES - 1 - x, WORLD_TILES - 1 - y);
      const elevation = smoothNoise(x, y, seed, 10) * 0.65 + smoothNoise(x, y, seed + 91, 4) * 0.35;
      const moisture = smoothNoise(x, y, seed + 271, 8);
      const centerDistance = Math.hypot(x - center, y - center);

      let kind: TileKind = "grass";
      if (edge < 2 || elevation < 0.22) kind = "water";
      else if (elevation < 0.28) kind = "sand";
      else if (elevation > 0.73 && moisture < 0.58) kind = "stone";
      else if (moisture > 0.69) kind = "forest";
      else if (moisture > 0.54 && hashNoise(x, y, seed + 45) > 0.68) kind = "flowers";

      if (centerDistance < 4.2) kind = centerDistance < 2.5 ? "ruins" : "grass";
      tiles.push(kind);
    }
  }

  return {
    seed,
    tiles,
    shrine: { x: center * TILE_SIZE, y: center * TILE_SIZE },
    title: `${rng.pick(ADJECTIVES)} ${rng.pick(NOUNS)}`,
  };
}
