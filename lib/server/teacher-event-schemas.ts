import {z} from "zod";

/**
 * Shared contract for teacher-owned event fields. Website and MCP must reject
 * the same malformed roster, unknown business fields and invalid date types.
 * A teacher confirmation is an MCP transport concern, not an editable field.
 */
const uuid=z.string().uuid();
export const eventChanges=z.object({
 title:z.string().trim().min(1).max(200).optional(),
 description:z.string().max(10000).optional(),
 location:z.string().max(1000).optional(),
 startsAt:z.string().datetime({offset:true}).optional(),
 endsAt:z.string().datetime({offset:true}).nullable().optional(),
 sendReminder:z.boolean().optional(),
 studentIds:z.array(uuid).max(200).optional(),
 repertoireByStudent:z.record(uuid,z.string().max(10000)).optional(),
 idempotencyKey:uuid.optional(),
}).strict();

export const eventCreateSchema=eventChanges.extend({
 title:z.string().trim().min(1).max(200),
 startsAt:z.string().datetime({offset:true}),
}).strict();
export const eventUpdateSchema=eventChanges.strict();
