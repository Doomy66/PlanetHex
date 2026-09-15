import { describe, expect, it } from "vitest";
import { auToKm, clearOfShadows, hoursStraight, hoursToStop, travelLabel } from "./travel";
import { jumpShadowKm } from "./jump";
import { generateSystem, positionAu, starShadowAu } from "./system";

describe("crossing a system", () => {
  it("takes five and a half hours to cross a million kilometres at one gravity", () => {
    // The figure worth knowing by heart, and the one every other answer here is
    // a multiple of: five and a half hours arriving stopped, four burning
    // through.
    expect(hoursToStop(1e6, 1)).toBeCloseTo(5.61, 1);
    expect(hoursStraight(1e6, 1)).toBeCloseTo(3.97, 1);
  });

  it("arrives sooner burning the whole way than stopping at the far end", () => {
    // SystemSpec 4.9.2: the bracketed figure is always the smaller one, by the
    // square root of two, because half the run is spent slowing down.
    for (const km of [1e5, 1e6, 1e8, 3e9]) {
      expect(hoursStraight(km, 1)).toBeLessThan(hoursToStop(km, 1));
      expect(hoursToStop(km, 1) / hoursStraight(km, 1)).toBeCloseTo(Math.SQRT2, 6);
    }
  });

  it("halves the time for four times the acceleration", () => {
    // Distance goes as the square of time, so time goes as the square root of
    // the thrust: a 4G ship is twice as fast as a 1G one, not four times.
    expect(hoursToStop(1e8, 4)).toBeCloseTo(hoursToStop(1e8, 1) / 2, 6);
  });

  it("says nothing takes any time where there is no distance or no thrust", () => {
    expect(hoursToStop(0, 1)).toBe(0);
    expect(hoursToStop(1e6, 0)).toBe(0);
  });

  it("says it in the unit that suits the length", () => {
    expect(travelLabel(0.25)).toContain("min");
    expect(travelLabel(6)).toContain("h");
    expect(travelLabel(100)).toContain("days");
    expect(travelLabel(24 * 400)).toContain("years");
  });
});

describe("getting clear of the shadows", () => {
  const star = (shadowAu: number) => ({ x: 0, y: 0, shadowKm: auToKm(shadowAu) });

  it("always has something to leave, because the ship is at a world", () => {
    // SystemSpec 4.9.3. A ship sitting at a world is inside that world's own
    // shadow by definition.
    const world = { x: auToKm(5), y: 0, shadowKm: jumpShadowKm(12742) };
    const clear = clearOfShadows([star(0.5), world], { x: world.x, y: 0 });
    expect(clear).toBeCloseTo(jumpShadowKm(12742), 0);
  });

  it("takes the star's edge where the world is inside it", () => {
    // A world at 0.2 AU under a star whose shadow reaches 0.9 has to run the
    // difference, which is far further than its own shadow.
    const at = { x: auToKm(0.2), y: 0 };
    const world = { ...at, shadowKm: jumpShadowKm(12742) };
    const clear = clearOfShadows([star(0.9), world], at);
    expect(clear).toBeCloseTo(auToKm(0.7), -3);
  });

  it("counts a shadow the ship is not in as no distance at all", () => {
    const at = { x: auToKm(30), y: 0 };
    const far = { x: auToKm(1), y: 0, shadowKm: jumpShadowKm(140000) };
    expect(clearOfShadows([star(0.9), far], at)).toBe(0);
  });

  it("leaves a real system from a real world", () => {
    // Every system, from its main world: there is always a run to make, and it
    // is never longer than the system is wide.
    for (let i = 0; i < 40; i++) {
      const system = generateSystem(`travel-${i}`);
      const main = system.mainWorld.orbitIndex;
      const at = positionAu(system, main);
      const bodies = [
        star(starShadowAu(system)),
        { x: auToKm(at.x), y: auToKm(at.y), shadowKm: jumpShadowKm(12742) },
      ];
      const clear = clearOfShadows(bodies, { x: auToKm(at.x), y: auToKm(at.y) });
      expect(clear, system.seed).toBeGreaterThan(0);
      expect(clear, system.seed).toBeLessThan(auToKm(starShadowAu(system) + 1));
    }
  });
});
