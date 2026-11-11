import { z } from "zod";

/** Pure validators shared by the website API and scoped MCP tool schemas. */
export const chessUuid = z.string().uuid();
export const categoryName = z.string().trim().min(1).max(80);
export const observationText = z.string().trim().min(1).max(5000);
export const observedAt = z.string().datetime({ offset: true });

export const observationInput = z.object({
  studentId: chessUuid,
  categoryId: chessUuid,
  sessionId: chessUuid.optional(),
  observation: observationText,
  observedAt: observedAt.optional(),
  requestId: chessUuid.optional(),
}).strict();

export const materialLinkListInput = z.object({
 studentId:chessUuid.optional(),sessionId:chessUuid.optional(),
 offset:z.number().int().min(0).max(100000).default(0),
 limit:z.number().int().min(1).max(100).default(50),
}).strict().refine(v=>Boolean(v.studentId||v.sessionId),"Choose a student or session");
export const materialLinkCreateInput = z.object({
 materialId:chessUuid,studentId:chessUuid.optional(),sessionId:chessUuid.optional(),
 requestId:chessUuid,confirmed:z.literal(true),
}).strict().refine(v=>Boolean(v.studentId||v.sessionId),"Choose a student or session");
export const materialLinkUpdateInput = z.object({
 linkId:chessUuid,materialId:chessUuid,expectedRevision:z.number().int().min(1),
 confirmed:z.literal(true),
}).strict();
export const materialLinkUnlinkInput = z.object({
 linkId:chessUuid,expectedRevision:z.number().int().min(1),confirmed:z.literal(true),
}).strict();

/**
 * Only preserve an HTTPS reference; never fetch external learning content.
 * Lichess identifiers must come from an exact /study/id[/chapter] URL.
 * URL parsing blocks scheme impersonation and lookalike hostnames.
 */
export function normalizeLearningLink(input: string, type: "lichess_study" | "external") {
  let url: URL;
  try { url = new URL(input); }
  catch { throw new Error("Enter a valid HTTPS URL"); }
  if (url.protocol !== "https:" || url.username || url.password ||
      !url.hostname || url.port || url.href.length > 2048) {
    throw new Error("Use a public HTTPS URL without credentials or a custom port");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host === "[::1]" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    throw new Error("Local and IP-address learning links are not supported");
  }
  if (type === "lichess_study") {
    if (host !== "lichess.org" || url.search || url.hash) {
      throw new Error("Use a direct lichess.org/study link");
    }
    const match = /^\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?\/?$/.exec(url.pathname);
    if (!match) throw new Error("Use a specific Lichess study or chapter link");
    return { url: url.toString(), resourceType: type,
      providerStudyId: match[1], providerChapterId: match[2] ?? null };
  }
  return { url: url.toString(), resourceType: type,
    providerStudyId: null, providerChapterId: null };
}
