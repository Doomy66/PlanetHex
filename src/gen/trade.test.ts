import { describe, expect, it } from "vitest";
import { formatPbg, pbgFor, tradeCodes } from "./trade";
import { newPlanet, rollUwp } from "../planet";

/**
 * The trade classifications of 6.16. Each is a test over the digits, so what
 * matters is that a profile written to meet one earns it, a profile written to
 * miss it by one digit does not, and a profile that meets several earns all of
 * them.
 */

const codes = (uwp: string): string[] => tradeCodes(uwp).map((code) => code.code);

describe("trade codes", () => {
  it("gives an agricultural world Ag", () => {
    // Atmosphere 6, hydrographics 6, population 6: the middle of all three bands.
    expect(codes("A666666-9")).toContain("Ag");
  });

  it("does not give Ag to a world one short on population", () => {
    expect(codes("A666466-9")).not.toContain("Ag");
  });

  it("gives a vacuum world Va, and an airless rock As with it", () => {
    expect(codes("X000000-0")).toEqual(expect.arrayContaining(["As", "Ba", "Va"]));
  });

  // Desert asks for an atmosphere of at least 2, so a vacuum rock is not a desert.
  it("keeps De for a world with air and no water", () => {
    expect(codes("X000000-0")).not.toContain("De");
    expect(codes("C560000-6")).toContain("De");
  });

  it("gives a world with no people Ba, and nothing that needs people", () => {
    const earned = codes("X000000-0");
    expect(earned).toContain("Ba");
    expect(earned).not.toContain("Hi");
    expect(earned).not.toContain("Lo");
    expect(earned).not.toContain("Lt");
  });

  it("gives an ocean world Wa", () => {
    expect(codes("A66A644-9")).toContain("Wa");
  });

  it("gives a crowded industrial world both Hi and In", () => {
    expect(codes("A877A64-D")).toEqual(expect.arrayContaining(["Hi", "In", "Ht"]));
  });

  it("gives a fluid ocean world Fl rather than Wa", () => {
    const earned = codes("B8A5544-9");
    expect(earned).toContain("Fl");
    expect(earned).not.toContain("Wa");
  });

  it("gives an ice-capped world IC", () => {
    expect(codes("C614544-8")).toContain("IC");
  });

  it("says nothing about a profile it cannot read", () => {
    expect(codes("not a profile")).toEqual([]);
  });

  it("names every code it gives", () => {
    for (const code of tradeCodes("A666666-9")) {
      expect(code.label).not.toBe("");
    }
  });
});

/**
 * PBG. The figures are not in the surface anywhere, so what is being checked is
 * that they are the seed's and stay the seed's, which is the whole of the claim
 * made for them.
 */
describe("PBG", () => {
  it("gives the same figures for the same seed", () => {
    const uwp = newPlanet("ABCD1234").uwp;
    expect(pbgFor("ABCD1234", uwp)).toEqual(pbgFor("ABCD1234", uwp));
  });

  it("gives different seeds their own figures", () => {
    const different = new Set(
      ["A", "B", "C", "D", "E", "F", "G", "H"].map((seed) =>
        formatPbg(pbgFor(seed, rollUwp(seed))),
      ),
    );
    expect(different.size).toBeGreaterThan(1);
  });

  it("writes three digits, whatever the world", () => {
    for (const seed of ["A", "B", "C", "D", "E"]) {
      expect(formatPbg(pbgFor(seed, rollUwp(seed)))).toMatch(/^\d{3}$/);
    }
  });

  // A tenth of nobody is still nobody, so an empty world's multiplier is zero.
  it("gives an empty world no population multiplier", () => {
    expect(pbgFor("ABCD1234", "X000000-0").multiplier).toBe(0);
  });

  it("keeps belts and gas giants inside a digit", () => {
    for (const seed of ["A", "B", "C", "D", "E", "F"]) {
      const pbg = pbgFor(seed, rollUwp(seed));
      expect(pbg.belts).toBeGreaterThanOrEqual(0);
      expect(pbg.belts).toBeLessThanOrEqual(9);
      expect(pbg.gasGiants).toBeGreaterThanOrEqual(0);
      expect(pbg.gasGiants).toBeLessThanOrEqual(9);
    }
  });
});
