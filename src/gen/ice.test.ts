import { describe, expect, it } from "vitest";
import { iceCapsFor, icedFraction, isIced, isIceCapped } from "./ice";
import { planetDetail, type PlanetDetail } from "./detail";
import { parseUwp } from "../planet";
import { aggressionFor, erosion, waterActivity, windFor } from "./shape";
import { heightColour, terrainBand } from "../ui/colour";

/**
 * A planet's detail values set outright, so a test can hold tilt, temperature and
 * water still and move one of them. Hunting for a seed with the tilt wanted makes
 * the other two move at the same time.
 */
const world = (axialTiltDeg: number, meanTempK: number, hydrographicsPct: number) =>
  ({ axialTiltDeg, meanTempK, hydrographicsPct }) as PlanetDetail;

/**
 * The same for erosion, where what matters is the air and what state the water is
 * in. Temperate and turning once a day unless a test says otherwise, so the air
 * terms can be read on their own.
 */
const surface = (over: Partial<PlanetDetail>) =>
  ({ meanTempK: 290, rotationHours: 24, hydrographicsPct: 0, pressureAtm: 0, ...over }) as PlanetDetail;

/** Earth's mean surface temperature, and a world frozen hard. */
const TEMPERATE_K = 287;
const FROZEN_K = 230;

/** Temperate, well watered, standard atmosphere: the shape of an Earth. */
const EARTHLIKE = "A867A69-F";
/** Atmosphere 1 with water, which is what the Ice-Capped trade code asks for. */
const FROZEN = "A815000-9";

describe("chemical erosion", () => {
  it("leaves ordinary atmospheres alone", () => {
    for (const digit of [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15]) {
      expect(aggressionFor(digit)).toBe(1);
    }
  });

  it("makes corrosive and insidious air bite harder", () => {
    expect(aggressionFor(11)).toBeGreaterThan(1); // B
    expect(aggressionFor(12)).toBeGreaterThan(aggressionFor(11)); // C
  });

  it("weathers a corrosive world more than a clean one at the same pressure", () => {
    // Pressure and water held equal, so the only difference is the chemistry.
    const air = surface({ pressureAtm: 0.8, hydrographicsPct: 20 });
    expect(erosion(air, 11)).toBeGreaterThan(erosion(air, 6)); // corrosive over standard
    expect(erosion(air, 12)).toBeGreaterThan(erosion(air, 11)); // insidious over corrosive
    expect(erosion(air, 7)).toBe(erosion(air, 6)); // tainted is not aggressive
  });

  it("still erodes nothing where there is no air to be corrosive with", () => {
    const none = surface({});
    expect(erosion(none, 12)).toBe(0);
  });

  it("does not saturate at a dense atmosphere, or the chemistry could not show", () => {
    const dense = surface({ pressureAtm: 2.0 });
    expect(erosion(dense, 6)).toBeLessThan(0.5);
    expect(erosion(dense, 11)).toBeGreaterThan(erosion(dense, 6));
  });
});

describe("water as an erosive agent", () => {
  it("works hardest where the water is liquid", () => {
    expect(waterActivity(TEMPERATE_K)).toBe(1);
    expect(waterActivity(300)).toBe(1);
  });

  it("does nothing at all where the ice is too cold to move", () => {
    expect(waterActivity(100)).toBe(0);
    expect(waterActivity(140)).toBe(0);
  });

  it("does nothing where there is no liquid left to do it with", () => {
    expect(waterActivity(450)).toBe(0);
    expect(waterActivity(737)).toBe(0); // Venus
  });

  it("keeps a glacier working, at some fraction of a river", () => {
    const glacial = waterActivity(240);
    expect(glacial).toBeGreaterThan(0.3);
    expect(glacial).toBeLessThan(1);
    expect(waterActivity(210)).toBeGreaterThan(0); // Mars
  });

  it("rises to the liquid band and falls away past it, without a step", () => {
    let previous = waterActivity(150);
    for (let k = 151; k <= 330; k++) {
      const now = waterActivity(k);
      expect(now).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = now;
    }
    for (let k = 330; k <= 400; k++) {
      const now = waterActivity(k);
      expect(now).toBeLessThanOrEqual(previous + 1e-9);
      previous = now;
    }
  });

  it("leaves a frozen ocean world less worn than a temperate one", () => {
    const ocean = (tempK: number) =>
      erosion(surface({ meanTempK: tempK, hydrographicsPct: 90, pressureAtm: 1 }), 6);
    expect(ocean(TEMPERATE_K)).toBeGreaterThan(ocean(120));
    expect(ocean(TEMPERATE_K)).toBeGreaterThan(ocean(500));
  });
});

describe("wind as an erosive agent", () => {
  it("leaves a world turning once a day at the reference", () => {
    expect(windFor(24)).toBeCloseTo(1, 6);
  });

  it("blows harder on a fast rotator and barely at all on a locked one", () => {
    expect(windFor(6)).toBeGreaterThan(1);
    expect(windFor(8766)).toBeLessThan(1);
    expect(windFor(3)).toBeGreaterThan(windFor(12));
  });

  it("stays mild, since three orders of magnitude of spin are not that much rock", () => {
    expect(windFor(0.5)).toBeLessThanOrEqual(1.4);
    expect(windFor(1e6)).toBeGreaterThanOrEqual(0.6);
  });

  it("wears a fast turning world down more than a slow one", () => {
    const spun = (hours: number) =>
      erosion(surface({ rotationHours: hours, pressureAtm: 1.5 }), 6);
    expect(spun(6)).toBeGreaterThan(spun(24));
    expect(spun(24)).toBeGreaterThan(spun(5000));
  });
});

describe("ice caps", () => {
  it("caps an Earth-like world, which the trade code alone would not", () => {
    expect(isIceCapped(parseUwp(EARTHLIKE)!)).toBe(false);
    const caps = iceCapsFor(EARTHLIKE, world(23.4, TEMPERATE_K, 70));
    expect(caps).not.toBeNull();
    // Around a tenth of the surface, which is the calibration point.
    expect(icedFraction(caps)).toBeGreaterThan(0.05);
    expect(icedFraction(caps)).toBeLessThan(0.15);
  });

  it("shrinks the caps as the tilt rises, and loses them past the limit", () => {
    const at = (tilt: number) => icedFraction(iceCapsFor(EARTHLIKE, world(tilt, TEMPERATE_K, 70)));
    expect(at(0)).toBeGreaterThan(at(20));
    expect(at(20)).toBeGreaterThan(at(40));
    expect(at(60)).toBe(0);
  });

  it("pushes the ice back as the world warms", () => {
    const at = (tempK: number) => icedFraction(iceCapsFor(EARTHLIKE, world(20, tempK, 70)));
    expect(at(250)).toBe(at(TEMPERATE_K)); // already at full extent by Earth's mean
    expect(at(TEMPERATE_K)).toBeGreaterThan(at(305));
    expect(at(325)).toBe(0);
  });

  it("gives an ice-capped profile a floor its tilt would otherwise deny it", () => {
    expect(isIceCapped(parseUwp(FROZEN)!)).toBe(true);
    // A tilt this high leaves an ordinary world with nothing at all.
    expect(iceCapsFor(EARTHLIKE, world(54, TEMPERATE_K, 70))).toBeNull();
    const frozen = iceCapsFor(FROZEN, world(54, FROZEN_K, 70));
    expect(frozen).not.toBeNull();
    expect(90 - frozen!.edgeDeg).toBeGreaterThanOrEqual(39.9);
  });

  it("lets the floor be a floor, not a ceiling", () => {
    // An untilted ice-capped world beats its own floor on the ordinary reckoning.
    const still = iceCapsFor(FROZEN, world(0, FROZEN_K, 70))!;
    const tilted = iceCapsFor(FROZEN, world(54, FROZEN_K, 70))!;
    expect(90 - still.edgeDeg).toBeGreaterThan(90 - tilted.edgeDeg);
  });

  it("never makes more ice than the world has water", () => {
    for (const uwp of [EARTHLIKE, FROZEN]) {
      for (const waterPct of [1, 5, 12, 30, 60, 100]) {
        const caps = iceCapsFor(uwp, world(0, TEMPERATE_K, waterPct));
        expect(icedFraction(caps)).toBeLessThanOrEqual(waterPct / 100 + 1e-9);
      }
    }
  });

  it("leaves a world with no water uncapped, since there is nothing to freeze", () => {
    expect(iceCapsFor(FROZEN, world(0, FROZEN_K, 0))).toBeNull();
  });

  it("gives an unreadable profile no caps rather than guessing", () => {
    expect(iceCapsFor("nonsense", planetDetail("ABC", "nonsense"))).toBeNull();
  });

  it("caps both poles and leaves the equator clear", () => {
    const caps = iceCapsFor(EARTHLIKE, world(10, 1.0, 70))!;
    expect(isIced(caps, 0)).toBe(false);
    expect(isIced(caps, 1)).toBe(true);
    expect(isIced(caps, -1)).toBe(true);
    expect(isIced(caps, caps.edgeY)).toBe(true);
    expect(isIced(caps, caps.edgeY * 0.99)).toBe(false);
  });

  it("is never iced where there are no caps", () => {
    for (const y of [-1, -0.5, 0, 0.5, 1]) expect(isIced(null, y)).toBe(false);
    expect(icedFraction(null)).toBe(0);
  });

  it("works off a real seed, not only made up numbers", () => {
    const caps = iceCapsFor(EARTHLIKE, planetDetail("ZZZZ9999", EARTHLIKE));
    expect(caps).not.toBeNull();
    expect(icedFraction(caps)).toBeGreaterThan(0);
  });
});

describe("ice in the colouring", () => {
  it("pales the ground without painting out its relief", () => {
    const low = heightColour(0.6, 0.5, true);
    const high = heightColour(0.95, 0.5, true);
    expect(low).not.toBe(high);
    // Both are lighter than the same ground uncapped.
    const brightness = (c: string) =>
      (c.match(/\d+/g) ?? []).reduce((t, n) => t + Number(n), 0);
    expect(brightness(low)).toBeGreaterThan(brightness(heightColour(0.6, 0.5, false)));
  });

  it("names ice in the hex readout, and says what is under it", () => {
    expect(terrainBand(0.8, 0.5, true)).toBe("Ice cap");
    expect(terrainBand(0.3, 0.5, true)).toBe("Ice over sea");
    expect(terrainBand(0.8, 0.5, false)).not.toContain("Ice");
  });
});
