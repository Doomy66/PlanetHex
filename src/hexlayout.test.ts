import { describe, expect, it } from "vitest";
import { LOUD_FROM, nameAsDrawn } from "./hexlayout";

describe("a world's name as a map writes it", () => {
  it("shouts a world of a billion people and more", () => {
    // The convention every Traveller map uses, and the reason the two map
    // levels share this rather than each deciding for itself.
    expect(nameAsDrawn("Regina", 9)).toBe("REGINA");
    expect(nameAsDrawn("Regina", 12)).toBe("REGINA");
    expect(nameAsDrawn("Yal Vri", LOUD_FROM)).toBe("YAL VRI");
  });

  it("leaves a smaller world as it was written", () => {
    expect(nameAsDrawn("Regina", 8)).toBe("Regina");
    expect(nameAsDrawn("Kemp's Camp", 0)).toBe("Kemp's Camp");
  });

  it("changes the label and not the name", () => {
    // Presentation only: uppercasing what is stored would lose the real
    // capitalisation of a name like this for good.
    const held = "Kemp's Camp";
    nameAsDrawn(held, 12);
    expect(held).toBe("Kemp's Camp");
  });
});
