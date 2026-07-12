import { describe, expect, it } from "vitest";
import { generateWorld, isWalkable, tileAt, WORLD_SIZE } from "../src/game/world";

describe("procedural world", () => {
  it("is deterministic for a seed", () => {
    expect(generateWorld(12345)).toEqual(generateWorld(12345));
    expect(generateWorld(12345).tiles).not.toEqual(generateWorld(54321).tiles);
  });

  it("keeps the central shrine walkable and the perimeter watery", () => {
    const world = generateWorld(90210);
    expect(isWalkable(tileAt(world, world.shrine.x, world.shrine.y))).toBe(true);
    expect(tileAt(world, 0, 0)).toBe("water");
    expect(tileAt(world, WORLD_SIZE - 1, WORLD_SIZE - 1)).toBe("water");
  });
});
