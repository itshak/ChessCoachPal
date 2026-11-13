import {z} from "zod";

/** Shared strict business-data contract for website and delegated MCP.
 * Confirmation is a transport approval, never a persisted invoice field.
 */
export const invoiceDraftEditSchema=z.object({
 notes:z.string().max(2000).optional(),
 expectedUpdatedAt:z.string().datetime({offset:true}).optional(),
 idempotencyKey:z.string().uuid().optional(),
 items:z.array(z.object({
   id:z.string().uuid().optional(),
   sessionId:z.string().uuid().nullable().optional(),
   studentId:z.string().uuid().nullable().optional(),
   description:z.string().trim().min(1).max(500),
   quantity:z.number().int().min(1).max(10000),
   unitCents:z.number().int().min(0).max(100000000),
   amountCents:z.number().int().min(0).max(100000000),
 }).strict().refine(line=>Boolean(line.sessionId)===Boolean(line.studentId),
    "A linked invoice line requires a canonical session and frozen student together")
  ).max(100).optional(),
}).strict().refine(v=>v.notes!==undefined||v.items!==undefined,
 "At least one invoice field must change");
