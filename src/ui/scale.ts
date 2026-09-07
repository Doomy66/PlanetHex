/**
 * Distance on the surface, and the bar that shows it. Spec 4.6.
 *
 * A hex has a real size once the planet has a diameter, so both map panels can say
 * how far across they are. The bar is drawn inside the SVG in map units, so it
 * scales with the map: resize the panel and the bar keeps its length relative to
 * the hexes rather than drifting away from them.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Angle an icosahedron edge subtends at the centre, in radians. */
export const ICO_EDGE_ANGLE = Math.acos(1 / Math.sqrt(5));

/**
 * Kilometres between neighbouring hex centres, on a lattice of `size` rows per
 * face. A face edge spans a fixed angle, so its length is fixed by the diameter
 * and one step is that divided by the row count.
 */
export function stepKm(diameterKm: number, size: number): number {
  return (ICO_EDGE_ANGLE * (diameterKm / 2)) / size;
}

/** The 1, 2 or 5 times a power of ten nearest below a distance. */
export function niceDistance(km: number): number {
  if (!(km > 0)) return 0;
  const power = 10 ** Math.floor(Math.log10(km));
  for (const step of [5, 2, 1]) if (power * step <= km) return power * step;
  return power;
}

/**
 * A distance where the exact figure matters, so it keeps a decimal where a hex is
 * small. formatDistance rounds, which is right for a bar labelled in round numbers
 * and wrong for a hex that is 2.7km across.
 */
export function formatPrecise(km: number): string {
  if (km >= 100) return `${Math.round(km).toLocaleString("en-GB")} km`;
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${km.toFixed(2)} km`;
}

export function formatDistance(km: number): string {
  if (km >= 1000) return `${Math.round(km / 1000).toLocaleString("en-GB")},000 km`;
  if (km >= 1) return `${Math.round(km).toLocaleString("en-GB")} km`;
  return `${km.toFixed(1)} km`;
}

export interface ScaleBarOptions {
  /** Kilometres one unit of the SVG coordinate system covers. */
  readonly kmPerUnit: number;
  /** Width of the drawing, so the bar can be sized against it. */
  readonly width: number;
  readonly left: number;
  readonly bottom: number;
  /** Across one hex as this panel draws it, in km. Omitted if not known. */
  readonly hexKm?: number;
  /** A further scale of the panel's own, such as the contour interval of 4.5.8. */
  readonly note?: string;
  /** Label size, as a multiple of the default. The flat map wants it smaller. */
  readonly fontScale?: number;
  /** Gap from the left edge, as a fraction of the width. Both panels sit on it. */
  readonly inset?: number;
}

/** A bar and its label, as a group ready to append to an SVG. */
export function scaleBar(options: ScaleBarOptions): SVGGElement {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "scalebar");

  // A bar about a quarter of the drawing wide, rounded down to a readable figure.
  const km = niceDistance(options.width * 0.25 * options.kmPerUnit);
  const length = km / options.kmPerUnit;
  if (!(length > 0) || !Number.isFinite(length)) return group;

  const tick = options.width * 0.012;
  const x = options.left + options.width * (options.inset ?? 0.04);
  const y = options.bottom - tick * 1.6;

  const line = document.createElementNS(SVG_NS, "path");
  line.setAttribute(
    "d",
    `M${x} ${y - tick} V${y} H${x + length} V${y - tick} M${x} ${y} H${x + length}`,
  );
  group.append(line);

  // The labels stack above the bar. The bar's own figure goes nearest to it, the
  // hex size above that, and a panel's further scale above again, where there is
  // room in every panel's viewBox.
  const fontSize = options.width * 0.028 * (options.fontScale ?? 1);
  const text = (content: string, above: number, faint: boolean) => {
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(y - tick * 1.4 - fontSize * above));
    label.setAttribute("font-size", String(fontSize));
    if (faint) label.setAttribute("class", "scalebar-hex");
    label.textContent = content;
    return label;
  };
  group.append(text(formatDistance(km), 0, false));
  if (options.hexKm !== undefined && options.hexKm > 0) {
    group.append(text(`1 hex = ${formatPrecise(options.hexKm)}`, 1.15, true));
  }
  if (options.note !== undefined && options.note !== "") {
    group.append(text(options.note, 2.3, true));
  }
  return group;
}
