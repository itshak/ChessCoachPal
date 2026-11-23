import {describe,expect,it} from "vitest";
import {completePortalFinanceRows,verifiedPortalPurchase} from "./portal-finance-scope";

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
