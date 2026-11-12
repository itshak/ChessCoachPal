import {describe,it,expect} from "vitest";
import {invoiceDraftEditSchema} from "@/lib/server/invoice-draft-schemas";

describe("shared website/MCP invoice-draft field and replay contract",()=>{
 it("requires a reviewed change and rejects extra credentials or unknown business fields",()=>{
  expect(invoiceDraftEditSchema.safeParse({}).success).toBe(false);
  expect(invoiceDraftEditSchema.safeParse({
   notes:"Reviewed",providerSecret:"unrecognized",
  }).success).toBe(false);
  expect(invoiceDraftEditSchema.safeParse({
   notes:"Reviewed",idempotencyKey:"not-a-uuid",
  }).success).toBe(false);
 });
 it("allows exact revision and immutable request UUID with a valid draft replacement",()=>{
  expect(invoiceDraftEditSchema.safeParse({
   notes:"Reviewed endgame invoice",
   expectedUpdatedAt:"2040-06-01T12:00:00Z",
   idempotencyKey:"00000000-0000-4000-8000-000000000123",
   items:[{description:"Chess lesson",quantity:1,unitCents:2500,amountCents:2500}],
  }).success).toBe(true);
 });
 it("blocks malformed money, hidden extra line fields and overlong descriptions",()=>{
  expect(invoiceDraftEditSchema.safeParse({
   items:[{description:"Chess",quantity:1,unitCents:0.5,amountCents:10}],
  }).success).toBe(false);
  expect(invoiceDraftEditSchema.safeParse({
   items:[{description:"Chess",quantity:1,unitCents:10,amountCents:10,
    paymentToken:"secret"}],
  }).success).toBe(false);
 });
});
