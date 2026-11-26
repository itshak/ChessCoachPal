import "server-only";

type Provider = "lichess" | "chesscom";
export type RatingCooldown =
  | { kind: "until"; retryAt: number }
  | { kind: "operator_hold" };

const MINIMUM_SECONDS = 60;
const MAX_AUTOMATIC_SECONDS = 86_400;
const HTTP_DATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/;
const hold = (): RatingCooldown => ({ kind: "operator_hold" });

/** Only consume this internal hint through a reviewed shared provider authority.
 * The fixed minimum is conservative; it is not a provider capacity promise.
 * Never return the header or silently shorten a valid, longer upstream wait. */
export function onlineRatingCooldown(
  provider: Provider, retryAfter: string | null, now: number,
): RatingCooldown {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000 - MAX_AUTOMATIC_SECONDS * 1_000) {
    return hold();
  }

  let seconds = provider === "lichess" ? MINIMUM_SECONDS : 2 * MINIMUM_SECONDS;
  const value = retryAfter?.trim();
  if (value && /^\d+$/.test(value)) {
    const digits = value.replace(/^0+(?=\d)/, "");
    if (digits.length > 5) return hold();
    const delta = Number(digits);
    if (delta > MAX_AUTOMATIC_SECONDS) return hold();
    seconds = Math.max(MINIMUM_SECONDS, delta);
  } else if (value && HTTP_DATE.test(value)) {
    const until = Date.parse(value);
    if (Number.isFinite(until) && new Date(until).toUTCString() === value) {
      const delta = Math.ceil((until - now) / 1_000);
      if (delta > MAX_AUTOMATIC_SECONDS) return hold();
      seconds = Math.max(MINIMUM_SECONDS, delta);
    }
  }
  return { kind: "until", retryAt: now + seconds * 1_000 };
}
