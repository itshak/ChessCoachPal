import {z} from "zod";

export const contactUuid = z.string().uuid();
const name = z.string().trim().min(1).max(160);
const optionalEmail = z.string().trim().email().max(320).nullable();
const optionalPhone = z.string().trim().min(1).max(80).nullable();
const locale = z.enum(["en","he","ru"]).nullable();

export const contactFields = z.object({
  displayName:name,
  kind:z.enum(["person","organization"]),
  email:optionalEmail,
  phone:optionalPhone,
  preferredLocale:locale,
  status:z.enum(["active","archived"]),
}).strict();
export const contactCreateSchema = contactFields.pick({
  displayName:true,
}).extend({
  kind:z.enum(["person","organization"]).default("person"),
  email:optionalEmail.optional(),
  phone:optionalPhone.optional(),
  preferredLocale:locale.optional(),
  idempotencyKey:contactUuid,
}).strict();
export const contactUpdateSchema = contactFields.partial().extend({
  expectedRevision:z.number().int().min(1),
  idempotencyKey:contactUuid,
}).strict().refine(value=>Object.keys(value).some(k=>!["expectedRevision","idempotencyKey"].includes(k)),
  "At least one contact field must change");

export const studentContactLinkSchema = z.object({
  contactId:contactUuid,
  relationshipLabel:z.string().trim().min(1).max(80),
  isLegalGuardian:z.boolean().default(false),
  mayReceiveMessages:z.boolean().default(false),
  emergencyPriority:z.number().int().min(1).max(20).nullable().optional(),
  activeFrom:z.iso.date().nullable().optional(),
  idempotencyKey:contactUuid,
}).strict();
export const studentContactUnlinkSchema = z.object({
  expectedRevision:z.number().int().min(1),
  idempotencyKey:contactUuid,
}).strict();

export const billingAccountFields = z.object({
  displayName:name,
  accountKind:z.enum(["person","organization"]),
  contactId:contactUuid.nullable(),
  status:z.enum(["active","archived"]),
}).strict();
export const billingAccountCreateSchema = billingAccountFields.pick({
  displayName:true,
}).extend({
  accountKind:z.enum(["person","organization"]).default("person"),
  contactId:contactUuid.nullable().optional(),
  idempotencyKey:contactUuid,
}).strict();
export const billingAccountUpdateSchema = billingAccountFields.partial().extend({
  expectedRevision:z.number().int().min(1),
  idempotencyKey:contactUuid,
}).strict().refine(value=>Object.keys(value).some(k=>!["expectedRevision","idempotencyKey"].includes(k)),
  "At least one billing account field must change");
