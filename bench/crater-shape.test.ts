import { describe, expect, it } from "vitest";
import { locate } from "../src/grid/icosahedron";
import { buildCraterField, DEFAULT_CRATER_OPTIONS } from "../src/gen/crater";
import type { Vec3 } from "../src/grid/vec3";

/** What the crater layer alone looks like, with no terrain under it. */

const SEED = "BENCH01";
const SIZE = 96;

function offsetAtDirection(
  craters: ReturnType<typeof buildCraterField>,
  p: Vec3,
): number {
  const found = locate(p, SIZE);
  return craters.offsetAt(found.face, SIZE, found.i, found.j);
}

describe.runIf(process.env["BENCH"])("crater shape", () => {
  it("draws round holes with raised rims", () => {
    const craters = buildCraterField(SEED, { ...DEFAULT_CRATER_OPTIONS, count: 400 });
    const ramp = " .:-=+*#%@";
    const cols = 150;
    const linesOut: string[] = [];
    let low = 0;
    let high = 0;
    const values: number[][] = [];
    for (let row = 0; row < 50; row++) {
      const lat = Math.PI / 2 - (Math.PI * (row + 0.5)) / 50;
      const line: number[] = [];
      for (let col = 0; col < cols; col++) {
        const lon = (2 * Math.PI * (col + 0.5)) / cols;
        const c = Math.cos(lat);
        const v = offsetAtDirection(craters, [c * Math.cos(lon), Math.sin(lat), c * Math.sin(lon)]);
        line.push(v);
        low = Math.min(low, v);
        high = Math.max(high, v);
      }
      values.push(line);
    }
    for (const line of values) {
      linesOut.push(
        line
          .map((v) => {
            const t = (v - low) / (high - low || 1);
            return ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))]!;
          })
          .join(""),
      );
    }
    console.log(`\ncrater offsets from ${low.toFixed(3)} to ${high.toFixed(3)}\n${linesOut.join("\n")}`);
    expect(low).toBeLessThan(0);
    expect(high).toBeGreaterThan(0);
  }, 120000);

  it("has a bowl that deepens to the middle and a rim that stands proud", () => {
    // One crater, read along a line through its centre.
    const craters = buildCraterField(SEED, { ...DEFAULT_CRATER_OPTIONS, count: 1 });
    const crater = craters.craters[0]!;
    const c = crater.centre;
    // Any direction at right angles to the centre walks a great circle through it.
    const up: Vec3 = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const t: Vec3 = [
      up[1] * c[2] - up[2] * c[1],
      up[2] * c[0] - up[0] * c[2],
      up[0] * c[1] - up[1] * c[0],
    ];
    const len = Math.hypot(t[0], t[1], t[2]);
    const profile: string[] = [];
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * crater.radius * 3;
      const p: Vec3 = [
        c[0] * Math.cos(a) + (t[0] / len) * Math.sin(a),
        c[1] * Math.cos(a) + (t[1] / len) * Math.sin(a),
        c[2] * Math.cos(a) + (t[2] / len) * Math.sin(a),
      ];
      profile.push(`${(a / crater.radius).toFixed(2)} ${offsetAtDirection(craters, p).toFixed(4)}`);
    }
    console.log(
      `\none crater, radius ${((crater.radius * 180) / Math.PI).toFixed(2)} deg, depth ${crater.depth.toFixed(3)}` +
        `\nd/r  offset\n${profile.join("\n")}`,
    );
  });
});
