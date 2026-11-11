import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";

vi.mock("@/lib/server/scheduling",()=>({
 getPolicy:async()=>({payment_provider:"stripe",
  stripe_secret_key:"sk_test_internal_do_not_expose",studio_name:"Chess Studio"}),
}));
vi.mock("@/lib/payments",()=>({
 createCheckoutSession:async()=>{throw new Error("Provider internal sk_test_internal_do_not_expose");},
}));
import {teacherBillingCheckout} from "@/lib/server/teacher-billing-operations";

describe("invoice checkout provider secrecy",()=>{
 it("returns generic model-safe errors without disclosing upstream provider strings",async()=>{
  const db={
   from(table:string){
    expect(table).toBe("invoices");
    const q={select(){return q;},eq(){return q;},
     single:async()=>({data:{
      id:"invoice-one",status:"draft",subtotal_cents:5000,
      currency:"USD",period_start:"2045-01-01",period_end:"2045-01-31",
      stripe_checkout_url:null,payments:[],guardians:{
       name:"Synthetic family",family_name:null,email:null,
       secondary_email:null,email_recipients:"primary",
      },
     },error:null})};
    return q;
   },
  } as unknown as SupabaseClient;
  const response=await teacherBillingCheckout(db,"teacher-one","invoice-one","https://example.com");
  expect(response.status).toBe(502);
  const value=await response.json();
  expect(value.error).toContain("Checkout provider unavailable");
  expect(JSON.stringify(value)).not.toContain("sk_test_internal");
  expect(JSON.stringify(value)).not.toContain("Provider internal");
 });
});
