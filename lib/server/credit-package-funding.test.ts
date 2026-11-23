import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {withCreditFundingReport} from "./credit-package-funding";

describe("credit funding report",()=>{
 const base={invoiceCurrency:"USD",priceCents:5000,active:true,credits:3,usedCredits:1};
 const db=(rows:Array<{invoice_id:string;amount_cents:number}>|null)=>{
  let requested:readonly string[]=[];
  const client={from:()=>({select:()=>({in:(_field:string,ids:readonly string[])=>{
   requested=ids;
   return {order:()=>({range:async()=>({data:rows,error:rows===null?{}:null})})};
  }})})};
  return {client:client as unknown as SupabaseClient,invoices:()=>requested};
 };
 it("keeps an unavailable receipt read unknown and a sent entitlement issued",async()=>{
  const {client}=db(null);
  const [row]=await withCreditFundingReport(client,[{...base,invoiceId:"owned",invoiceWorkflowStatus:"sent"}]);
  expect(row.fundingReport).toEqual({invoiceWorkflowStatus:"sent",invoiceCurrency:"USD",
   funding:{status:"unavailable",recordedInvoicePaymentCents:null},
   entitlement:{issued:true,unredeemedUnits:2,remainingAfterPending:null}});
 });
 it("does not read funding for an invoice missing from the owned projection",async()=>{
  const {client,invoices}=db([{invoice_id:"owned",amount_cents:750}]);
  const [owned,missing]=await withCreditFundingReport(client,[
   {...base,invoiceId:"owned",invoiceWorkflowStatus:"sent"},
   {...base,invoiceId:"missing",invoiceWorkflowStatus:null,invoiceCurrency:null,active:false},
  ]);
  expect(invoices()).toEqual(["owned"]);
  expect(owned.fundingReport.funding).toEqual({status:"partial",recordedInvoicePaymentCents:750});
  expect(missing.fundingReport).toMatchObject({
   invoiceWorkflowStatus:null,funding:{status:"unavailable",recordedInvoicePaymentCents:null},
   entitlement:{issued:null},
  });
 });
});
