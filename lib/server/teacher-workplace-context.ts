import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

/** A workplace is a contextual filter, never an authorization grant. */
const uuid=z.string().uuid();
export const workplaceContextUpdateSchema=z.object({
  selectedWorkplaceId:uuid.nullable(),
  expectedSelectedWorkplaceId:uuid.nullable(),
  confirmed:z.literal(true),
}).strict();
export type WorkplaceContextUpdate=z.infer<typeof workplaceContextUpdateSchema>;

export class WorkplaceContextError extends Error {
  constructor(public readonly status:number,public readonly code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string):never=>{
  throw new WorkplaceContextError(status,code,message);
};
type Db=SupabaseClient;
export interface WorkplaceContextItem {
  id:string;name:string;timezone:string;currency:string;locale:string;
}
export interface WorkplaceContextState {
  selectedWorkplaceId:string|null;
  selectionWasStale:boolean;
  selectedWorkplace:WorkplaceContextItem|null;
  workplaces:WorkplaceContextItem[];
}
/** Preserve the raw owner row only for an internal compare-and-set. Never expose a stale ID. */
async function readWorkplaceContext(db:Db,teacherId:string):Promise<{
 stored:string|null;state:WorkplaceContextState;
}> {
  const [teacher,locations]=await Promise.all([
    db.from("teachers").select("id,selected_workplace_id")
      .eq("id",teacherId).maybeSingle(),
    db.from("workplaces").select("id,name,timezone,currency,locale")
      .eq("teacher_id",teacherId).is("archived_at",null).order("name").order("id").limit(1000),
  ]);
  if(teacher.error||locations.error)
    fail(503,"DATABASE_ERROR","Workplace context unavailable");
  if(!teacher.data)return fail(404,"NOT_FOUND","Teacher not found");
  if((locations.data??[]).length>=1000)
    fail(413,"TOO_MANY_WORKPLACES","Workplace context list exceeds safe limit");
  const workplaces=(locations.data??[]) as WorkplaceContextItem[];
  const stored=teacher.data.selected_workplace_id as string|null;
  const selectedWorkplace=workplaces.find(x=>x.id===stored)??null;
  return {stored,state:{selectedWorkplaceId:selectedWorkplace?.id??null,
    selectionWasStale:Boolean(stored&&!selectedWorkplace),selectedWorkplace,workplaces}};
}
/** Server response is identical via authenticated browser and delegated MCP. */
export async function teacherWorkplaceContextGet(db:Db,teacherId:string):Promise<WorkplaceContextState>{
  return (await readWorkplaceContext(db,teacherId)).state;
}
/** A retry of the same selection is idempotent; a stale conflicting tab fails. */
export async function teacherWorkplaceContextSet(db:Db,teacherId:string,
  raw:WorkplaceContextUpdate){
  const value=workplaceContextUpdateSchema.parse(raw);
  if(value.selectedWorkplaceId!==null){
    const {data,error}=await db.from("workplaces").select("id")
      .eq("teacher_id",teacherId).eq("id",value.selectedWorkplaceId)
       .is("archived_at",null).maybeSingle();
    if(error)fail(503,"DATABASE_ERROR","Unable to validate selected workplace");
    if(!data)fail(404,"WORKPLACE_NOT_FOUND","Workplace not found or not owned by the teacher");
  }
  let q=db.from("teachers").update({selected_workplace_id:value.selectedWorkplaceId})
    .eq("id",teacherId);
  let expectedStored=value.expectedSelectedWorkplaceId;
  if(expectedStored===null){
    const current=await readWorkplaceContext(db,teacherId);
    // The public value is All for an archived preference. Recover by matching
    // that same stored ID, not by weakening the compare-and-set for stale tabs.
    if(current.state.selectionWasStale)expectedStored=current.stored;
  }
  q=expectedStored===null?
    q.is("selected_workplace_id",null):q.eq("selected_workplace_id",expectedStored);
  const {data,error}=await q.select("id").maybeSingle();
  if(error){
    if(error.code==="23503")fail(404,"WORKPLACE_NOT_FOUND","Workplace no longer exists");
    fail(503,"DATABASE_ERROR","Unable to update workplace context");
  }
  const state=await teacherWorkplaceContextGet(db,teacherId);
  if(data)return {...state,replayed:false};
  if(state.selectedWorkplaceId===value.selectedWorkplaceId)
    return {...state,replayed:true};
  return fail(409,"STALE_WORKPLACE_CONTEXT","Workplace selection changed; reload to choose again");
}
