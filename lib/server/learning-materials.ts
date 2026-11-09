
import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

// A typed catalog, not a polymorphic "games" table. PGNs and puzzle positions
// are stored as coach-supplied content; neither implies engine verification.
export function structurallyValidFen(value: string): boolean {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 6) return false;
  const ranks = parts[0].split("/");
  if (ranks.length !== 8 || !ranks.every(rank => {
    let squares = 0;
    for (const character of rank) {
      if (/[1-8]/.test(character)) squares += Number(character);
      else if (/[prnbqkPRNBQK]/.test(character)) squares += 1;
      else return false;
    }
    return squares === 8;
  })) return false;
  if (!["w", "b"].includes(parts[1])) return false;
  if (!/^(-|[KQkq]{1,4})$/.test(parts[2]) || new Set(parts[2]).size !== parts[2].length) return false;
  if (!/^(-|[a-h][36])$/.test(parts[3])) return false;
  return /^\d+$/.test(parts[4]) && /^[1-9]\d*$/.test(parts[5]);
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
const select = "id,teacher_id,kind,title,description,source_url,created_at,updated_at,chess_games(pgn,white_player,black_player,result),chess_puzzles(fen,solution,themes),chess_drills(instructions,mode,repetitions),chess_study_chapters(provider,study_id,chapter_id)";
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
