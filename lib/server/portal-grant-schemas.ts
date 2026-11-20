import {z} from "zod";

const uuid=z.string().uuid();
export const portalGrantPermission=z.enum([
  "calendar","cancel","shared_notes","event_rsvp","finance",
]);
export type PortalGrantPermission=z.infer<typeof portalGrantPermission>;
export const portalGrantPermissions=z.array(portalGrantPermission).min(1).max(5)
  .refine(values=>new Set(values).size===values.length,"Repeated permissions are not valid");

/**
 * One explicit grant is for one contact, one student and ONE workplace.
 * Finance is narrower still and needs a separately identified payer account.
 * Neither linked-contact nor payer identity implies a portal right.
 */
export const portalGrantCreateSchema=z.object({
  contactId:uuid,
  studentId:uuid,
  workplaceId:uuid,
  billingAccountId:uuid.nullable().default(null),
  permissions:portalGrantPermissions,
  expiresAt:z.iso.datetime({offset:true}),
  idempotencyKey:uuid,
  confirmed:z.literal(true),
}).strict().superRefine((value,ctx)=>{
  if(value.permissions.includes("finance")!==Boolean(value.billingAccountId))
    ctx.addIssue({code:"custom",path:["billingAccountId"],
      message:"Finance permission requires an exact billing account and unrelated grants cannot include one"});
});
export const portalGrantRevokeSchema=z.object({
  expectedRevision:z.number().int().min(1),
  idempotencyKey:uuid,
  confirmed:z.literal(true),
}).strict();
export const portalGrantIssueSchema=z.object({
  expectedRevision:z.number().int().min(1),
  confirmed:z.literal(true),
}).strict();
