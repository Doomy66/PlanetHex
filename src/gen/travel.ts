/**
 * Getting about inside a system. SystemSpec 4.9.
 *
 * A referee's most common question about a system is not what is in it but how
 * long it takes to cross, and the answer is arithmetic nobody wants to do at the
 * table: a manoeuvre drive is a constant acceleration, so a crossing is the
 * schoolbook problem and the numbers are wildly unintuitive. Ten hours to the
 * gas giant and three weeks to the outer belt is the difference between an
 * adventure and a different adventure.
 */

import { AU_KM } from "./jump";

/** A gravity, in metres per second squared. */
const GEE = 9.80665;

/**
 * How long a ship takes to cross a distance and arrive stopped, in hours.
 *
 * Half the way accelerating and half of it decelerating, which is how a ship
 * with a constant-thrust drive actually travels and where the flip at the
 * midpoint comes from. Twice the square root of distance over acceleration.
 */
export function hoursToStop(km: number, gees: number): number {
  if (km <= 0 || gees <= 0) return 0;
  const seconds = 2 * Math.sqrt((km * 1000) / (gees * GEE));
  return seconds / 3600;
}

/**
 * How long a ship takes to reach a distance still under power, in hours.
 *
 * Burning the whole way and arriving fast. Worth having beside the other
 * because it is the figure that matters when the point is to be somewhere
 * rather than to stop there - clearing a jump shadow, or passing a world
 * without visiting it.
 */
export function hoursStraight(km: number, gees: number): number {
  if (km <= 0 || gees <= 0) return 0;
  const seconds = Math.sqrt((2 * km * 1000) / (gees * GEE));
  return seconds / 3600;
}

/** A crossing time in the unit that suits its length. */
export function travelLabel(hours: number): string {
  if (hours < 1 / 60) return "moments";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  if (hours < 24 * 90) return `${(hours / 24).toFixed(1)} days`;
  return `${(hours / 24 / 365.25).toFixed(1)} years`;
}

/** Both figures for one crossing, as the panel writes them. SystemSpec 4.9.2. */
export function crossing(km: number, gees: number): string {
  return `${travelLabel(hoursToStop(km, gees))} (${travelLabel(hoursStraight(km, gees))})`;
}

/** A distance in AU as kilometres, which is what the arithmetic above wants. */
export function auToKm(au: number): number {
  return au * AU_KM;
}

/** A mass with a jump shadow round it, placed in the plane. In kilometres. */
export interface ShadowBody {
  readonly x: number;
  readonly y: number;
  /** How far its shadow reaches from its centre. */
  readonly shadowKm: number;
}

/** How many headings the search of 4.9.3.2 tries before settling on one. */
const HEADINGS = 180;

/**
 * How far a ship has to run to be clear of every jump shadow it is inside.
 * SystemSpec 4.9.3.
 *
 * There is always one to leave. A ship sitting at a world is inside that
 * world's shadow by definition, and around a dim star it is usually inside the
 * star's as well; the question is never whether but how far.
 *
 * The shortest run, not the run outwards. A ship leaving wants the jump point
 * it can reach soonest, and which way that lies depends on what it is in: from
 * a world inside its star's shadow it is straight out, from a world outside it
 * is any way at all, and from a world caught in a gas giant's it is off to one
 * side. Rather than assume, the directions are tried.
 *
 * Only the shadows the ship is actually in count. One it is outside is one it
 * has already cleared, and a shadow that happens to lie across one heading is a
 * reason to pick another heading rather than a distance to add on.
 */
export function clearOfShadows(
  bodies: readonly ShadowBody[],
  from: { x: number; y: number },
): number {
  // Only what the ship is inside. Everything else is already behind it.
  const holding = bodies.filter((body) => {
    const px = from.x - body.x;
    const py = from.y - body.y;
    return px * px + py * py < body.shadowKm * body.shadowKm;
  });
  if (holding.length === 0) return 0;

  let best = Infinity;
  for (let turn = 0; turn < HEADINGS; turn++) {
    const angle = (turn / HEADINGS) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let far = 0;
    for (const body of holding) {
      const px = from.x - body.x;
      const py = from.y - body.y;
      const along = px * dx + py * dy;
      const inside = px * px + py * py - body.shadowKm * body.shadowKm;
      // t^2 + 2(along)t + inside = 0, and inside is negative in a shadow, so the
      // root is always real and always ahead.
      const exit = -along + Math.sqrt(along * along - inside);
      if (exit > far) far = exit;
    }
    if (far < best) best = far;
  }
  return best;
}
