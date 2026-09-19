import { describe, expect, it } from "vitest";
import {
  DAYS_IN_YEAR,
  dateOrEpoch,
  dayFromEpoch,
  EPOCH,
  formatImperialDate,
  parseImperialDate,
} from "./traveller";

describe("imperial dates", () => {
  it("reads a day and a year", () => {
    expect(parseImperialDate("001-1105")).toEqual({ day: 1, year: 1105 });
    expect(parseImperialDate("365-1105")).toEqual({ day: 365, year: 1105 });
    expect(parseImperialDate("183-0999")).toEqual({ day: 183, year: 999 });
  });

  it("allows spaces round it and a short day", () => {
    expect(parseImperialDate(" 1-1105 ")).toEqual({ day: 1, year: 1105 });
    expect(parseImperialDate("42-1105")).toEqual({ day: 42, year: 1105 });
  });

  it("refuses a day that is not one", () => {
    // 000 and 366 are the two the format lets you type and the calendar does
    // not have. There is no leap day to make an exception for.
    expect(parseImperialDate("000-1105")).toBeNull();
    expect(parseImperialDate("366-1105")).toBeNull();
    expect(parseImperialDate("1105")).toBeNull();
    expect(parseImperialDate("001/1105")).toBeNull();
    expect(parseImperialDate("")).toBeNull();
  });

  it("writes itself back the canonical way", () => {
    expect(formatImperialDate({ day: 1, year: 1105 })).toBe("001-1105");
    expect(formatImperialDate({ day: 42, year: 999 })).toBe("042-0999");
    for (const text of ["001-1105", "365-1105", "183-0999"]) {
      expect(formatImperialDate(parseImperialDate(text)!)).toBe(text);
    }
  });

  it("counts days from the epoch, forwards and back", () => {
    expect(dayFromEpoch(EPOCH)).toBe(0);
    expect(dayFromEpoch({ day: 2, year: 1105 })).toBe(1);
    expect(dayFromEpoch({ day: 1, year: 1106 })).toBe(DAYS_IN_YEAR);
    expect(dayFromEpoch({ day: 365, year: 1105 })).toBe(364);
    expect(dayFromEpoch({ day: 1, year: 1104 })).toBe(-DAYS_IN_YEAR);
  });

  it("reads a missing or unreadable date as the epoch", () => {
    // The whole of what a save written before dates existed needs from this.
    expect(dateOrEpoch(undefined)).toEqual(EPOCH);
    expect(dateOrEpoch("")).toEqual(EPOCH);
    expect(dateOrEpoch("not a date")).toEqual(EPOCH);
    expect(dateOrEpoch("200-1120")).toEqual({ day: 200, year: 1120 });
  });
});
