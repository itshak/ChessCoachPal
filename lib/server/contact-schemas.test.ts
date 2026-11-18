import {describe,it,expect} from "vitest";
import {
  contactCreateSchema,contactUpdateSchema,studentContactLinkSchema,
  studentContactUnlinkSchema,billingAccountCreateSchema,billingAccountUpdateSchema,
} from "./contact-schemas";
import {safeContact,safeBillingAccount,safeContactLink} from "./teacher-contacts-service";

const key="11111111-1111-4111-8111-111111111111";

describe("contact and billing identity boundaries",()=>{
  it("accepts contact-less adult and multiple independent contacts without treating contacts as payers",()=>{
    expect(contactCreateSchema.parse({displayName:"  Adult learner  ",idempotencyKey:key}))
      .toMatchObject({displayName:"Adult learner",kind:"person"});
    expect(studentContactLinkSchema.parse({contactId:key,relationshipLabel:"Grandmother",
      idempotencyKey:key})).toMatchObject({
      isLegalGuardian:false,mayReceiveMessages:false,
    });
    expect(billingAccountCreateSchema.parse({displayName:"School",accountKind:"organization",
      idempotencyKey:key})).toMatchObject({accountKind:"organization"});
  });
  it("requires optimistic revisions and valid UUID idempotency keys",()=>{
    expect(contactUpdateSchema.safeParse({displayName:"New",idempotencyKey:key}).success)
      .toBe(false);
    expect(contactUpdateSchema.safeParse({expectedRevision:1,idempotencyKey:key}).success)
      .toBe(false);
    expect(contactUpdateSchema.safeParse({displayName:"New",expectedRevision:1,
      idempotencyKey:key}).success).toBe(true);
    expect(studentContactUnlinkSchema.safeParse({expectedRevision:0,
      idempotencyKey:key}).success).toBe(false);
    expect(billingAccountUpdateSchema.safeParse({status:"archived",expectedRevision:1,
      idempotencyKey:key}).success).toBe(true);
  });
  it("rejects attempted extra permission or portal parameters",()=>{
    expect(contactCreateSchema.safeParse({displayName:"Contact",idempotencyKey:key,
      portalToken:"unreviewed"}).success).toBe(false);
    expect(studentContactLinkSchema.safeParse({contactId:key,
      relationshipLabel:"School",portalAccess:true,idempotencyKey:key}).success).toBe(false);
    expect(billingAccountCreateSchema.safeParse({displayName:"Payer",
      invoiceId:key,idempotencyKey:key}).success).toBe(false);
  });
  it("redacts contact details, private portal data and associated payer identity by default",()=>{
    const row={id:key,display_name:"Primary",kind:"person",status:"active",
      email:"child@example.invalid",phone:"secret",portal_token:"NEVER_EXPOSE",
      preferred_locale:"he",revision:1,created_at:"2026-11-18",
      updated_at:"2026-11-18"};
    expect(safeContact(row)).not.toHaveProperty("email");
    expect(safeContact(row)).not.toHaveProperty("portal_token");
    expect(safeContact(row,true)).toMatchObject({email:row.email,preferredLocale:"he"});
    expect(safeContact(row,true)).not.toHaveProperty("portal_token");
    const payer={id:key,display_name:"School",account_kind:"organization",
      contact_id:key,revision:1,status:"active"};
    expect(safeBillingAccount(payer)).not.toHaveProperty("contactId");
    expect(safeBillingAccount(payer,true).contactId).toBe(key);
    expect(safeContactLink({id:key,student_id:key,contact_id:key,
      is_legal_guardian:false,may_receive_messages:false})).toMatchObject({
      isLegalGuardian:false,mayReceiveMessages:false,
    });
  });
});
