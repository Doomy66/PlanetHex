import { describe, expect, it } from "vitest";
import { borderEdges, hexesWithin, onTheMap, outlineOf } from "./border";
import { neighboursOf } from "../location";

/** The six hexes round one, as the keys hexesWithin uses. */
function around(col: number, row: number): string[] {
  return neighboursOf({ col, row }).map((hex) => `${hex.col},${hex.row}`);
}

describe("the hexes a border encloses", () => {
  it("keeps the ring itself", () => {
    const ring = around(5, 5);
    const within = hexesWithin([...ringHexes(5, 5)]);
    for (const key of ring) expect(within.has(key), key).toBe(true);
  });

  it("fills the hex in the middle, which no world need mark", () => {
    // The whole reason this is not just "the hexes with worlds on them": a
    // polity holds the empty space inside its frontier.
    const within = hexesWithin([...ringHexes(5, 5)]);
    expect(within.has("5,5")).toBe(true);
  });

  it("leaves everything outside out", () => {
    const within = hexesWithin([...ringHexes(5, 5)]);
    expect(within.has("5,2")).toBe(false);
    expect(within.has("9,9")).toBe(false);
    // Seven hexes: the middle and its six neighbours, and nothing else.
    expect(within.size).toBe(7);
  });

  it("copes with a ring that walks outside the sector", () => {
    // Published borders do this: a polity runs off the edge, and the path
    // says so with hexes like 0000 that no world could have.
    const within = hexesWithin(["0101", "0100", "0200", "0201", "0202", "0102", "0101"]);
    expect(within.size).toBeGreaterThan(0);
    expect(within.has("1,1")).toBe(true);
  });

  it("gives nothing back for a path of no hexes", () => {
    expect(hexesWithin([]).size).toBe(0);
    expect(hexesWithin(["nonsense", "3"]).size).toBe(0);
  });
});

describe("the outline of a region", () => {
  it("draws six edges round a single hex", () => {
    const edges = outlineOf(new Set(["5,5"]));
    expect(edges).toHaveLength(6);
    expect(edges.map((edge) => edge.side).sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("draws nothing between two hexes that are both inside", () => {
    // Two neighbours share an edge, so the outline is ten rather than twelve.
    const pair = new Set(["5,5", around(5, 5)[1]!]);
    expect(outlineOf(pair)).toHaveLength(10);
  });

  it("draws the outside of a filled ring, not the ring's own inner edge", () => {
    // Eighteen: the six ring hexes each keep three faces, having given one to
    // the middle and one to each of their two neighbours on the ring. The
    // middle hex contributes nothing, which is the point - it is enclosed.
    const edges = borderEdges([...ringHexes(5, 5)]);
    expect(edges).toHaveLength(18);
    expect(edges.some((edge) => edge.hex.col === 5 && edge.hex.row === 5)).toBe(false);
  });

  it("comes out the same every time", () => {
    const once = JSON.stringify(borderEdges([...ringHexes(7, 9)]));
    const twice = JSON.stringify(borderEdges([...ringHexes(7, 9)]));
    expect(twice).toBe(once);
  });
});

describe("what the sector itself draws", () => {
  it("knows a hex of its own from a neighbour's", () => {
    expect(onTheMap({ col: 1, row: 1 })).toBe(true);
    expect(onTheMap({ col: 32, row: 40 })).toBe(true);
    expect(onTheMap({ col: 0, row: 0 })).toBe(false);
    expect(onTheMap({ col: 33, row: 5 })).toBe(false);
    expect(onTheMap({ col: 5, row: 41 })).toBe(false);
  });
});

/** The six hexes round one, written the way a published path writes them. */
function ringHexes(col: number, row: number): string[] {
  const ring = neighboursOf({ col, row }).map(
    (hex) => `${String(hex.col).padStart(2, "0")}${String(hex.row).padStart(2, "0")}`,
  );
  // Closed, as published paths are: the first hex again at the end.
  return [...ring, ring[0]!];
}
