import { describe, expect, it } from "vitest";
import { ATTRIBUTES, fractionFor, planetDetail, valueOf } from "./detail";
import { describeUwp } from "./describe";
import { parseUwp, rollUwp } from "../planet";
import { generateHeights, seaCoverage, seaLevelFor } from "./height";
import { buildGrid } from "../grid/grid";
import { erosion, fieldOptionsFor } from "./shape";
import { DEFAULT_FIELD_OPTIONS } from "./field";
import { normalise, terrainBand } from "../ui/colour";

const attribute = (key: string) => ATTRIBUTES.find((a) => a.key === key)!;
const band = (key: string, digit: number) => attribute(key).band(digit);

describe("size bands", () => {
  it("reads the bands off the cheatsheet, digit 0 running down to nothing", () => {
    expect(band("diameter", 0)).toEqual([0, 1000]);
    expect(band("diameter", 1)).toEqual([1000, 1600]);
    expect(band("diameter", 2)).toEqual([1600, 3200]);
    expect(band("diameter", 10)).toEqual([14400, 16000]);
  });

  it("clamps a digit outside the table rather than returning holes", () => {
    expect(band("diameter", -3)).toEqual([0, 1000]);
    expect(band("diameter", 15)).toEqual([14400, 16000]);
  });

  it("places the fraction linearly in the band", () => {
    const place = (digit: number, fraction: number) => {
      const [min, max] = band("diameter", digit);
      return Math.round(min + (max - min) * fraction);
    };
    expect(place(1, 0.5)).toBe(1300);
    expect(place(2, 0.5)).toBe(2400);
    expect(place(1, 0)).toBe(1000);
    expect(place(1, 0.999)).toBeLessThan(1600);
    // The same fraction, re-read against the band the new digit names.
    expect(place(1, 0.25)).toBe(1150);
    expect(place(2, 0.25)).toBe(2000);
  });
});

describe("bands for every ranged position", () => {
  it("covers size, gravity, pressure, hydrographics and population", () => {
    expect(ATTRIBUTES.map((a) => a.key)).toEqual([
      "diameter",
      "gravity",
      "pressure",
      "hydrographics",
      "population",
    ]);
  });

  it("takes hydrographics bands straight from the cheatsheet", () => {
    expect(band("hydrographics", 0)).toEqual([0, 5]);
    expect(band("hydrographics", 1)).toEqual([6, 15]);
    expect(band("hydrographics", 6)).toEqual([56, 65]);
    expect(band("hydrographics", 10)).toEqual([96, 100]);
  });

  it("treats the population digit as an exponent, and 0 as nobody", () => {
    expect(band("population", 0)).toEqual([0, 0]);
    expect(band("population", 1)).toEqual([10, 99]);
    expect(band("population", 6)).toEqual([1e6, 1e7 - 1]);
  });

  it("gives an airless world no pressure and a vacuum world no gravity", () => {
    expect(band("pressure", 0)).toEqual([0, 0]);
    expect(band("gravity", 0)).toEqual([0, 0]);
  });

  it("keeps every band ordered, so no fraction can land outside it", () => {
    for (const a of ATTRIBUTES) {
      for (let digit = 0; digit <= 15; digit++) {
        const [min, max] = a.band(digit);
        expect(max).toBeGreaterThanOrEqual(min);
      }
    }
  });
});

describe("fractions", () => {
  it("is fixed by the seed and the attribute name", () => {
    expect(fractionFor("ABC", "diameter")).toBe(fractionFor("ABC", "diameter"));
    expect(fractionFor("ABC", "diameter")).not.toBe(fractionFor("ABD", "diameter"));
  });

  it("gives each attribute its own stream, so adding one cannot shift another", () => {
    expect(fractionFor("ABC", "diameter")).not.toBe(fractionFor("ABC", "axial-tilt"));
  });

  it("stays in range", () => {
    for (let i = 0; i < 500; i++) {
      const f = fractionFor(`seed-${i}`, "diameter");
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});

describe("planetDetail", () => {
  it("keeps every value inside the band its UWP digit names", () => {
    for (let i = 0; i < 200; i++) {
      const seed = `seed-${i}`;
      const uwp = rollUwp(seed);
      const parsed = parseUwp(uwp)!;
      for (const a of ATTRIBUTES) {
        const value = valueOf(a, seed, parsed)!;
        const [min, max] = a.band(a.position === null ? 0 : parsed[a.position]);
        expect(value).toBeGreaterThanOrEqual(Math.floor(min));
        expect(value).toBeLessThanOrEqual(Math.ceil(max));
      }
    }
  });

  it("gives every attribute a row for the panel", () => {
    const detail = planetDetail("ABC", "CA6A643-9");
    expect(detail.rows).toHaveLength(ATTRIBUTES.length);
    expect(detail.rows.every((r) => r.text !== "")).toBe(true);
  });

  it("has no banded value when the UWP cannot be read, but still has a climate", () => {
    const detail = planetDetail("ABC", "not a profile");
    expect(detail.diameterKm).toBeNull();
    expect(detail.gravityG).toBeNull();
    expect(detail.pressureAtm).toBeNull();
    expect(detail.hydrographicsPct).toBeNull();
    expect(detail.population).toBeNull();
    expect(detail.axialTiltDeg).toBeGreaterThanOrEqual(0);
    expect(detail.orbitAu).toBeGreaterThan(0);
    expect(detail.rotationHours).toBeGreaterThan(0);
    expect(detail.rows.filter((r) => r.text === "—")).toHaveLength(ATTRIBUTES.length);
  });

  it("reads the tilt off the UWP, since the profile is evidence about the orbit", () => {
    // A desert rock and a Venus do not sit in the same place, and how close in a
    // world sits is what decides whether tides have pulled its axis upright.
    // Spec 6.12.3.5: this used to come from the seed alone.
    const rock = planetDetail("ABC", "A100000-0");
    const venus = planetDetail("ABC", "X9AF999-F");
    expect(venus.orbitAu).not.toBe(rock.orbitAu);
    expect(venus.meanTempK).toBeGreaterThan(rock.meanTempK);
  });

  it("keeps the tilt in range", () => {
    for (let i = 0; i < 200; i++) {
      const tilt = planetDetail(`seed-${i}`, "CA6A643-9").axialTiltDeg;
      expect(tilt).toBeGreaterThanOrEqual(0);
      expect(tilt).toBeLessThanOrEqual(180);
    }
  });
});

describe("parseUwp", () => {
  it("reads the eight positions in order", () => {
    expect(parseUwp("CA6A643-9")).toEqual({
      starport: "C",
      size: 10,
      atmosphere: 6,
      hydrographics: 10,
      population: 6,
      government: 4,
      law: 3,
      tech: 9,
    });
  });

  it("accepts what the user is likely to type", () => {
    expect(parseUwp("  ca6a643-9  ")).toEqual(parseUwp("CA6A643-9"));
  });

  it("rejects anything that is not a profile", () => {
    for (const bad of ["", "CA6A643", "CA6A6439", "ZA6A643-9", "CA6A64-39", "CA6A6433-9"]) {
      expect(parseUwp(bad)).toBeNull();
    }
  });

  it("reads back everything rollUwp produces", () => {
    for (let i = 0; i < 200; i++) expect(parseUwp(rollUwp(`seed-${i}`))).not.toBeNull();
  });
});

describe("describeUwp", () => {
  it("describes a world from its digits", () => {
    const detail = planetDetail("ABC", "CA6A643-9");
    const text = describeUwp("CA6A643-9", detail)!;
    expect(text).toContain("a standard atmosphere");
    expect(text).toMatch(/9[6-9]% surface water|100% surface water/);
    expect(text).toMatch(/million people/);
    expect(text).toContain("a representative democracy");
    expect(text).toContain("law level 3");
    expect(text).toContain("a routine starport");
    expect(text).toContain("tech level 9");
  });

  it("says nobody lives there rather than describing a government of nobody", () => {
    const text = describeUwp("X100000-0", planetDetail("ABC", "X100000-0"))!;
    expect(text).toContain("Nobody lives there.");
    expect(text).not.toContain("no government");
  });

  it("returns null for an unreadable UWP", () => {
    expect(describeUwp("nonsense", planetDetail("ABC", "nonsense"))).toBeNull();
  });

  it("produces prose for everything rollUwp produces", () => {
    for (let i = 0; i < 200; i++) {
      const seed = `seed-${i}`;
      const uwp = rollUwp(seed);
      const text = describeUwp(uwp, planetDetail(seed, uwp));
      expect(text).toBeTruthy();
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("off the scale");
    }
  });
});

describe("sea level from the UWP", () => {
  const grid = buildGrid(8);
  const heights = generateHeights(grid, "SEATEST");

  it("puts the wanted fraction of the surface under water", () => {
    for (const wanted of [0, 0.05, 0.25, 0.5, 0.73, 0.96, 1]) {
      const level = seaLevelFor(heights, wanted);
      expect(seaCoverage(heights, level)).toBeCloseTo(wanted, 2);
    }
  });

  it("leaves a world with no water entirely dry, including cells at height 0", () => {
    const flat = Float64Array.from([0, 0, 0.5, 1]);
    expect(seaCoverage(flat, seaLevelFor(flat, 0))).toBe(0);
  });

  it("puts a world of all water entirely under, including cells at height 1", () => {
    const flat = Float64Array.from([0, 0.5, 1, 1]);
    expect(seaCoverage(flat, seaLevelFor(flat, 1))).toBe(1);
  });

  it("moves the coastline with the hydrographics digit but not the heights", () => {
    const dry = planetDetail("SEATEST", "A862000-0").hydrographicsPct!;
    const wet = planetDetail("SEATEST", "A868000-0").hydrographicsPct!;
    const dryLevel = seaLevelFor(heights, dry / 100);
    const wetLevel = seaLevelFor(heights, wet / 100);
    expect(wetLevel).toBeGreaterThan(dryLevel);
    expect(seaCoverage(heights, wetLevel)).toBeGreaterThan(seaCoverage(heights, dryLevel));
  });

  it("keeps the coastline at the ramp's blue-green boundary whatever the sea level", () => {
    for (const wanted of [0.05, 0.35, 0.62, 0.95]) {
      const level = seaLevelFor(heights, wanted);
      expect(normalise(level, level)).toBeCloseTo(0.5, 6);
      expect(terrainBand(level, level)).toBe("Sea");
      expect(terrainBand(level + 1e-6, level)).toBe("Lowland");
    }
  });

  it("still spreads land across the full ramp on a nearly dry world", () => {
    const level = seaLevelFor(heights, 0.05);
    const peaks = [...heights].filter((h) => terrainBand(h, level) === "Peak");
    const lowland = [...heights].filter((h) => terrainBand(h, level) === "Lowland");
    expect(peaks.length).toBeGreaterThan(0);
    expect(lowland.length).toBeGreaterThan(0);
  });
});

describe("terrain shaped by the UWP", () => {
  const grid = buildGrid(8);
  const optionsFor = (uwp: string) => fieldOptionsFor(planetDetail("SHAPE", uwp), uwp);
  const relief = (uwp: string) => {
    const h = generateHeights(grid, "SHAPE", optionsFor(uwp));
    return Math.max(...h) - Math.min(...h);
  };

  it("gives a light world more relief than a heavy one", () => {
    // Size 1 is 0.05g, size 9 is 1.25g. Everything else held equal.
    expect(optionsFor("A1160A4-9").roughness).toBeGreaterThan(optionsFor("A9160A4-9").roughness);
    expect(relief("A1160A4-9")).toBeGreaterThan(relief("A9160A4-9"));
  });

  it("keeps more fine detail on a bare world than a weathered one", () => {
    // Airless and dry, against dense air and near total ocean.
    expect(optionsFor("A8000A4-9").persistence).toBeGreaterThan(
      optionsFor("A88A0A4-9").persistence,
    );
  });

  it("counts air and water as separate causes of erosion", () => {
    const at = (uwp: string) => erosion(planetDetail("SHAPE", uwp), parseUwp(uwp)!.atmosphere);
    const bare = at("A8000A4-9"); // no air, hydro 0
    const wet = at("A80A0A4-9"); // no air, hydro A
    const airy = at("A8800A4-9"); // dense air, hydro 0
    const both = at("A88A0A4-9");
    // Hydro 0 is "0 to 5%" rather than bone dry, so a bare world is near 0, not 0.
    expect(bare).toBeLessThan(0.03);
    expect(wet).toBeGreaterThan(bare);
    expect(airy).toBeGreaterThan(bare);
    expect(both).toBeGreaterThan(Math.max(wet, airy));
  });

  it("leaves continent spread to the seed", () => {
    expect(optionsFor("A1160A4-9").seedSpread).toBe(optionsFor("A9860A4-9").seedSpread);
  });

  it("falls back to the defaults when the UWP cannot be read", () => {
    expect(fieldOptionsFor(planetDetail("SHAPE", "nonsense"), "nonsense")).toEqual(DEFAULT_FIELD_OPTIONS);
  });

  it("still produces a usable surface across every size and atmosphere digit", () => {
    for (let size = 0; size <= 10; size++) {
      for (const air of [0, 6, 13]) {
        const uwp = `A${size.toString(36)}${air.toString(36)}60A4-9`.toUpperCase();
        const h = generateHeights(grid, "SHAPE", optionsFor(uwp));
        expect([...h].every((v) => v >= 0 && v <= 1)).toBe(true);
        expect(Math.max(...h)).toBeGreaterThan(Math.min(...h));
      }
    }
  });
});
