import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";

const uuid=z.string().uuid();
export const legacyMaterialBridgeListSchema=z.object({
  studentId:uuid.optional(),sessionId:uuid.optional(),
  limit:z.number().int().min(1).max(100).default(30),
  offset:z.number().int().min(0).max(100000).default(0),
}).strict().refine(x=>Boolean(x.studentId||x.sessionId),{
  message:"Specify one student or teaching session",
});
export const legacyMaterialBridgeChangeSchema=z.object({
  resourceId:uuid,materialId:uuid,
  action:z.enum(["link","unlink"]),
  requestId:uuid,confirmed:z.literal(true),
}).strict();
export type LegacyMaterialBridgeList=z.infer<typeof legacyMaterialBridgeListSchema>;
export type LegacyMaterialBridgeChange=z.infer<typeof legacyMaterialBridgeChangeSchema>;
type Db=SupabaseClient;
export class LegacyMaterialBridgeError extends Error{
  constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>new LegacyMaterialBridgeError(status,code,message);

/**
 * A historical chess learning resource is evidence of the *original* claim.
 * This explicit mapping labels the same source with one newer typed catalog
 * identity; it never modifies the resource, marks work as taught or backfills
 * invented chess stages/ratings. One owner-scoped service for website and MCP.
 */
export async function teacherLegacyMaterialBridgeList(
  db:Db,teacherId:string,input:LegacyMaterialBridgeList
){
  for(const [table,id] of [
    ["students",input.studentId],["teaching_sessions",input.sessionId],
  ] as const){
    if(!id)continue;
    const {data,error}=await db.from(table).select("id")
      .eq("id",id).eq("teacher_id",teacherId).maybeSingle();
    if(error)throw fail(500,"DATABASE_ERROR","Material ownership verification failed");
    if(!data)throw fail(404,"NOT_FOUND","Student or session not found");
  }
  let query=db.from("chess_learning_resources")
    .select("id,student_id,session_id,label,url,resource_type,provider_study_id,provider_chapter_id,created_at",{count:"exact"})
    .eq("teacher_id",teacherId).order("created_at",{ascending:false}).order("id")
    .range(input.offset,input.offset+input.limit);
  if(input.studentId&&input.sessionId)
    query=query.or("student_id.eq."+input.studentId+",session_id.eq."+input.sessionId);
  else if(input.studentId)query=query.eq("student_id",input.studentId);
  else query=query.eq("session_id",input.sessionId!);
  const {data,error,count}=await query;
  if(error)throw fail(500,"DATABASE_ERROR","Historical learning resources unavailable");
  const page=(data??[]).slice(0,input.limit);
  const ids=page.map(x=>x.id);
  const links=ids.length?
    await db.from("learning_material_legacy_links")
      .select("resource_id,material_id,linked_at").eq("teacher_id",teacherId).in("resource_id",ids):
    {data:[],error:null};
  if(links.error)throw fail(500,"DATABASE_ERROR","Historical link mapping unavailable");
  const linkedIds=[...new Set((links.data??[]).map(x=>x.material_id))];
  const materials=linkedIds.length?
    await db.from("learning_materials").select("id,title,kind,source_url,archived_at")
      .eq("teacher_id",teacherId).in("id",linkedIds):
    {data:[],error:null};
  if(materials.error)throw fail(500,"DATABASE_ERROR","Typed material mapping unavailable");
  const byResource=new Map((links.data??[]).map(x=>[x.resource_id,x]));
  const byMaterial=new Map((materials.data??[]).map(x=>[x.id,x]));
  return {
    entries:page.map(resource=>{
      const link=byResource.get(resource.id);
      return {...resource,
        mappedMaterial:link?byMaterial.get(link.material_id)??null:null,
        linkedAt:link?.linked_at??null,
      };
    }),
    total:count??0,
    nextOffset:(data?.length??0)>input.limit?input.offset+input.limit:null,
    truthBasis:"teacher_confirmed_mapping_only",
  };
}
export async function teacherLegacyMaterialBridgeChange(
 db:Db,_teacherId:string,input:LegacyMaterialBridgeChange
){
 const {data,error}=await db.rpc("ccp_legacy_material_bridge_change",{
   p_resource_id:input.resourceId,p_material_id:input.materialId,
   p_action:input.action,p_request_id:input.requestId,
 });
 if(error){
   if(/IDEMPOTENCY_CONFLICT/.test(error.message))
     throw fail(409,"IDEMPOTENCY_CONFLICT","Request ID was already used for a different link");
   if(/ALREADY_LINKED|RESOURCE_ALREADY_MAPPED/.test(error.message))
     throw fail(409,"CONFLICT","Legacy resource is already mapped; unlink before remapping");
   if(/MATERIAL_ARCHIVED/.test(error.message))
     throw fail(409,"MATERIAL_ARCHIVED","Restore the material before linking old teaching history");
   if(/INCOMPATIBLE_TYPES/.test(error.message))
     throw fail(409,"INCOMPATIBLE_TYPES","Link a Lichess study to a typed study chapter or external link");
   if(/NOT_FOUND|MAPPING_NOT_FOUND/.test(error.message))
     throw fail(404,"NOT_FOUND","Learning resource or material not found");
   if(/VALIDATION_ERROR/.test(error.message))
     throw fail(400,"VALIDATION_ERROR","Invalid legacy-to-typed material link");
   throw fail(500,"DATABASE_ERROR","Unable to save historical material link");
 }
 if(!data || typeof data!=="object" || data.resourceId!==input.resourceId)
   throw fail(500,"DATABASE_ERROR","Invalid material link receipt");
 return data as {resourceId:string;materialId:string;action:"link"|"unlink";replayed:boolean};
}
