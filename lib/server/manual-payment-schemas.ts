import {z} from "zod";

/** One business input contract for browser and delegated MCP. Consent,
 * however, is an MCP transport control and never persisted as payment data.
 */
export const manualPaymentSchema=z.object({
 amountCents:z.number().int().positive().nullable().optional(),
 note:z.string().max(500).optional(),
 idempotencyKey:z.string().uuid().optional(),
}).strict();

export const manualPaymentMcpSchema=manualPaymentSchema.extend({
 idempotencyKey:z.string().uuid(),confirmed:z.literal(true),
}).strict();
