import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherPolicyUpdate} from "@/lib/server/teacher-policy-service";

// Invalid website inputs must be rejected before any fetch or write can occur.
const noDb={} as SupabaseClient;
async function invalid(body:Record<string,unknown>,fragment:string){
 const response=await teacherPolicyUpdate(noDb,"teacher-one",undefined,body);
 expect(response.status).toBe(400);
 const data=await response.json();
 expect(data.error).toContain(fragment);
}
describe("studio policy website/MCP field validation",()=>{
 it("rejects unknown fields and invalid studio strings before persistence",async()=>{
  await invalid({imaginaryPolicy:"ignored"},"Unsupported policy field");
  await invalid({studioName:{value:"Not a string"}},"studioName");
  await invalid({studioWebsite:"x".repeat(301)},"studioWebsite");
  await invalid({lessonLabel:42},"lessonLabel");
 });
 it("does not turn string false into a true billing, reminder or notification flag",async()=>{
  for(const field of ["billAttended","notifyInApp","teacherCancelEarnsMakeup","bccFamilyEmails"]){
   await invalid({[field]:"false"},field);
  }
 });
 it("never treats an invalid credential-clearing flag as an approval",async()=>{
  for(const field of ["clearStripeSecretKey","clearStripeWebhookSecret","clearAiApiKey"]){
   await invalid({[field]:"false"},field);
   await invalid({[field]:false},field);
  }
 });
 it("rejects rounded or clamped monetary inputs before mutating settings",async()=>{
  for(const value of [-100,0.7,10_000_001,Number.NaN,"2.5","1e4","invalid"]){
   await invalid({defaultRateCents:value},"whole cents");
   await invalid({travelFeeCents:value},"whole cents");
  }
 });
 it("rejects invalid duration mappings instead of silently dropping them",async()=>{
  for(const map of [
   {"0":100},{"300":100},{"60":1.5},{"60":-20},{"60":"8000"},
   {"90":10_000_001},
  ])await invalid({durationRateCents:map},"Duration rates");
 });
 it("rejects invalid duration blocks, expiry and currency instead of coercing",async()=>{
  for(const duration of [[15,"20"],[0,60],[60,245],[],Array(21).fill(45)]){
   await invalid({lessonDurationOptions:duration},"time blocks");
  }
  await invalid({makeupCreditExpiryDays:2.5},"expiry");
  await invalid({cancellationWindowHours:"10"},"window");
  await invalid({currency:"USDollars"},"Currency");
 });
});
