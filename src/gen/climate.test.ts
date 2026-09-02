import { describe, expect, it } from "vitest";
import {
  albedoFor,
  bareOrbitAu,
  climateFor,
  despinFor,
  greenhouseFor,
  isTidallyLocked,
  orbitalPeriodHours,
  orbitForTemperature,
  rotationHoursFor,
  targetTemperatureK,
  temperatureAt,
} from "./climate";
import { planetDetail } from "./detail";
import { parseUwp, rollUwp } from "../planet";

/**
 * The world settings of 6.15. The calibration cases are the planets whose figures
 * are known, and the rest are distribution tests over a run of rolled worlds.
 *
 * Reference: Earth 1 AU, albedo 0.31, mean 288K, 23.9h day. Mars 1.52 AU, mean
 * 210K. The Moon at 1 AU with no air, mean about 270K. Mercury 0.39 AU and Venus
 * 0.72 AU are both tidally settled; Earth at 1 AU is not.
 */

describe("albedo", () => {
  it("gives Earth's oceans and air about three tenths", () => {
    expect(albedoFor(71, 1)).toBeCloseTo(0.31, 2);
  });

  it("gives bare airless rock about a tenth, as the Moon has", () => {
    expect(albedoFor(0, 0)).toBeCloseTo(0.1, 2);
    expect(albedoFor(100, 0)).toBeCloseTo(0.1, 2); // no air, no cloud
  });

  it("brightens with water and with air, since it is the cloud that reflects", () => {
    expect(albedoFor(80, 1)).toBeGreaterThan(albedoFor(20, 1));
    expect(albedoFor(80, 1)).toBeGreaterThan(albedoFor(80, 0.2));
  });
});

describe("greenhouse", () => {
  it("warms Earth by the 33K it is warmed by", () => {
    expect(greenhouseFor(1, 6)).toBeCloseTo(33, 0);
  });

  it("warms Mars by the 5K it is warmed by", () => {
    expect(greenhouseFor(0.006, 4)).toBeCloseTo(5, 0);
  });

  it("leaves a world with no air unwarmed", () => {
    expect(greenhouseFor(0, 0)).toBe(0);
  });

  it("adds a runaway on air the profile calls exotic, corrosive or insidious", () => {
    for (const digit of [10, 11, 12]) {
      expect(greenhouseFor(1, digit)).toBeGreaterThan(greenhouseFor(1, 6) + 100);
    }
    expect(greenhouseFor(1, 9)).toBe(greenhouseFor(1, 6));
  });
});

describe("temperature and orbit", () => {
  it("puts Earth within a couple of degrees of its own mean", () => {
    const t = temperatureAt(1, albedoFor(71, 1), greenhouseFor(1, 6));
    expect(t).toBeGreaterThan(283);
    expect(t).toBeLessThan(291);
  });

  it("puts the airless Moon at Earth's distance near its own mean", () => {
    expect(temperatureAt(1, albedoFor(0, 0), 0)).toBeCloseTo(271, -1);
  });

  it("cools with distance as the inverse square root", () => {
    expect(temperatureAt(4, 0, 0)).toBeCloseTo(temperatureAt(1, 0, 0) / 2, 6);
  });

  it("inverts, so an orbit and a temperature are one number seen twice", () => {
    for (const orbit of [0.2, 0.5, 1, 2.5, 9]) {
      const albedo = 0.3;
      const greenhouse = 20;
      const t = temperatureAt(orbit, albedo, greenhouse);
      expect(orbitForTemperature(t, albedo, greenhouse)).toBeCloseTo(orbit, 6);
    }
  });

  it("sends a world air alone could not keep that warm out to the far limit", () => {
    // Nothing at any distance is colder than the greenhouse floor.
    expect(orbitForTemperature(50, 0.3, 200)).toBe(50);
  });
});

describe("what the profile says about temperature", () => {
  const at = (uwp: string, seed: string) => targetTemperatureK(seed, parseUwp(uwp));

  it("keeps water under air liquid, or the hydrographics digit would be a lie", () => {
    for (let i = 0; i < 200; i++) {
      const target = at("A867A69-A", `t-${i}`)!;
      expect(target).toBeGreaterThan(265);
      expect(target).toBeLessThan(310);
    }
  });

  it("freezes water under air too thin to hold heat, as the trade code says", () => {
    for (let i = 0; i < 200; i++) expect(at("A815000-9", `t-${i}`)!).toBeLessThanOrEqual(273);
  });

  it("runs air it calls corrosive hot", () => {
    for (let i = 0; i < 200; i++) expect(at("A8B5544-6", `t-${i}`)!).toBeGreaterThanOrEqual(320);
  });

  it("infers nothing at all about a world with no surface water", () => {
    expect(at("X100000-0", "t-1")).toBeNull();
    expect(at("A5407B9-C", "t-1")).toBeNull();
  });

  it("spreads a world it can say nothing about over the orbits, log-uniformly", () => {
    const orbits = Array.from({ length: 2000 }, (_, i) => bareOrbitAu(`bare-${i}`));
    for (const orbit of orbits) {
      expect(orbit).toBeGreaterThanOrEqual(0.15);
      expect(orbit).toBeLessThanOrEqual(15);
    }
    // Log-uniform means the halves either side of the geometric centre are equal.
    const inner = orbits.filter((o) => o < Math.sqrt(0.15 * 15)).length;
    expect(inner / orbits.length).toBeGreaterThan(0.44);
    expect(inner / orbits.length).toBeLessThan(0.56);
  });
});

describe("despin", () => {
  it("settles Mercury and Venus and leaves Earth alone", () => {
    expect(despinFor(0.39)).toBe(1);
    expect(despinFor(0.72)).toBeGreaterThan(0.05);
    expect(despinFor(1)).toBeLessThan(0.05);
    expect(despinFor(1.52)).toBeLessThan(0.01);
  });

  it("falls off as sharply as the tidal torque it stands for", () => {
    // Sixth power: doubling the distance cuts it by a factor of 64.
    expect(despinFor(2) / despinFor(4)).toBeCloseTo(64, 0);
  });
});

describe("rotation", () => {
  it("leaves an untouched world turning in hours, not days", () => {
    const hours = Array.from({ length: 500 }, (_, i) => rotationHoursFor(`r-${i}`, 5, 0));
    const sorted = hours.slice().sort((a, b) => a - b);
    expect(sorted[250]!).toBeGreaterThan(12);
    expect(sorted[250]!).toBeLessThan(28);
    expect(sorted[25]!).toBeGreaterThan(4);
  });

  it("locks a world tides have finished with to its own year", () => {
    for (const orbit of [0.1, 0.3, 0.45]) {
      expect(rotationHoursFor("r-1", orbit, 1)).toBeCloseTo(orbitalPeriodHours(orbit), 6);
      expect(isTidallyLocked(rotationHoursFor("r-1", orbit, 1), orbit)).toBe(true);
    }
  });

  it("slows a world part way there without locking it", () => {
    const free = rotationHoursFor("r-1", 1, 0);
    const part = rotationHoursFor("r-1", 1, 0.3);
    expect(part).toBeGreaterThan(free);
    expect(isTidallyLocked(part, 1)).toBe(false);
  });

  it("gives Earth's orbit an Earth-like day", () => {
    const hours = rotationHoursFor("Terra", 1, despinFor(1));
    expect(hours).toBeGreaterThan(8);
    expect(hours).toBeLessThan(48);
  });
});

describe("the chain, on rolled worlds", () => {
  const ROLLED = Array.from({ length: 2000 }, (_, i) => {
    const seed = `world-${i}`;
    const uwp = rollUwp(seed);
    return { profile: parseUwp(uwp)!, detail: planetDetail(seed, uwp) };
  });
  const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const share = (test: (r: (typeof ROLLED)[number]) => boolean) =>
    ROLLED.filter(test).length / ROLLED.length;

  it("centres the whole run on something very like Earth", () => {
    expect(median(ROLLED.map((r) => r.detail.orbitAu))).toBeGreaterThan(0.8);
    expect(median(ROLLED.map((r) => r.detail.orbitAu))).toBeLessThan(1.3);
    expect(median(ROLLED.map((r) => r.detail.meanTempK))).toBeGreaterThan(275);
    expect(median(ROLLED.map((r) => r.detail.meanTempK))).toBeLessThan(300);
    expect(median(ROLLED.map((r) => r.detail.rotationHours))).toBeGreaterThan(14);
    expect(median(ROLLED.map((r) => r.detail.rotationHours))).toBeLessThan(30);
  });

  it("keeps every world's water liquid where the profile says it has some", () => {
    for (const { profile, detail } of ROLLED) {
      if (profile.hydrographics < 1 || profile.atmosphere < 2) continue;
      if (profile.atmosphere >= 10 && profile.atmosphere <= 12) continue;
      expect(detail.meanTempK).toBeGreaterThan(260);
      expect(detail.meanTempK).toBeLessThan(315);
    }
  });

  it("locks a few worlds and leaves the rest turning", () => {
    const locked = share((r) => isTidallyLocked(r.detail.rotationHours, r.detail.orbitAu));
    expect(locked).toBeGreaterThan(0.02);
    expect(locked).toBeLessThan(0.2);
  });

  it("leaves a locked world upright, since the same tides did both", () => {
    for (const { detail } of ROLLED) {
      if (!isTidallyLocked(detail.rotationHours, detail.orbitAu)) continue;
      expect(detail.axialTiltDeg).toBeLessThan(5);
    }
  });

  it("puts the hot worlds close in or under thick hostile air, not at random", () => {
    for (const { profile, detail } of ROLLED) {
      if (detail.meanTempK < 400) continue;
      const hostile = profile.atmosphere >= 10 && profile.atmosphere <= 12;
      expect(hostile || detail.orbitAu < 1).toBe(true);
    }
  });
});

describe("overrides", () => {
  const profile = parseUwp("A867A69-A")!;
  const base = () => climateFor("Regina", profile, 1, 70);

  it("stands aside when nothing is overruled", () => {
    expect(climateFor("Regina", profile, 1, 70, {})).toEqual(base());
    expect(
      climateFor("Regina", profile, 1, 70, {
        orbitAu: null,
        obliquityDeg: null,
        rotationHours: null,
      }),
    ).toEqual(base());
  });

  it("carries the temperature with an orbit the user has moved", () => {
    const near = climateFor("Regina", profile, 1, 70, { orbitAu: 0.5 });
    const far = climateFor("Regina", profile, 1, 70, { orbitAu: 4 });
    expect(near.orbitAu).toBe(0.5);
    expect(near.meanTempK).toBeGreaterThan(far.meanTempK);
  });

  it("respins a world moved inside the tidal reach", () => {
    const moved = climateFor("Regina", profile, 1, 70, { orbitAu: 0.2 });
    expect(moved.despin).toBe(1);
    expect(isTidallyLocked(moved.rotationHours, moved.orbitAu)).toBe(true);
    expect(moved.obliquityDeg).toBeLessThan(5);
  });

  it("takes a tilt and a rotation outright, and holds them in range", () => {
    const set = climateFor("Regina", profile, 1, 70, { obliquityDeg: 157, rotationHours: 400 });
    expect(set.obliquityDeg).toBe(157);
    expect(set.rotationHours).toBe(400);
    expect(climateFor("Regina", profile, 1, 70, { obliquityDeg: 400 }).obliquityDeg).toBe(180);
    expect(climateFor("Regina", profile, 1, 70, { obliquityDeg: -5 }).obliquityDeg).toBe(0);
    expect(climateFor("Regina", profile, 1, 70, { orbitAu: 1e6 }).orbitAu).toBe(50);
  });
});
