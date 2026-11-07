import { z } from "zod";

/** Pure validators shared by the website API and scoped MCP tool schemas. */
export const chessUuid = z.string().uuid();
export const categoryName = z.string().trim().min(1).max(80);
export const observationText = z.string().trim().min(1).max(5000);
export const resourceLabel = z.string().trim().min(1).max(160);
export const resourceUrl = z.string().trim().min(1).max(2048);
export const observedAt = z.string().datetime({ offset: true });
export const resourceType = z.enum(["lichess_study", "external"]);

export const observationInput = z.object({
  studentId: chessUuid,
  categoryId: chessUuid,
  sessionId: chessUuid.optional(),
  observation: observationText,
  observedAt: observedAt.optional(),
  requestId: chessUuid.optional(),
}).strict();

export const resourceInput = z.object({
  studentId: chessUuid.optional(),
  sessionId: chessUuid.optional(),
  label: resourceLabel,
  url: resourceUrl,
  resourceType,
  requestId: chessUuid.optional(),
}).strict().refine(v => Boolean(v.studentId || v.sessionId), {
  message: "A student or session is required",
});

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
