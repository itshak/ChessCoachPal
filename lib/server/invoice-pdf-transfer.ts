/** A delegated MCP call must not inline arbitrarily large private invoice files.
 * Large invoices remain available through the owner-authenticated PDF route. */
export const MCP_INLINE_PDF_MAX_BYTES=512*1024;
export function invoicePdfMcpPayload(bytes:Uint8Array,filename:string){
 if(bytes.byteLength>MCP_INLINE_PDF_MAX_BYTES)
  return {error:{code:"PDF_TOO_LARGE",
   message:"Download this invoice PDF from the authenticated website"}};
 return {data:{filename,mimeType:"application/pdf",
   base64:Buffer.from(bytes).toString("base64")}};
}
