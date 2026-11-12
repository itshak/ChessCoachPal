import {describe,it,expect} from "vitest";
import {invoicePdfMcpPayload,MCP_INLINE_PDF_MAX_BYTES}
 from "@/lib/server/invoice-pdf-transfer";
describe("private delegated PDF size boundary",()=>{
 it("returns a downloadable outcome without ever inlining a PDF above 512 KiB",()=>{
  const over=invoicePdfMcpPayload(new Uint8Array(MCP_INLINE_PDF_MAX_BYTES+1),
   "invoice.pdf");
  expect(over).toEqual({error:{
   code:"PDF_TOO_LARGE",
   message:"Download this invoice PDF from the authenticated website",
  }});
  expect(JSON.stringify(over)).not.toContain("base64");
 });
 it("allows exact-limit PDFs and supports empty zero-byte formatting separately",()=>{
  const exact=invoicePdfMcpPayload(
   new Uint8Array(MCP_INLINE_PDF_MAX_BYTES),"invoice.pdf");
  expect("data" in exact).toBe(true);
  if(!("data" in exact))throw new Error("Expected an inline PDF payload");
  expect(exact.data.base64.length).toBeGreaterThan(MCP_INLINE_PDF_MAX_BYTES);
 });
});
