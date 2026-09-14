import { describe, expect, it } from "vitest";
import { AU_KM, crossingLabel, hoursAt1g, jumpShadowKm, kmToAu } from "./jump";
import { diameterKm, luminosityOf, radiusKm, SUN_RADIUS_KM, starsFor } from "./star";
import { generateSystem, starShadowAu } from "./system";

const SEEDS = Array.from({ length: 60 }, (_, i) => `shadow-${i}`);

describe("how big a star is", () => {
  it("makes a G dwarf the size of the Sun", () => {
    // SystemSpec 2.5: brightness and colour between them fix the size, and the
    // Sun is the one case everybody can check.
    const sun = { spectral: "G", subclass: 2, size: "V", luminosity: luminosityOf("G", "V") } as const;
    expect(radiusKm(sun) / SUN_RADIUS_KM).toBeCloseTo(1.06, 1);
  });

  it("makes a giant vast and a white dwarf small", () => {
    const giant = { spectral: "M", subclass: 0, size: "III", luminosity: luminosityOf("M", "III") } as const;
    const dwarf = { spectral: "A", subclass: 0, size: "D", luminosity: luminosityOf("A", "D") } as const;
    expect(radiusKm(giant)).toBeGreaterThan(SUN_RADIUS_KM * 5);
    // A cinder of degenerate matter, about the size of the Earth, whatever class
    // it used to be.
    expect(radiusKm(dwarf)).toBeLessThan(SUN_RADIUS_KM * 0.03);
    expect(radiusKm(dwarf)).toBeGreaterThan(1000);
  });

  it("counts a diameter as two radii", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const star = starsFor(seed).primary;
      expect(diameterKm(star)).toBeCloseTo(radiusKm(star) * 2, 6);
    }
  });
});

describe("the jump shadow", () => {
  it("reaches a hundred diameters", () => {
    expect(jumpShadowKm(12742)).toBe(1_274_200);
    expect(jumpShadowKm(1)).toBe(100);
  });

  it("puts the Sun's edge about where it really is", () => {
    // A hundred solar diameters is a little under an AU, which is why a ship
    // leaving Earth has most of an AU to run before it can jump.
    const sun = { spectral: "G", subclass: 2, size: "V", luminosity: luminosityOf("G", "V") } as const;
    const au = kmToAu(jumpShadowKm(diameterKm(sun)));
    expect(au).toBeGreaterThan(0.8);
    expect(au).toBeLessThan(1.1);
  });

  it("gives every system a shadow with a size to it", () => {
    for (const seed of SEEDS) {
      const shadow = starShadowAu(generateSystem(seed));
      expect(shadow, seed).toBeGreaterThan(0);
      // Even a bloated giant's shadow stays inside the system it is in: an
      // unreachable system would be a system nobody can play.
      expect(shadow, seed).toBeLessThan(50);
    }
  });

  it("gives every gas giant a size, and the size a shadow", () => {
    // SystemSpec 4.2.3. Two kinds, a Jupiter and a Neptune, and a spread inside
    // each: the giant everybody refuels at is the one they crawl away from.
    let seen = 0;
    let large = 0;
    for (const seed of SEEDS) {
      for (const orbit of generateSystem(seed).orbits) {
        if (orbit.content.kind !== "giant") continue;
        seen++;
        if (orbit.content.large) large++;
        expect(orbit.content.diameterKm, seed).toBeGreaterThan(40_000);
        expect(orbit.content.diameterKm, seed).toBeLessThan(170_000);
      }
    }
    expect(seen).toBeGreaterThan(20);
    expect(large).toBeGreaterThan(0);
    expect(large).toBeLessThan(seen);
  });

  it("is the same system every time it is generated", () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const once = generateSystem(seed).orbits.map((o) =>
        o.content.kind === "giant" ? o.content.diameterKm : 0,
      );
      const twice = generateSystem(seed).orbits.map((o) =>
        o.content.kind === "giant" ? o.content.diameterKm : 0,
      );
      expect(once).toEqual(twice);
    }
  });
});

describe("crossing one", () => {
  it("takes about three and a half hours to cross Earth's at 1g", () => {
    // 1.27M km from a standing start under one gravity.
    const hours = hoursAt1g(jumpShadowKm(12742));
    expect(hours).toBeGreaterThan(2.5);
    expect(hours).toBeLessThan(4.5);
  });

  it("takes longer the further it is", () => {
    expect(hoursAt1g(1e6)).toBeLessThan(hoursAt1g(4e6));
  });

  it("says it in the unit that suits the length", () => {
    expect(crossingLabel(0.4)).toContain("minutes");
    expect(crossingLabel(6)).toContain("hours");
    expect(crossingLabel(100)).toContain("days");
  });

  it("agrees with itself about an AU", () => {
    expect(kmToAu(AU_KM)).toBeCloseTo(1, 9);
  });
});
