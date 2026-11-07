import { z } from "zod";
import { NextResponse } from "next/server";

/**
 * Zod schemas for the highest-traffic mutation routes. Unknown fields are
 * stripped; sizes are bounded so unvalidated JSON can't land in the DB.
 * Optional fields mirror the partial-update behavior of the routes
 * (supabase-js drops undefined values from updates).
 */

export function parseBody<S extends z.ZodType>(
  schema: S,
  raw: unknown
): { ok: true; data: z.infer<S> } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const issue = result.error.issues[0];
  const message = issue
    ? `${issue.path.join(".") || "body"}: ${issue.message}`
    : "Invalid request body";
  return {
    ok: false,
    response: NextResponse.json({ error: message }, { status: 400 }),
  };
}

const trimmedName = z.string().trim().min(1, "Name is required").max(200);
const optionalText = (max: number) => z.string().max(max).nullable().optional();
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");
/** UI clears dates by sending "" or null. */
const optionalDate = z.union([dateString, z.literal(""), z.null()]).optional();
const optionalUuid = z.union([z.uuid(), z.literal(""), z.null()]).optional();

// ── Students ────────────────────────────────────────────────────────────────

export const studentCreateSchema = z.object({
  name: trimmedName,
  birthdate: optionalDate,
  level: optionalText(120),
  teacherNotes: optionalText(50_000),
  guardianId: optionalUuid,
  contactEmail: optionalText(254),
  contactPhone: optionalText(50),
  contactName: optionalText(200),
  adultSelf: z.boolean().optional(),
});

export const studentUpdateSchema = z.object({
  name: trimmedName.optional(),
  parentContact: optionalText(500),
  guardianId: optionalUuid,
  level: optionalText(120),
  birthdate: optionalDate,
  practiceStartDate: optionalDate,
  defaultRateCents: z
    .union([z.number().min(0).max(10_000_000), z.string().max(20), z.null()])
    .optional(),
  travelFeeCents: z
    .union([z.number().min(0).max(10_000_000), z.string().max(20), z.null()])
    .optional(),
  archived: z.boolean().optional(),
});

// ── Families / guardians ────────────────────────────────────────────────────

const emailRecipients = z
  .enum(["primary", "secondary", "both"])
  .optional()
  .catch(undefined);

const newStudentsList = z
  .array(
    z.object({
      name: z.string().max(200),
      birthdate: optionalDate,
    })
  )
  .max(50)
  .optional();

export const guardianCreateSchema = z.object({
  name: trimmedName,
  familyName: optionalText(200),
  email: optionalText(254),
  phone: optionalText(50),
  secondaryName: optionalText(200),
  secondaryEmail: optionalText(254),
  secondaryPhone: optionalText(50),
  emailRecipients,
  studentIds: z.array(z.uuid()).max(200).optional(),
  newStudents: newStudentsList,
});

export const guardianUpdateSchema = guardianCreateSchema.partial();

// ── Prepaid credits ─────────────────────────────────────────────────────────
// Value rules (ranges, expiry after start) live in lib/credits.ts.

export const creditPackageCreateSchema = z.object({
  studentId: z.guid(),
  credits: z.number().int(),
  durationMinutes: z.number().int(),
  priceCents: z.number().int(),
  startsOn: dateString.optional(),
  expiresOn: optionalDate,
});

export const creditPackageUpdateSchema = z.object({
  expiresOn: z.union([dateString, z.literal(""), z.null()]),
});
