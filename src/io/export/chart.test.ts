import { describe, expect, it } from "vitest";
import { generateSubsector } from "../../gen/subsector";
import {
  chartSvg,
  subsectorCsv,
  subsectorSheetHtml,
  subsectorSheetMarkdown,
} from "./chart";

const chart = generateSubsector("REGINA42", "C", "standard");

describe("the chart as a picture", () => {
  it("is SVG that stands on its own", () => {
    // SubSectorSpec 6.2: a file that needed the application's stylesheet would
    // be a file nobody can open.
    const svg = chartSvg(chart, "Spinward Marches");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain("<style>");
    expect(svg).toContain("</svg>");
    expect(svg).not.toContain("class=\"chart-");
  });

  it("frames the whole subsector rather than what was on screen", () => {
    // Eighty hexes, every one of them, whatever the panel was showing.
    const svg = chartSvg(chart);
    for (const world of chart.worlds) expect(svg).toContain(world.at);
    expect(svg.match(/class="cell"/g)).toHaveLength(80);
  });

  it("says what it is, for the download folder six months later", () => {
    expect(chartSvg(chart, "Spinward Marches")).toContain("Subsector C of Spinward Marches");
    expect(chartSvg(chart)).toContain("seed REGINA42");
  });

  it("draws every world, its name and its port", () => {
    const svg = chartSvg(chart);
    for (const world of chart.worlds) {
      const loud = world.profile.population >= 9;
      expect(svg).toContain(loud ? world.name.toUpperCase() : world.name);
    }
  });

  it("leaves the Mains out when they are not wanted", () => {
    // The rule stays in the stylesheet either way; what goes is the group.
    expect(chartSvg(chart, "", false)).not.toContain('<g class="main-0">');
    if (chart.mains.length > 0) {
      expect(chartSvg(chart, "", true)).toContain('<g class="main-0">');
    }
  });

  it("escapes a name that would otherwise break the file", () => {
    const awkward = {
      ...chart,
      worlds: [{ ...chart.worlds[0]!, name: 'Ko"tal & <Sons>' }],
    };
    const svg = chartSvg(awkward);
    expect(svg).toContain("Ko&quot;tal &amp; &lt;Sons&gt;");
    expect(svg).not.toContain("<Sons>");
  });
});

describe("the chart as a table", () => {
  const csv = subsectorCsv(chart);
  const lines = csv.trim().split("\r\n");

  it("has a header and a row per world", () => {
    expect(lines).toHaveLength(chart.worlds.length + 1);
    expect(lines[0]).toContain("hex,name,uwp,starport");
  });

  it("puts every derived figure in its own column", () => {
    // SubSectorSpec 6.3: the sector file packs seven digits into one field
    // because a map reads it; a spreadsheet wants to sort on the population.
    const world = chart.worlds[0]!;
    const row = lines[1]!.split(",");
    expect(row[0]).toBe(world.at);
    expect(row[2]).toBe(world.uwp);
    expect(row[7]).toBe(String(world.profile.population));
    expect(row[10]).toBe(String(world.profile.tech));
  });

  it("ends every line the way the format asks", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("quotes a field that would otherwise be misread", () => {
    const awkward = { ...chart, worlds: [{ ...chart.worlds[0]!, name: 'Ko"tal, of the Reach' }] };
    expect(subsectorCsv(awkward)).toContain('"Ko""tal, of the Reach"');
  });
});

describe("the chart as a document", () => {
  it("writes the worlds up to be read", () => {
    // SubSectorSpec 6.4: a referee reads this at the table, and the sector file
    // is for the software.
    const sheet = subsectorSheetMarkdown(chart, "Spinward Marches");
    expect(sheet).toMatch(/^# Subsector C of Spinward Marches/);
    expect(sheet).toContain("## The worlds");
    for (const world of chart.worlds) expect(sheet).toContain(`### ${world.name} — ${world.at}`);
  });

  it("carries the Mains and the X-boat network", () => {
    const sheet = subsectorSheetMarkdown(chart);
    if (chart.mains.length > 0) {
      expect(sheet).toContain("## Mains");
      expect(sheet).toContain(`The ${chart.mains[0]!.name} Main`);
    }
    if (chart.routes.some((route) => route.kind === "xboat")) {
      expect(sheet).toContain("## The X-boat network");
    }
  });

  it("takes the referee's notes where there are any", () => {
    const at = chart.worlds[0]!.at;
    const sheet = subsectorSheetMarkdown(chart, "", (hex) =>
      hex === at ? "Pirates work the belt." : "",
    );
    expect(sheet).toContain("Pirates work the belt.");
  });

  it("carries its own styling as HTML, for printing and handing over", () => {
    const html = subsectorSheetHtml(chart, "Spinward Marches");
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<style>");
    expect(html).toContain("<h1>Subsector C of Spinward Marches</h1>");
    expect(html.endsWith("\n")).toBe(true);
  });

  it("escapes what a referee wrote rather than letting it be markup", () => {
    const html = subsectorSheetHtml(chart, "", () => "<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("says the same things in both forms", () => {
    const md = subsectorSheetMarkdown(chart, "Vland");
    const html = subsectorSheetHtml(chart, "Vland");
    for (const world of chart.worlds.slice(0, 5)) {
      expect(md).toContain(world.uwp);
      expect(html).toContain(world.uwp);
    }
  });
});
