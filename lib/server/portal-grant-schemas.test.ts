import {describe,it,expect} from "vitest";
import {portalGrantCreateSchema,portalGrantRevokeSchema} from "./portal-grant-schemas";
import {safePortalGrant,portalGrantAllows,type PortalAuthorization}
  from "./portal-grants-service";
const id="11111111-1111-4111-8111-111111111111";
const student="22222222-2222-4222-8222-222222222222";
const workplace="33333333-3333-4333-8333-333333333333";
const payer="44444444-4444-4444-8444-444444444444";
const teacher="55555555-5555-4555-8555-555555555555";
const record={contactId:id,studentId:student,workplaceId:workplace,
  permissions:["calendar","cancel"] as const,expiresAt:"2038-12-01T00:00:00.000Z",
  idempotencyKey:id,confirmed:true as const};
function access(permissions:Array<"calendar"|"cancel"|"shared_notes"|"event_rsvp"|"finance">,
  billingAccountId:string|null=null):PortalAuthorization{
  return {id,teacherId:teacher,contactId:id,studentId:student,workplaceId:workplace,
    billingAccountId,permissions:new Set(permissions)};
}
const resource={teacherId:teacher,studentId:student,workplaceId:workplace};
describe("explicit scoped guest grants",()=>{
  it("requires exact approved permission set, source contact/student/workplace and expiry",()=>{
    expect(portalGrantCreateSchema.safeParse(record).success).toBe(true);
    expect(portalGrantCreateSchema.safeParse({...record,confirmed:false}).success).toBe(false);
    expect(portalGrantCreateSchema.safeParse({...record,permissions:[]}).success).toBe(false);
    expect(portalGrantCreateSchema.safeParse({...record,permissions:["calendar","calendar"]}).success).toBe(false);
    expect(portalGrantCreateSchema.safeParse({...record,permissions:["all"]}).success).toBe(false);
    expect(portalGrantCreateSchema.safeParse({...record,portalToken:"legacy"}).success).toBe(false);
    expect(portalGrantCreateSchema.safeParse({...record,workplaceId:"all"}).success).toBe(false);
  });
  it("finance requires exact separate payer, not a contact relationship or calendar permission",()=>{
    expect(portalGrantCreateSchema.safeParse({...record,permissions:["finance"]}).success).toBe(false);
    expect(portalGrantCreateSchema.safeParse({...record,billingAccountId:payer}).success).toBe(false);
    expect(portalGrantCreateSchema.safeParse({...record,permissions:["finance"],billingAccountId:payer}).success).toBe(true);
  });
  it("enforces tenant, student, workplace, permission and payer boundaries before any resource fetch",()=>{
    expect(portalGrantAllows(access(["calendar"]),"calendar",resource)).toBe(true);
    expect(portalGrantAllows(access(["calendar"]),"cancel",resource)).toBe(false);
    expect(portalGrantAllows(access(["calendar"]),"shared_notes",resource)).toBe(false);
    expect(portalGrantAllows(access(["calendar"]),"calendar",{...resource,workplaceId:null})).toBe(false);
    expect(portalGrantAllows(access(["calendar"]),"calendar",{...resource,workplaceId:"other"})).toBe(false);
    expect(portalGrantAllows(access(["calendar"]),"calendar",{...resource,studentId:"other"})).toBe(false);
    expect(portalGrantAllows(access(["calendar"]),"calendar",{...resource,teacherId:"other"})).toBe(false);
    expect(portalGrantAllows(access(["finance"],payer),"finance",{...resource,billingAccountId:payer})).toBe(true);
    expect(portalGrantAllows(access(["finance"],payer),"finance",{...resource,billingAccountId:"other"})).toBe(false);
    expect(portalGrantAllows(access(["finance"]),"finance",{...resource,billingAccountId:payer})).toBe(false);
  });
  it("never discloses token digest, source email or raw secret in a metadata view",()=>{
    const privateRow={id,teacher_id:teacher,contact_id:id,student_id:student,workplace_id:workplace,
      billing_account_id:null,permissions:["calendar"],expires_at:"2038-12-01T00:00:00Z",
      revoked_at:null,issued_at:"2030-01-01T00:00:00Z",token_digest:"topsecret",
      revision:2,created_at:"2026-11-18",raw_secret:"never"};
    const view=safePortalGrant(privateRow);
    expect(view).toMatchObject({id,issued:true,revision:2});
    expect(view).not.toHaveProperty("token_digest");
    expect(view).not.toHaveProperty("raw_secret");
    expect(view).not.toHaveProperty("email");
    expect(safePortalGrant({...privateRow,revoked_at:"2030-01-02"}).issued).toBe(false);
  });
  it("does not revoke without explicit confirmation/revision/idempotency",()=>{
    expect(portalGrantRevokeSchema.safeParse({expectedRevision:1,idempotencyKey:id,confirmed:true}).success).toBe(true);
    expect(portalGrantRevokeSchema.safeParse({expectedRevision:1,idempotencyKey:id}).success).toBe(false);
    expect(portalGrantRevokeSchema.safeParse({expectedRevision:0,idempotencyKey:id,confirmed:true}).success).toBe(false);
  });
});
