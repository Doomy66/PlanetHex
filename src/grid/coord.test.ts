import { describe, expect, it } from "vitest";
import {
  buildRefIndex,
  coarsestLevel,
  DETAIL_LEVELS,
  existsAtSize,
  formatRef,
  latticePosition,
  parseRef,
  reduceCoord,
  refAtSize,
  refCoord,
  refKey,
  REFERENCE_SIZE,
} from "./coord";
import { buildGrid } from "./grid";
import { positionKey } from "./vec3";

describe("the detail ladder", () => {
  it("has every level dividing the reference lattice", () => {
    for (const level of DETAIL_LEVELS) expect(REFERENCE_SIZE % level).toBe(0);
  });

  it("has the reference size as its finest level", () => {
    expect(Math.max(...DETAIL_LEVELS)).toBe(REFERENCE_SIZE);
  });
});

describe("refCoord", () => {
  it("gives one cell one name whichever level it is met at", () => {
    // The same place, reached from every level that draws it.
    for (const level of DETAIL_LEVELS) {
      const k = REFERENCE_SIZE / level;
      for (let i = 0; i <= level; i += 3) {
        for (let j = 0; j <= i; j += 5) {
          const here = refCoord(0, i, j, level);
          const there = refCoord(0, i * k, j * k, REFERENCE_SIZE);
          expect(refKey(here)).toBe(refKey(there));
        }
      }
    }
  });

  it("gives a seam cell the same name from either face", () => {
    const grid = buildGrid(12);
    const namesByPosition = new Map<string, Set<string>>();
    for (const face of grid.net) {
      for (const p of face.placements) {
        const key = positionKey(latticePosition(p.face, grid.size, p.i, p.j));
        const name = refKey(refCoord(p.face, p.i, p.j, grid.size));
        const seen = namesByPosition.get(key) ?? new Set<string>();
        seen.add(name);
        namesByPosition.set(key, seen);
      }
    }
    // Every position, seams and the twelve corners included, resolved to one name.
    for (const [, names] of namesByPosition) expect(names.size).toBe(1);
  });

  it("puts a name back on the point it came from", () => {
    for (let f = 0; f < 20; f++) {
      for (const [i, j] of [[7, 3], [24, 0], [48, 48], [0, 0], [48, 17]] as const) {
        const ref = refCoord(f, i, j, REFERENCE_SIZE);
        const back = latticePosition(ref.face, REFERENCE_SIZE, ref.i, ref.j);
        expect(positionKey(back)).toBe(positionKey(latticePosition(f, REFERENCE_SIZE, i, j)));
      }
    }
  });

  it("names the twelve corners on the coarsest level there is", () => {
    const corners = new Set<string>();
    for (const level of DETAIL_LEVELS) {
      for (let f = 0; f < 20; f++) {
        for (const [i, j] of [[0, 0], [level, 0], [level, level]] as const) {
          corners.add(refKey(refCoord(f, i, j, level)));
        }
      }
    }
    expect(corners.size).toBe(12);
    for (const key of corners) {
      const [face, i, j] = key.split("/").map(Number) as [number, number, number];
      expect(coarsestLevel({ face, i, j })).toBe(DETAIL_LEVELS[0]);
    }
  });
});

describe("refAtSize", () => {
  it("is null where the level does not draw the cell", () => {
    const odd = refCoord(0, 1, 0, REFERENCE_SIZE);
    expect(refAtSize(odd, REFERENCE_SIZE)).not.toBeNull();
    for (const level of DETAIL_LEVELS.filter((l) => l !== REFERENCE_SIZE)) {
      expect(refAtSize(odd, level)).toBeNull();
    }
  });

  it("round trips a coordinate through every level that has it", () => {
    for (const level of DETAIL_LEVELS) {
      const grid = buildGrid(level);
      const index = buildRefIndex(grid);
      for (let id = 0; id < grid.cells.length; id += 37) {
        const ref = index.of[id]!;
        expect(existsAtSize(ref, level)).toBe(true);
        expect(index.at(ref)).toBe(id);
      }
    }
  });
});

describe("buildRefIndex", () => {
  it("finds the same hex on a coarse grid and a fine one", () => {
    const coarse = buildGrid(6);
    const fine = buildGrid(48);
    const ci = buildRefIndex(coarse);
    const fi = buildRefIndex(fine);
    for (let id = 0; id < coarse.cells.length; id++) {
      const twin = fi.at(ci.of[id]!);
      expect(twin).not.toBeNull();
      // Same name, same place on the sphere.
      expect(positionKey(fine.cells[twin!]!.centre)).toBe(positionKey(coarse.cells[id]!.centre));
    }
  });

  it("gives every cell of a grid a distinct name", () => {
    const grid = buildGrid(12);
    const index = buildRefIndex(grid);
    expect(new Set(index.of.map(refKey)).size).toBe(grid.cells.length);
  });
});

describe("the written form", () => {
  it("round trips", () => {
    const ref = { face: 7, i: 33, j: 8 };
    expect(formatRef(ref)).toBe("F07R33C08");
    expect(parseRef("F07R33C08")).toEqual(ref);
    expect(parseRef(" f07-r33-c08 ")).toEqual(ref);
  });

  it("refuses what is not a coordinate", () => {
    expect(parseRef("")).toBeNull();
    expect(parseRef("F20R00C00")).toBeNull();
    expect(parseRef("F00R49C00")).toBeNull();
    expect(parseRef("F00R03C07")).toBeNull(); // column past the row
  });
});

describe("reduceCoord", () => {
  it("takes a coordinate to lowest terms", () => {
    expect(reduceCoord(8, 4, 48)).toEqual([2, 1, 12]);
    expect(reduceCoord(0, 0, 48)).toEqual([0, 0, 1]);
    expect(reduceCoord(7, 3, 48)).toEqual([7, 3, 48]);
  });

  it("takes the same point at two levels to one triple", () => {
    for (const level of DETAIL_LEVELS) {
      const k = REFERENCE_SIZE / level;
      for (let i = 0; i <= level; i++) {
        for (let j = 0; j <= i; j++) {
          expect(reduceCoord(i, j, level)).toEqual(reduceCoord(i * k, j * k, REFERENCE_SIZE));
        }
      }
    }
  });
});
