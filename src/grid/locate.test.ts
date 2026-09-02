import { describe, expect, it } from "vitest";
import { ICO_FACES, ICO_VERTICES, locate } from "./icosahedron";
import { add, normalise, scale, type Vec3 } from "./vec3";

/** The 3D point at lattice (i, j) of a face, the same way the grid builds it. */
function pointAt(face: number, size: number, i: number, j: number): Vec3 {
  const c = ICO_FACES[face]!.corners.map((v) => ICO_VERTICES[v]!) as [Vec3, Vec3, Vec3];
  const w = [(size - i) / size, (i - j) / size, j / size] as const;
  return normalise(add(add(scale(c[0], w[0]), scale(c[1], w[1])), scale(c[2], w[2])));
}

describe("locate", () => {
  it("puts an interior lattice point back where it came from", () => {
    const size = 16;
    for (let f = 0; f < 20; f++) {
      for (let i = 2; i <= size - 2; i++) {
        for (let j = 1; j < i - 1; j++) {
          const found = locate(pointAt(f, size, i, j), size);
          expect(found.face).toBe(f);
          expect(found.i).toBeCloseTo(i, 9);
          expect(found.j).toBeCloseTo(j, 9);
        }
      }
    }
  });

  it("gives an edge point the same 3D position whichever face claims it", () => {
    const size = 8;
    for (let f = 0; f < 20; f++) {
      for (let i = 0; i <= size; i++) {
        for (const [a, b] of [[i, 0], [i, i], [size, i]] as const) {
          const target = pointAt(f, size, a, b);
          const found = locate(target, size);
          const back = pointAt(found.face, size, Math.round(found.i), Math.round(found.j));
          for (let k = 0; k < 3; k++) expect(back[k]!).toBeCloseTo(target[k]!, 9);
        }
      }
    }
  });

  it("lands every direction on exactly one face", () => {
    for (let n = 0; n < 2000; n++) {
      const t = (n / 2000) * Math.PI * 2;
      const p = normalise([Math.cos(t * 3), Math.sin(t * 7), Math.cos(t * 11 + 1)]);
      const found = locate(p, 16);
      expect(found.face).toBeGreaterThanOrEqual(0);
      expect(found.face).toBeLessThan(20);
      expect(found.i).toBeGreaterThanOrEqual(-1e-9);
      expect(found.j).toBeGreaterThanOrEqual(-1e-9);
      expect(found.j).toBeLessThanOrEqual(found.i + 1e-9);
      expect(found.i).toBeLessThanOrEqual(16 + 1e-9);
    }
  });
});
