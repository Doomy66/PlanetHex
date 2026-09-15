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

/**
 * How far a ship has to run to be clear of every jump shadow in the system.
 * SystemSpec 4.9.3.
 *
 * There is always one to leave. A ship sitting at a world is inside that
 * world's shadow by definition, and around a dim star it is usually inside the
 * star's as well; the question is never whether but how far.
 *
 * Measured straight out from the star, which is the way out of the system and
 * the way out of the star's shadow at once. Not the shortest escape from a
 * world's own shadow taken alone - that would be straight up out of the plane -
 * but a ship leaving is leaving, and the figure a referee wants is the run to
 * the jump point rather than the shortest hop to technically legal space.
 */
export function clearOfShadows(
  bodies: readonly ShadowBody[],
  from: { x: number; y: number },
): number {
  // Outward from the star. A ship sitting on the star itself has no outward, so
  // any direction will do.
  const out = Math.hypot(from.x, from.y);
  const dx = out === 0 ? 1 : from.x / out;
  const dy = out === 0 ? 0 : from.y / out;

  let far = 0;
  for (const body of bodies) {
    // Where along the outward run this body's shadow ends, if the ship is in it.
    const px = from.x - body.x;
    const py = from.y - body.y;
    const along = px * dx + py * dy;
    const inside = px * px + py * py - body.shadowKm * body.shadowKm;
    // t^2 + 2(along)t + inside = 0, and the ship is in the shadow when inside < 0.
    const under = along * along - inside;
    if (under < 0) continue;
    const exit = -along + Math.sqrt(under);
    if (exit > far) far = exit;
  }
  return far;
}
