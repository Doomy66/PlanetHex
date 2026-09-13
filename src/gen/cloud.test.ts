import { describe, expect, it } from "vitest";
import { bandAt, cloudAt, cloudWorldFor, type CloudWorld } from "./cloud";
import { albedoFor } from "./climate";
import type { PlanetDetail } from "./detail";
import type { Vec3 } from "../grid/vec3";

/**
 * The sky of 5.10. What is checked is that the cover means what it says, that the
 * bands sit where the circulation of 5.7.2.2 puts them, and that a world with
 * nothing to make weather from has none.
 */

const detail = (over: Partial<PlanetDetail> = {}) =>
  ({ hydrographicsPct: 70, pressureAtm: 1, ...over }) as PlanetDetail;

const EARTH = cloudWorldFor("TESTSEED", detail());

const sinOf = (latDeg: number) => Math.sin((latDeg * Math.PI) / 180);

/** Points spread evenly over a band of latitude, for measuring a share. */
function ring(latDeg: number, count = 400): Vec3[] {
  const y = sinOf(latDeg);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  return Array.from({ length: count }, (_, i) => {
    const theta = (2 * Math.PI * i) / count;
    return [r * Math.cos(theta), y, r * Math.sin(theta)] as Vec3;
  });
}

const meanOver = (world: CloudWorld, latDeg: number) => {
  const points = ring(latDeg);
  return points.reduce((sum, p) => sum + cloudAt(world, p), 0) / points.length;
};

describe("how much sky there is", () => {
  it("needs water and air, and neither on its own will do", () => {
    expect(cloudWorldFor("s", detail({ hydrographicsPct: 0 })).cover).toBe(0);
    expect(cloudWorldFor("s", detail({ pressureAtm: 0 })).cover).toBe(0);
    expect(cloudWorldFor("s", detail()).cover).toBeGreaterThan(0);
  });

  it("is the same figure the albedo is built on", () => {
    // Spec 5.10.2: one number, so a world the globe draws overcast cannot be one
    // the temperature model has been treating as clear.
    const wet = cloudWorldFor("s", detail({ hydrographicsPct: 100, pressureAtm: 1 }));
    const dry = cloudWorldFor("s", detail({ hydrographicsPct: 0, pressureAtm: 1 }));
    expect(albedoFor(100, 1)).toBeGreaterThan(albedoFor(0, 1));
    expect(wet.cover).toBeGreaterThan(dry.cover);
  });

  it("draws nothing at all on a world with no cover", () => {
    const bare = cloudWorldFor("s", detail({ hydrographicsPct: 0 }));
    for (const lat of [0, 30, 60, 85]) {
      expect(meanOver(bare, lat)).toBe(0);
    }
  });
});

describe("where the sky is", () => {
  it("puts the clear belts where 5.7.2.2 puts the deserts", () => {
    expect(bandAt(sinOf(26))).toBeLessThan(bandAt(sinOf(0)));
    expect(bandAt(sinOf(26))).toBeLessThan(bandAt(sinOf(55)));
  });

  it("is cloudiest over the equator and along the storm track", () => {
    expect(bandAt(sinOf(0))).toBeGreaterThan(bandAt(sinOf(26)));
    expect(bandAt(sinOf(55))).toBeGreaterThan(bandAt(sinOf(26)));
  });

  it("leaves the subtropics clearer than the equator on a real world", () => {
    expect(meanOver(EARTH, 26)).toBeLessThan(meanOver(EARTH, 0));
  });

  it("never asks for a negative sky", () => {
    for (let lat = -90; lat <= 90; lat += 3) {
      expect(bandAt(sinOf(lat))).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the weather itself", () => {
  it("gives the same world the same sky", () => {
    const p: Vec3 = [0.3, 0.5, Math.sqrt(1 - 0.09 - 0.25)];
    expect(cloudAt(EARTH, p)).toBe(cloudAt(EARTH, p));
  });

  it("gives two worlds different skies", () => {
    const other = cloudWorldFor("OTHERSEED", detail());
    const points = ring(10, 200);
    const differs = points.filter(
      (p) => Math.abs(cloudAt(EARTH, p) - cloudAt(other, p)) > 0.05,
    );
    expect(differs.length).toBeGreaterThan(points.length / 4);
  });

  it("covers more of a wet world than a dry one", () => {
    const damp = cloudWorldFor("TESTSEED", detail({ hydrographicsPct: 20 }));
    const soaked = cloudWorldFor("TESTSEED", detail({ hydrographicsPct: 100 }));
    expect(meanOver(soaked, 10)).toBeGreaterThan(meanOver(damp, 10));
  });

  it("keeps every reading between clear sky and solid overcast", () => {
    for (const lat of [-80, -40, 0, 40, 80]) {
      for (const p of ring(lat, 60)) {
        const thickness = cloudAt(EARTH, p);
        expect(thickness).toBeGreaterThanOrEqual(0);
        expect(thickness).toBeLessThanOrEqual(1);
      }
    }
  });

  it("leaves a meaningful share of a well watered world clear", () => {
    // Spec 5.10.4: the point of the panel is the planet, so a sky that covered it
    // everywhere would be a bug however faithful the figure behind it.
    const points = [0, 20, 45, 70].flatMap((lat) => ring(lat, 150));
    const clear = points.filter((p) => cloudAt(EARTH, p) < 0.25);
    expect(clear.length).toBeGreaterThan(points.length / 5);
  });
});
