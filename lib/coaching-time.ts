/** Resolve a wall-clock time in a workplace IANA timezone to one unique UTC instant.
 * Reject DST gaps and folds rather than silently changing the requested lesson time.
 * The input format is exactly YYYY-MM-DDTHH:mm from datetime-local.
 */
export function workplaceLocalToUtc(local: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error("Enter a valid local date and time");
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute);
  const checked = new Date(wallUtc);
  if (checked.getUTCFullYear() !== year || checked.getUTCMonth() !== month - 1 ||
      checked.getUTCDate() !== day || checked.getUTCHours() !== hour ||
      checked.getUTCMinutes() !== minute) throw new Error("Invalid calendar date or time");
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
  } catch { throw new Error("Invalid workplace timezone"); }
  function parts(ms: number): number[] {
    const p = formatter.formatToParts(ms);
    return ["year", "month", "day", "hour", "minute"].map(
      key => Number(p.find(v => v.type === key)?.value)
    );
  }
  const choices = new Set<number>();
  // Timezone offsets are within +/- 18h. Sampling every hour handles DST jumps.
  for (let shift = -18; shift <= 18; shift++) {
    const sample = wallUtc + shift * 3_600_000;
    const [y, m, d, h, min] = parts(sample);
    const offset = Date.UTC(y, m - 1, d, h, min) - sample;
    const candidate = wallUtc - offset;
    const values = parts(candidate);
    if (values.every((value, i) => value === [year, month, day, hour, minute][i])) {
      choices.add(candidate);
    }
  }
  if (choices.size === 0) throw new Error("This local time does not exist in the workplace timezone");
  if (choices.size > 1) throw new Error("This local time occurs twice; choose an unambiguous time");
  return new Date([...choices][0]).toISOString();
}

/** Populate a datetime-local input in the selected workplace timezone. */
export function utcToWorkplaceLocal(utc: string, timezone: string): string {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const p = format.formatToParts(new Date(utc));
  const at = (key: string) => p.find(v => v.type === key)!.value;
  return `${at("year")}-${at("month")}-${at("day")}T${at("hour")}:${at("minute")}`;
}
