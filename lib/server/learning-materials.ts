
import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fenBoard } from "@/lib/lichess-puzzles";

// A typed catalog, not a polymorphic "games" table. PGNs and puzzle positions
// are stored as coach-supplied content; neither implies engine verification.
export function structurallyValidFen(value: string): boolean {
  // Share the same board/king/pawn/counter validation as the existing reviewed
  // Lichess puzzle preview. Do not accept a structurally incomplete position
  // into the new typed materials catalog when the older editor would reject it.
  try { fenBoard(value); return true; } catch { return false; }
}

const uuid = z.string().uuid();
const base = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(4000).default(""),
  sourceUrl: z.url().startsWith("https://").max(2048).nullable().default(null),
  requestId: uuid,
});
const game = base.extend({
  kind: z.literal("game"),
  details: z.object({
    pgn: z.string().trim().min(1).max(150000),
    whitePlayer: z.string().max(120).default(""),
    blackPlayer: z.string().max(120).default(""),
    result: z.enum(["1-0", "0-1", "1/2-1/2", "*"]).default("*"),
  }).strict(),
}).strict();
const puzzle = base.extend({
  kind: z.literal("puzzle"),
  details: z.object({
    fen: z.string().trim().refine(structurallyValidFen, "FEN must have eight complete ranks and six structurally valid fields"),
    solution: z.string().max(5000).nullable().default(null),
    themes: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
  }).strict(),
}).strict();
const drill = base.extend({
  kind: z.literal("drill"),
  details: z.object({
    instructions: z.string().trim().min(1).max(5000),
    mode: z.enum(["calculation", "repetition", "endgame", "opening", "other"]).default("other"),
    repetitions: z.number().int().min(1).max(10000).nullable().default(null),
  }).strict(),
}).strict();
const study = base.extend({
  kind: z.literal("study_chapter"),
  sourceUrl: z.url().startsWith("https://").max(2048),
  details: z.object({
    provider: z.enum(["lichess", "other"]).default("lichess"),
    studyId: z.string().trim().min(1).max(128),
    chapterId: z.string().trim().min(1).max(128).nullable().default(null),
  }).strict(),
}).strict();
const link = base.extend({
  kind: z.literal("external_link"),
  sourceUrl: z.url().startsWith("https://").max(2048),
  details: z.object({}).strict(),
}).strict();
export const materialCatalogCreateSchema = z.discriminatedUnion("kind", [
  game, puzzle, drill, study, link,
]);
const materialUpdateFields={
  materialId: uuid,expectedRevision:z.number().int().min(1),
  confirmed:z.literal(true),
};
export const materialCatalogUpdateSchema = z.discriminatedUnion("kind",[
  game.extend(materialUpdateFields),
  puzzle.extend(materialUpdateFields),
  drill.extend(materialUpdateFields),
  study.extend(materialUpdateFields),
  link.extend(materialUpdateFields),
]);
export type MaterialCatalogUpdate=z.infer<typeof materialCatalogUpdateSchema>;

export const materialCatalogFilterSchema = z.object({
  kind: z.enum(["game", "puzzle", "drill", "study_chapter", "external_link"]).optional(),
  query: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).max(100000).default(0),
}).strict();
export type MaterialCatalogCreate = z.infer<typeof materialCatalogCreateSchema>;
export type MaterialCatalogFilter = z.infer<typeof materialCatalogFilterSchema>;
type Db = SupabaseClient;

export class MaterialCatalogError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
const fail = (status:number, code:string, message:string) => new MaterialCatalogError(status,code,message);
const select = "id,teacher_id,kind,title,description,source_url,revision,created_at,updated_at,chess_games(pgn,white_player,black_player,result),chess_puzzles(fen,solution,themes),chess_drills(instructions,mode,repetitions),chess_study_chapters(provider,study_id,chapter_id)";
// PostgREST may materialize a composite-FK 1:1 relation as a one-element array.
// Stabilize the website/MCP contract to one nullable typed payload object.
function normalizeMaterial(row:Record<string,unknown>) {
  const normalized={...row};
  for(const field of ["chess_games","chess_puzzles","chess_drills","chess_study_chapters"]) {
    const value=row[field];
    normalized[field]=Array.isArray(value)?(value[0]??null):(value??null);
  }
  return normalized;
}

export async function teacherMaterialCatalogList(db: Db, teacherId: string, options: MaterialCatalogFilter) {
  let query = db.from("learning_materials").select(select, {count: "exact"})
    .eq("teacher_id",teacherId)
    .order("created_at",{ascending:false}).order("id")
    .range(options.offset,options.offset+options.limit);
  if (options.kind) query=query.eq("kind",options.kind);
  if (options.query) {
    const literal=options.query.replace(/[\\%_]/g,"\\$&");
    query=query.ilike("title",`%${literal}%`);
  }
  const { data, error, count } = await query;
  if (error) throw fail(500,"DATABASE_ERROR","Learning materials are unavailable");
  return {
    materials:(data??[]).slice(0,options.limit).map(row=>normalizeMaterial(row as Record<string,unknown>)),
    total:count??0,
    nextOffset:(data?.length??0)>options.limit?options.offset+options.limit:null,
  };
}
export async function teacherMaterialCatalogGet(db:Db, teacherId:string, materialId:string) {
  const {data,error}=await db.from("learning_materials").select(select)
    .eq("teacher_id",teacherId).eq("id",materialId).maybeSingle();
  if (error) throw fail(500,"DATABASE_ERROR","Learning material lookup failed");
  if (!data) throw fail(404,"NOT_FOUND","Learning material not found");
  return normalizeMaterial(data as Record<string,unknown>);
}
export async function teacherMaterialCatalogCreate(db:Db,teacherId:string,input:MaterialCatalogCreate) {
  // Type-safe website/MCP service, plus server-side tenant/RLS/transaction checks.
  const {data,error}=await db.rpc("ccp_material_catalog_create", {
    p_kind:input.kind,p_title:input.title,p_description:input.description,
    p_source_url:input.sourceUrl,p_details:input.details,p_request_id:input.requestId,
  });
  if (error) {
    if (/IDEMPOTENCY_CONFLICT/.test(error.message)) throw fail(409,"IDEMPOTENCY_CONFLICT","Request key was already used with different content");
    if (/INVALID_|VALIDATION_ERROR|check constraint|23514/.test(error.message))
      throw fail(400,"VALIDATION_ERROR","Invalid material type or content");
    throw fail(500,"DATABASE_ERROR","Cannot save learning material");
  }
  if (!data || typeof data !== "object" || typeof data.id !== "string")
    throw fail(500,"DATABASE_ERROR","Invalid material receipt");
  const created=await teacherMaterialCatalogGet(db,teacherId,data.id);
  return {material:created,replayed:data.replayed===true};
}

/**
 * Corrections use one owner-derived SQL transaction for both the catalog root
 * and type-specific record. A stale revision or same-key changed payload makes
 * no write; the edit receipt survives retries from either UI or delegated MCP.
 */
export async function teacherMaterialCatalogUpdate(
 db:Db,teacherId:string,input:MaterialCatalogUpdate
) {
  const {data,error}=await db.rpc("ccp_material_catalog_update",{
    p_material_id:input.materialId,
    p_expected_revision:input.expectedRevision,
    p_kind:input.kind,p_title:input.title,p_description:input.description,
    p_source_url:input.sourceUrl,p_details:input.details,p_request_id:input.requestId,
  });
  if(error){
    if (/IDEMPOTENCY_CONFLICT/.test(error.message))
      throw fail(409,"IDEMPOTENCY_CONFLICT","Request key was used for a different material change");
    if (/STALE_REVISION/.test(error.message))
      throw fail(409,"STALE_REVISION","Material has changed; reload before updating");
    if (/KIND_MISMATCH/.test(error.message))
      throw fail(409,"KIND_MISMATCH","The material kind cannot be changed");
    if (/NOT_FOUND/.test(error.message))
      throw fail(404,"NOT_FOUND","Learning material not found");
    if (/INVALID_|VALIDATION_ERROR|check constraint|23514/.test(error.message))
      throw fail(400,"VALIDATION_ERROR","Invalid material update");
    throw fail(500,"DATABASE_ERROR","Unable to update learning material");
  }
  if (!data || typeof data!=="object" || typeof data.id!=="string" ||
      typeof data.revision!=="number")
    throw fail(500,"DATABASE_ERROR","Invalid material update receipt");
  return {material:await teacherMaterialCatalogGet(db,teacherId,data.id),
    replayed:data.replayed===true,resultingRevision:data.revision as number};
}
