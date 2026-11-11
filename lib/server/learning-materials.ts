
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

export const materialRelationSchema=z.object({
  fromMaterialId:uuid,toMaterialId:uuid,
  relationType:z.enum(["extracted_from","derived_from","prerequisite"]),
  action:z.enum(["link","unlink"]),
  expectedRevision:z.number().int().min(1),
  requestId:uuid,confirmed:z.literal(true),
}).strict().refine(x=>x.fromMaterialId!==x.toMaterialId,{
  message:"A material cannot reference itself",
});
export const materialRelationListSchema=z.object({materialId:uuid}).strict();
export type MaterialRelationChange=z.infer<typeof materialRelationSchema>;

export const materialLifecycleSchema=z.object({
  materialId:uuid,expectedRevision:z.number().int().min(1),
  action:z.enum(["archive","restore"]),requestId:uuid,confirmed:z.literal(true),
}).strict();
export const materialArchivePreviewSchema=z.object({materialId:uuid}).strict();
export type MaterialLifecycleChange=z.infer<typeof materialLifecycleSchema>;

export const materialCatalogFilterSchema = z.object({
  kind: z.enum(["game", "puzzle", "drill", "study_chapter", "external_link"]).optional(),
  query: z.string().trim().max(120).optional(),
  includeArchived:z.boolean().default(false),
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
const select = "id,teacher_id,kind,title,description,source_url,revision,archived_at,created_at,updated_at,chess_games(pgn,white_player,black_player,result),chess_puzzles(fen,solution,themes),chess_drills(instructions,mode,repetitions),chess_study_chapters(provider,study_id,chapter_id)";
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
  if (!options.includeArchived) query=query.is("archived_at",null);
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

/** Relations are evidence links, not a claim that chess material was taught. */
export async function teacherMaterialRelationsList(db:Db,teacherId:string,materialId:string) {
  await teacherMaterialCatalogGet(db,teacherId,materialId);
  const {data,error}=await db.from("learning_material_relations")
    .select("from_material_id,to_material_id,relation_type,created_at")
    .eq("teacher_id",teacherId)
    .or("from_material_id.eq."+materialId+",to_material_id.eq."+materialId)
    .order("created_at",{ascending:false}).limit(300);
  if(error)throw fail(500,"DATABASE_ERROR","Material relationships unavailable");
  return {materialId,relations:data??[]};
}
export async function teacherMaterialRelationChange(
 db:Db,teacherId:string,input:MaterialRelationChange
) {
  const {data,error}=await db.rpc("ccp_material_relation_change",{
    p_from_material_id:input.fromMaterialId,
    p_to_material_id:input.toMaterialId,
    p_relation_type:input.relationType,
    p_action:input.action,
    p_expected_revision:input.expectedRevision,
    p_request_id:input.requestId,
  });
  if(error){
    if(/IDEMPOTENCY_CONFLICT/.test(error.message))
      throw fail(409,"IDEMPOTENCY_CONFLICT","This request ID was used for a different relationship change");
    if(/STALE_REVISION/.test(error.message))
      throw fail(409,"STALE_REVISION","Source material changed; reload before editing");
    if(/RELATION_ALREADY_EXISTS/.test(error.message))
      throw fail(409,"RELATION_ALREADY_EXISTS","Material relationship already exists");
    if(/RELATION_NOT_FOUND|NOT_FOUND/.test(error.message))
      throw fail(404,"NOT_FOUND","Material or relationship unavailable");
    if(/INVALID_|VALIDATION_ERROR|23514/.test(error.message))
      throw fail(400,"VALIDATION_ERROR","Invalid material relationship");
    throw fail(500,"DATABASE_ERROR","Unable to change material relationship");
  }
  if(!data || typeof data!=="object"||typeof data.revision!=="number")
    throw fail(500,"DATABASE_ERROR","Invalid relationship change receipt");
  // Typed catalog response is the same whether change originated in UI or MCP.
  const source=await teacherMaterialCatalogGet(db,teacherId,input.fromMaterialId);
  return {receipt:data,source};
}

/**
 * An archive is an explicitly reviewed soft removal from active catalogs,
 * never an unsafe hard-delete of lesson materials. In-use material remains
 * accessible and its assignments/relations retain their original identity.
 */
export async function teacherMaterialArchivePreview(db:Db,teacherId:string,materialId:string){
 const material=await teacherMaterialCatalogGet(db,teacherId,materialId);
 const [assignments,relations]=await Promise.all([
   db.from("training_assignments").select("id",{count:"exact",head:true})
    .eq("teacher_id",teacherId).eq("material_id",materialId),
   db.from("learning_material_relations").select("from_material_id",{count:"exact",head:true})
    .eq("teacher_id",teacherId)
    .or("from_material_id.eq."+materialId+",to_material_id.eq."+materialId),
 ]);
 if(assignments.error||relations.error)
   throw fail(503,"PREVIEW_UNAVAILABLE","Unable to verify material history dependencies");
 const assignmentCount=assignments.count??0,relationshipCount=relations.count??0;
 return {materialId,title:material.title,kind:material.kind,revision:material.revision,
   archived:material.archived_at!==null,assignmentCount,relationshipCount,
   canArchive:assignmentCount===0&&relationshipCount===0,
   safety:"Archiving hides a material from active search but retains its identity and prior records"};
}
export async function teacherMaterialLifecycleChange(
 db:Db,teacherId:string,input:MaterialLifecycleChange
){
 const {data,error}=await db.rpc("ccp_material_lifecycle_change",{
   p_material_id:input.materialId,p_expected_revision:input.expectedRevision,
   p_action:input.action,p_request_id:input.requestId,
 });
 if(error){
   if(/IDEMPOTENCY_CONFLICT/.test(error.message))
     throw fail(409,"IDEMPOTENCY_CONFLICT","Request ID belongs to a different archive action");
   if(/STALE_REVISION/.test(error.message))
     throw fail(409,"STALE_REVISION","Material changed; reload before archiving");
   if(/HISTORY_DEPENDENCIES/.test(error.message))
     throw fail(409,"HISTORY_DEPENDENCIES",
       "Resolve linked homework, material relationships and historical study mappings before archiving");
   if(/ALREADY_ARCHIVED|NOT_ARCHIVED/.test(error.message))
     throw fail(409,"CONFLICT","Material lifecycle already changed");
   if(/NOT_FOUND/.test(error.message))
     throw fail(404,"NOT_FOUND","Material not found");
   if(/VALIDATION_ERROR/.test(error.message))
     throw fail(400,"VALIDATION_ERROR","Invalid material lifecycle action");
   throw fail(500,"DATABASE_ERROR","Unable to change material lifecycle");
 }
 if(!data||typeof data!=="object"||typeof data.revision!=="number")
   throw fail(500,"DATABASE_ERROR","Material lifecycle receipt unavailable");
 return {receipt:data,material:await teacherMaterialCatalogGet(db,teacherId,input.materialId)};
}
