/**
 * First-run teacher onboarding: signup provisioning guards, welcome
 * notification copy, and the short in-app tour.
 */

export function signupEmailRedirectTo(origin: string): string {
  return `${origin.replace(/\/$/, "")}/auth/confirm?next=/dashboard`;
}

export function shouldProvisionTeacherFromSignup(user: {
  identities?: unknown[] | null;
} | null | undefined): boolean {
  // Supabase returns a dummy user with empty identities when the email is
  // already registered (user-enumeration protection). Do not insert a
  // teachers row for that fake id.
  if (!user) return false;
  return Array.isArray(user.identities) && user.identities.length > 0;
}

export function isUniqueViolation(
  error: { code?: string } | null | undefined
): boolean {
  return error?.code === "23505";
}

/** Read a non-empty string from auth user_metadata. */
export function stringFromUserMetadata(
  metadata: unknown,
  key: string
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export const WELCOME_NOTIFICATION = {
  type: "welcome" as const,
  title: "Welcome to ChessCoachPal!",
  body: "Add students, record chess lessons and organize training materials. Optional contacts and business tools are available when needed.",
  href: "/help",
};

export const TOUR_QUERY_PARAM = "tour";
export const TOUR_QUERY_VALUE = "1";
export const TOUR_STORAGE_KEY = "chesscoachpal-onboarding-tour";
export const TOUR_START_EVENT = "chesscoachpal-tour-start";

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** data-tour attribute to spotlight on desktop. */
  target?: string;
  /** Show this module while the step is active (nav spotlight is in the layout). */
  href?: string;
};

export type StoredTourState = {
  active: boolean;
  stepIndex: number;
  restart?: boolean;
};

export const ONBOARDING_TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to ChessCoachPal",
    body: "Your chess coaching workspace. Start with students and lessons, then track materials and homework. Optional business tools are available from More.",
    href: "/dashboard",
  },
  {
    id: "students",
    title: "Students first",
    body: "Add a student by name and record their chess profile. Contacts and guardians are supporting details; they do not define your teaching history. Import existing records from Account settings.",
    target: "students",
    href: "/students",
  },
  {
    id: "learning",
    title: "Training and materials",
    body: "Save games, puzzles, drills and study chapters in one library. Give individual homework and record results and coach feedback separately from skill assessments.",
    target: "learning",
    href: "/learning",
  },
  {
    id: "schedule",
    title: "Calendar",
    body: "Review recurring lesson times, planned sessions, attendance and scheduling. Events and advanced cancellation policies remain accessible from More.",
    target: "schedule",
    href: "/schedule",
  },
  {
    id: "coaching",
    title: "Lessons and groups",
    body: "Manage private and group chess lessons by workplace. Record attendance, teaching notes and what was covered for each student.",
    target: "coaching",
    href: "/coaching",
  },
  {
    id: "reports",
    title: "Teaching reports",
    body: "Read workplace teaching totals and activities. One group session counts its teacher duration once. Business and billing remain available under More.",
    target: "reports",
    href: "/reports",
  },
  {
    id: "account",
    title: "Account settings",
    body: "Manage profile, timezone, notifications, import/export and connected AI tools. You can change dark mode from the account menu.",
    target: "account",
    href: "/account",
  },
];

export function parseStoredTourState(
  raw: string | null | undefined
): StoredTourState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Record<string, unknown>;
    if (rec.active !== true) return null;
    if (
      typeof rec.stepIndex !== "number" ||
      !Number.isInteger(rec.stepIndex) ||
      rec.stepIndex < 0 ||
      rec.stepIndex >= ONBOARDING_TOUR_STEPS.length
    ) {
      return null;
    }
    return {
      active: true,
      stepIndex: rec.stepIndex,
      restart: rec.restart === true,
    };
  } catch {
    return null;
  }
}

export function searchHasTourQuery(search: string): boolean {
  const normalized = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(normalized).get(TOUR_QUERY_PARAM) === TOUR_QUERY_VALUE;
}

export function pathWithoutTourQuery(pathname: string, search: string): string {
  const normalized = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(normalized);
  params.delete(TOUR_QUERY_PARAM);
  const next = params.toString();
  return next ? `${pathname}?${next}` : pathname;
}
