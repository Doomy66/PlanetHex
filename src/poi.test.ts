import { describe, expect, it } from "vitest";
import {
  parsePois,
  poiAt,
  poiPlacements,
  poiPosition,
  putPoi,
  removePoi,
  rerollStarport,
  starports,
  type Poi,
} from "./poi";
import { parsePlanet } from "./planet";
import { buildGrid, nearestCell } from "./grid/grid";
import {
  buildRefIndex,
  existsAtSize,
  formatLattice,
  latticeRef,
  parseLattice,
  REFERENCE_SIZE,
  type LatticeRef,
} from "./grid/coord";
import { hexRound } from "./ui/local";

/** A point of the reference lattice, which is what a display hex is. */
const ref = (face: number, i: number, j: number, size = REFERENCE_SIZE): LatticeRef =>
  latticeRef(face, i, j, size);

const starport = (at: LatticeRef, name = "Highport"): Poi => ({
  kind: "starport",
  name,
  narrative: "Two berths and a bar.",
  ref: at,
});

describe("points of interest", () => {
  it("finds one by coordinate rather than by identity", () => {
    const pois = [starport(ref(3, 8, 4))];
    expect(poiAt(pois, ref(3, 8, 4))?.name).toBe("Highport");
    expect(poiAt(pois, ref(3, 8, 5))).toBeNull();
    expect(poiAt(pois, null)).toBeNull();
  });

  // One POI to a point. Two on one point could not both be drawn on it, and the
  // dialogue of 4.5.7 has one point to open on.
  it("keeps one to a point, replacing what was there", () => {
    const first = [starport(ref(1, 2, 1))];
    const second = putPoi(first, { ...starport(ref(1, 2, 1), "Downport"), kind: "comment" });
    expect(second).toHaveLength(1);
    expect(second[0]!.name).toBe("Downport");
    expect(second[0]!.kind).toBe("comment");
    // The old list is the list it was, so nothing holding it sees the edit.
    expect(first[0]!.name).toBe("Highport");
  });

  it("drops one by coordinate and leaves the others", () => {
    const pois = [starport(ref(1, 2, 1)), starport(ref(4, 9, 3), "Beacon")];
    const left = removePoi(pois, ref(1, 2, 1));
    expect(left.map((p) => p.name)).toEqual(["Beacon"]);
    expect(removePoi(left, ref(1, 2, 1))).toHaveLength(1);
  });
});

describe("naming a point at any depth", () => {
  // Spec 2.4.3: a lattice point is placed by the ratios, so the same point
  // counted on two lattices is one point and must come back as one name.
  it("reduces a coordinate to the coarsest lattice the point sits on", () => {
    expect(latticeRef(4, 16, 8, 128)).toEqual(latticeRef(4, 2, 1, 16));
    expect(latticeRef(4, 16, 8, 128).size).toBe(16);
    // And a POI keyed at one depth is the same POI keyed at another.
    const pois = [starport(latticeRef(4, 2, 1, 16))];
    expect(poiAt(pois, latticeRef(4, 16, 8, 128))?.name).toBe("Highport");
  });

  it("agrees with the name the grid gives a display hex", () => {
    const grid = buildGrid(6);
    const refs = buildRefIndex(grid);
    for (const cell of grid.cells) {
      const at = refs.of[cell.id]!;
      expect(nearestCell(grid, poiPosition(ref(at.face, at.i, at.j)))).toBe(cell.id);
    }
  });

  it("writes a reference point as a hex name and a finer one with its depth", () => {
    expect(formatLattice(ref(2, 12, 6))).toBe("F02R12C06");
    const fine = latticeRef(2, 41, 20, 128);
    expect(formatLattice(fine)).toBe("F02R41C20/128");
    expect(parseLattice("F02R41C20/128")).toEqual(fine);
    expect(parseLattice("F02R12C06")).toEqual(ref(2, 12, 6));
    expect(parseLattice("F02R41C20/nonsense")).toBeNull();
  });
});

describe("reading POIs back off a save", () => {
  it("takes the coordinate as numbers or as its written form", () => {
    const pois = parsePois([
      { kind: "starport", name: "A", narrative: "", ref: { face: 2, i: 12, j: 6 } },
      { kind: "comment", name: "B", narrative: "note", ref: "F02R12C07" },
      { kind: "comment", name: "C", narrative: "", ref: { face: 2, i: 41, j: 20, size: 128 } },
    ]);
    expect(pois).toHaveLength(3);
    expect(pois[0]!.ref).toEqual(ref(2, 12, 6));
    expect(pois[1]!.ref).toEqual(ref(2, 12, 7));
    expect(pois[2]!.ref).toEqual(latticeRef(2, 41, 20, 128));
  });

  // Spec 6.5.5: every POI in a save written before the fine lattice sat on a
  // display hex, so a coordinate with no depth means the reference lattice.
  it("reads a coordinate with no depth as a reference point", () => {
    const pois = parsePois([{ kind: "comment", ref: { face: 0, i: 24, j: 12 } }]);
    expect(pois[0]!.ref).toEqual(ref(0, 24, 12));
  });

  it("fills in the text a save left out", () => {
    const pois = parsePois([{ kind: "comment", ref: { face: 0, i: 1, j: 0 } }]);
    expect(pois[0]).toEqual({ kind: "comment", name: "", narrative: "", ref: ref(0, 1, 0) });
  });

  // Unlike the seed of 6.4.3, a POI is not something the planet cannot be rebuilt
  // without, so a bad one is dropped rather than refusing the whole world.
  it("drops what it cannot read rather than refusing the file", () => {
    const pois = parsePois([
      { kind: "spaceport", ref: { face: 0, i: 1, j: 0 } },
      { kind: "comment", ref: { face: 99, i: 1, j: 0 } },
      { kind: "comment", ref: { face: 0, i: 1, j: 4 } },
      { kind: "comment", ref: { face: 0, i: 200, j: 1 } },
      { kind: "comment", ref: "not a hex" },
      { kind: "comment" },
      "a string",
      null,
      { kind: "comment", name: "kept", ref: { face: 0, i: 1, j: 0 } },
    ]);
    expect(pois.map((p) => p.name)).toEqual(["kept"]);
  });

  it("gives a planet with none to a save written before they existed", () => {
    const planet = parsePlanet(JSON.stringify({ version: 1, seed: "ABC", size: 24 }));
    expect(planet.pois).toEqual([]);
  });

  it("carries them through a save and a load", () => {
    const planet = parsePlanet(
      JSON.stringify({
        version: 1,
        seed: "ABC",
        size: 24,
        pois: [starport(latticeRef(5, 41, 20, 128))],
      }),
    );
    expect(poiAt(planet.pois, latticeRef(5, 41, 20, 128))?.narrative).toBe("Two berths and a bar.");
  });
});

describe("a POI against the detail levels", () => {
  it("stays on its own hex at every level that draws it", () => {
    const coarse = buildGrid(6);
    const fine = buildGrid(24);
    const at = buildRefIndex(coarse).of[20]!;
    const poi = starport(ref(at.face, at.i, at.j));
    for (const grid of [coarse, fine]) {
      const placed = poiPlacements(grid, [poi]);
      expect(grid.cells[placed[0]!.cell]!.centre).toEqual(coarse.cells[20]!.centre);
    }
  });

  // Spec 6.6.1: a level with no hex at that point draws it on the hex covering
  // it rather than not at all, which is what keeps the slider from losing one.
  it("falls back to the hex covering it where the level has no hex of its own", () => {
    const coarse = buildGrid(6);
    const refs = buildRefIndex(buildGrid(24));
    const onlyFine = refs.of.find((r) => !existsAtSize(r, 6))!;
    const placed = poiPlacements(coarse, [starport(ref(onlyFine.face, onlyFine.i, onlyFine.j))]);
    expect(placed).toHaveLength(1);
    const covering = coarse.cells[placed[0]!.cell]!;
    const p = poiPosition(placed[0]!.poi.ref);
    const dot = (c: readonly number[]) => c[0]! * p[0] + c[1]! * p[1] + c[2]! * p[2];
    for (const cell of coarse.cells) {
      expect(dot(cell.centre)).toBeLessThanOrEqual(dot(covering.centre));
    }
  });

  // Spec 6.6: a POI on a hex of the local panel is far finer than any level the
  // map draws, and every level still has to place it somewhere.
  it("places a point of the fine lattice at every level", () => {
    const pois = [starport(latticeRef(0, 105, 52, 256)), starport(latticeRef(7, 201, 99, 512), "B")];
    for (const size of [6, 12, 24, 48]) {
      expect(poiPlacements(buildGrid(size), pois)).toHaveLength(2);
    }
  });

  // Spec 6.6.3: two POIs on neighbouring fine hexes share one display hex, and
  // both have to survive being placed on it.
  it("lets two fine points share one display hex", () => {
    const grid = buildGrid(6);
    const pois = [
      starport(latticeRef(0, 105, 52, 256)),
      starport(latticeRef(0, 106, 52, 256), "Next door"),
    ];
    const placed = poiPlacements(grid, pois);
    expect(placed).toHaveLength(2);
    expect(placed[0]!.cell).toBe(placed[1]!.cell);
  });
});

describe("the hex a click in the patch lands on", () => {
  // Spec 4.5.7.1: rounding the two step counts on their own gives the rhombus
  // around a lattice point rather than the hexagon that point owns.
  it("rounds to the hex that owns the point, not to the nearest rhombus", () => {
    expect(hexRound(0, 0)).toEqual([0, 0]);
    expect(hexRound(0.2, 0.1)).toEqual([0, 0]);
    // The far corner of the rhombus belongs to a neighbour: rounding the two
    // counts alone answers (1, 1), which is two steps off rather than one.
    expect(hexRound(0.6, 0.6)).toEqual([1, 0]);
    // Anything close to a centre stays on that centre, wherever it is.
    for (let dp = -3; dp <= 3; dp++) {
      for (let dq = -3; dq <= 3; dq++) {
        expect(hexRound(dp + 0.15, dq - 0.1)).toEqual([dp, dq]);
      }
    }
  });
});

describe("the starport a reroll speaks for", () => {
  const comment = (at: LatticeRef, name = "Wreck"): Poi => ({
    kind: "comment",
    name,
    narrative: "Still there.",
    ref: at,
  });

  const here = ref(2, 10, 5);
  const there = ref(7, 20, 11);

  it("renames it to the new class and puts it on the new site", () => {
    const { pois, outcome } = rerollStarport([starport(here, "Starport A")], "C", there);
    expect(outcome).toBe("moved");
    expect(pois).toHaveLength(1);
    expect(pois[0]!.name).toBe("Starport C");
    expect(pois[0]!.ref).toEqual(there);
  });

  it("keeps the narrative, which is the user's and not the profile's", () => {
    const written: Poi = { ...starport(here, "Port Ozymandias"), narrative: "Burnt out in 1104." };
    const { pois } = rerollStarport([written], "B", there);
    expect(pois[0]!.narrative).toBe("Burnt out in 1104.");
    expect(pois[0]!.kind).toBe("starport");
  });

  it("leaves the comments on the world alone", () => {
    const note = comment(ref(4, 6, 2));
    const { pois } = rerollStarport([note, starport(here)], "D", there);
    expect(pois).toContainEqual(note);
    expect(starports(pois)).toHaveLength(1);
  });

  it("takes the starport away where the new profile is X", () => {
    const { pois, outcome } = rerollStarport([starport(here), comment(there)], "X", there);
    expect(outcome).toBe("removed");
    expect(starports(pois)).toHaveLength(0);
    // The note about the world is not the profile's business either way.
    expect(pois).toHaveLength(1);
  });

  it("moves nothing on a world carrying several", () => {
    const ports = [starport(here, "Starport A"), starport(ref(9, 4, 1), "The old field")];
    const { pois, outcome } = rerollStarport(ports, "E", there);
    expect(outcome).toBe("several");
    expect(pois).toEqual(ports);
  });

  it("does not place one on a world the user has emptied", () => {
    const { pois, outcome } = rerollStarport([comment(here)], "A", there);
    expect(outcome).toBe("none");
    expect(starports(pois)).toHaveLength(0);
  });

  it("leaves it where it is when the profile cannot be read", () => {
    const { pois, outcome } = rerollStarport([starport(here, "Starport A")], null, there);
    expect(outcome).toBe("none");
    expect(pois[0]!.ref).toEqual(here);
    expect(pois[0]!.name).toBe("Starport A");
  });

  it("leaves it where it is when the terrain offers nowhere to go", () => {
    const { pois, outcome } = rerollStarport([starport(here, "Starport A")], "C", null);
    expect(outcome).toBe("none");
    expect(pois[0]!.ref).toEqual(here);
  });

  it("hands back a list of its own rather than the one it was given", () => {
    const before = [starport(here)];
    const { pois } = rerollStarport(before, null, there);
    expect(pois).not.toBe(before);
    expect(pois).toEqual(before);
  });
});
