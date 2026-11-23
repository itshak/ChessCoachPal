import {describe,expect,it} from "vitest";
import {completePortalFinanceRows,verifiedPortalPurchase,trustedPortalCheckoutUrl} from "./portal-finance-scope";

describe("portal finance accounting completeness",()=>{
 it("accepts exact empty/full evidence",()=>{
  expect(completePortalFinanceRows([],0)).toEqual([]);
  const rows=[{id:"a"},{id:"b"}];
  expect(completePortalFinanceRows(rows,2)).toBe(rows);
 });
 it("fails closed for rows or metadata missing at a gateway boundary",()=>{
  expect(completePortalFinanceRows(null,0)).toBeNull();
  expect(completePortalFinanceRows([{id:"a"}],null)).toBeNull();
  expect(completePortalFinanceRows([{id:"a"}],2)).toBeNull();
  expect(completePortalFinanceRows(Array.from({length:1001},()=>null),1001)).toBeNull();
 });
});

describe("portal prepaid purchase evidence",()=>{
 const line={invoice_id:"invoice",session_id:null,student_id:null,kind:"credit_package",
  quantity:1,unit_cents:3718,amount_cents:3718};
 const packageEvidence={invoice_id:"invoice",student_id:"learner",workplace_id:"venue",price_cents:3718};
 it("accepts only a single amount-consistent canonical purchase line",()=>{
  expect(verifiedPortalPurchase(3718,[line],packageEvidence)).toBe(true);
  expect(verifiedPortalPurchase(3718,[line],undefined)).toBe(false);
  expect(verifiedPortalPurchase(3718,[line,line],packageEvidence)).toBe(false);
  expect(verifiedPortalPurchase(3719,[line],packageEvidence)).toBe(false);
  expect(verifiedPortalPurchase(3718,[{...line,session_id:"lesson"}],packageEvidence)).toBe(false);
 });
});

describe("stored guest checkout handoff",()=>{
 it("retains only exact HTTPS Stripe Checkout origin",()=>{
  const approved="https://checkout.stripe.com/c/pay/cs_test_fixture";
  expect(trustedPortalCheckoutUrl(approved)).toBe(approved);
  for(const url of [null,"http://checkout.stripe.com/c/pay/test","https://checkout.stripe.com.example.invalid/path",
   "https://case@checkout.stripe.com/c/pay/test","https://checkout.stripe.com:444/c/pay/test","not a URL"])
   expect(trustedPortalCheckoutUrl(url)).toBeNull();
 });
});
