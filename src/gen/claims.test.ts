import { describe, expect, it } from "vitest";
import { bordersToDraw, claimsFor, derivedBorders, type ClaimableHex } from "./claims";
import { borderEdges } from "./border";
import { neighboursOf } from "../location";
import type { AllegianceName, BorderPath } from "../charted-map";

const world = (at: string, allegiance: string): ClaimableHex => ({ at, allegiance });
const NAMED: AllegianceName[] = [
  { code: "ZhIN", name: "Zhodani Consulate", short: "Consulate" },
  { code: "Hn", name: "The Hanse", short: "" },
];
const no = new Map<string, string>();

describe("who claims which hex", () => {
  it("follows the world's allegiance where nothing says otherwise", () => {
    const held = claimsFor([world("0101", "ZhIN"), world("0102", "ZhIN")], no);
    expect(held.get("ZhIN")).toEqual(["0101", "0102"]);
  });

  it("claims nothing for the non-aligned", () => {
    // "Nobody holds this" is not a polity to draw a line round.
    expect(claimsFor([world("0101", "Na")], no).size).toBe(0);
    expect(claimsFor([world("0101", "")], no).size).toBe(0);
  });

  it("lets the referee claim a hex with nothing in it", () => {
    // The whole reason claims exist: the empty space between a polity's
    // worlds, which no world can mark.
    const held = claimsFor([world("0101", "ZhIN")], new Map([["0201", "ZhIN"]]));
    expect(held.get("ZhIN")).toEqual(["0101", "0201"]);
  });

  it("lets the referee unclaim a world's own hex", () => {
    // An Imperial world outside the Imperial border is a thing published maps
    // do, so it has to be a thing this can say.
    const held = claimsFor([world("0101", "ZhIN")], new Map([["0101", ""]]));
    expect(held.size).toBe(0);
  });

  it("lets the referee give a world's hex to somebody else", () => {
    const held = claimsFor([world("0101", "ZhIN")], new Map([["0101", "Hn"]]));
    expect(held.get("ZhIN")).toBeUndefined();
    expect(held.get("Hn")).toEqual(["0101"]);
  });

  it("gives the same answer every time", () => {
    const worlds = [world("0303", "ZhIN"), world("0101", "ZhIN"), world("0202", "ZhIN")];
    expect(claimsFor(worlds, no).get("ZhIN")).toEqual(["0101", "0202", "0303"]);
  });
});

describe("the borders that follow from it", () => {
  it("draws one for a polity the table names", () => {
    const made = derivedBorders([world("0101", "ZhIN")], no, [], NAMED);
    expect(made).toHaveLength(1);
    expect(made[0]!.allegiance).toBe("ZhIN");
    expect(made[0]!.hexes).toEqual(["0101"]);
  });

  it("draws none for a code nobody has named", () => {
    // Otherwise an imported sector sprouts a frontier round every client state
    // and every scrap of unclaimed space.
    expect(derivedBorders([world("0101", "CsIm")], no, [], NAMED)).toEqual([]);
  });

  it("leaves a published border alone", () => {
    const published: BorderPath[] = [
      { allegiance: "ZhIN", label: "Consulate", labelAt: "", hexes: ["0101", "0102", "0103"] },
    ];
    const made = derivedBorders([world("0505", "ZhIN")], no, published, NAMED);
    // The cartographer's line wins; a cruder one is not drawn over it.
    expect(made).toEqual([]);
  });

  it("still derives for a polity the published data has no border for", () => {
    const published: BorderPath[] = [
      { allegiance: "ZhIN", label: "", labelAt: "", hexes: ["0101", "0102", "0103"] },
    ];
    const made = derivedBorders([world("0505", "Hn")], no, published, NAMED);
    expect(made.map((one) => one.allegiance)).toEqual(["Hn"]);
  });

  it("labels it with the short name, and the full one where there is none", () => {
    const made = derivedBorders([world("0101", "ZhIN"), world("0505", "Hn")], no, [], NAMED);
    expect(made.find((one) => one.allegiance === "ZhIN")!.label).toBe("Consulate");
    expect(made.find((one) => one.allegiance === "Hn")!.label).toBe("The Hanse");
  });

  it("comes back in a settled order, so the colours do not shuffle", () => {
    const worlds = [world("0101", "Hn"), world("0505", "ZhIN")];
    const once = derivedBorders(worlds, no, [], NAMED).map((one) => one.allegiance);
    const twice = derivedBorders([...worlds].reverse(), no, [], NAMED).map((x) => x.allegiance);
    expect(once).toEqual(["Hn", "ZhIN"]);
    expect(twice).toEqual(once);
  });

  it("takes in the empty hex a ring of claims encloses", () => {
    // What makes this a frontier rather than a hull of dots: the map fills
    // what the claim encloses, so the hole in the middle is inside the line.
    // The six hexes round 0505 are claimed and 0505 itself is not.
    const ring = neighboursOf({ col: 5, row: 5 }).map(
      (hex) => `${String(hex.col).padStart(2, "0")}${String(hex.row).padStart(2, "0")}`,
    );
    const made = derivedBorders(
      ring.map((at) => world(at, "ZhIN")),
      no,
      [],
      NAMED,
    );
    expect(made[0]!.hexes).not.toContain("0505");
    const edges = borderEdges(made[0]!.hexes);
    // The middle hex contributes no edge, which is what being enclosed means:
    // the line runs round the outside of the ring and not round the hole.
    expect(edges.some((edge) => edge.hex.col === 5 && edge.hex.row === 5)).toBe(false);
    expect(edges).toHaveLength(18);
  });

  it("draws a frontier round a claim with no world in it at all", () => {
    const made = derivedBorders([], new Map([["0101", "ZhIN"]]), [], NAMED);
    expect(made).toHaveLength(1);
    expect(borderEdges(made[0]!.hexes)).toHaveLength(6);
  });
});

describe("what the map is handed", () => {
  it("puts the published lines under the worked out ones", () => {
    const published: BorderPath[] = [
      { allegiance: "ImDd", label: "", labelAt: "", hexes: ["0101", "0102", "0103"] },
    ];
    const derived: BorderPath[] = [
      { allegiance: "Hn", label: "", labelAt: "", hexes: ["0505"] },
    ];
    expect(bordersToDraw(published, derived).map((one) => one.allegiance)).toEqual(["ImDd", "Hn"]);
  });
});
