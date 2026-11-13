import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {addDays,toLocalDateString} from "@/lib/schedule";
import {getPolicy} from "@/lib/server/scheduling";
import {planCanonicalOccurrences,type CanonicalSlot,
  type CalendarWorkplace} from "@/lib/server/canonical-calendar-service";

type Db=SupabaseClient;
const uuid=z.string().uuid();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const patch=z.object({
 dayOfWeek:z.number().int().min(0).max(6).optional(),
 startTime:time.optional(),
 durationMinutes:z.number().int().min(15).max(480).optional(),
 startDate:date.optional(),
 endDate:date.nullable().optional(),
 rateCents:z.number().int().min(0).max(999999999).nullable().optional(),
 isHomeVisit:z.boolean().optional(),
 active:z.boolean().optional(),
 workplaceId:uuid.nullable().optional(),
}).strict().refine(x=>Object.keys(x).length>0,{message:"No slot changes supplied"});
export const canonicalSlotCreateSchema=z.object({
 studentId:uuid,workplaceId:uuid.nullable().optional(),
 dayOfWeek:z.number().int().min(0).max(6),
 startTime:time,durationMinutes:z.number().int().min(15).max(480).default(30),
 startDate:date.optional(),endDate:date.nullable().optional(),
 rateCents:z.number().int().min(0).max(999999999).nullable().default(null),
 isHomeVisit:z.boolean().default(false),
 idempotencyKey:uuid,
}).strict();

export type CanonicalSlotCreateInput=z.input<typeof canonicalSlotCreateSchema>;
export const canonicalSlotEditSchema=z.object({
 changes:patch,expectedUpdatedAt:z.string().datetime({offset:true}),
 idempotencyKey:uuid,
}).strict();
export const canonicalSlotDeleteSchema=z.object({
 idempotencyKey:uuid,
}).strict();

export class CanonicalSlotError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string):never=>{
 throw new CanonicalSlotError(status,code,message);
};
export async function canonicalSlotsList(db:Db,teacherId:string,
 opts:{studentId?:string;activeOnly?:boolean}={}){
 if(opts.studentId&&!uuid.safeParse(opts.studentId).success)
  fail(400,"VALIDATION_ERROR","Invalid student ID");
 const all:Record<string,unknown>[]=[];
 for(let offset=0;;offset+=500){
  let q=db.from("lesson_slots").select("*").eq("teacher_id",teacherId)
    .order("day_of_week").order("start_time").order("id");
  if(opts.studentId)q=q.eq("student_id",opts.studentId);
  if(opts.activeOnly)q=q.eq("active",true);
  const {data,error}=await q.range(offset,offset+499);
  if(error)fail(500,"DATABASE_ERROR","Unable to read canonical recurring slots");
  all.push(...(data??[]));
  if(all.length>20000)fail(413,"ROSTER_TOO_LARGE","Too many recurring slots");
  if((data?.length??0)<500)break;
 }
 return all;
}
/** A single SQL transaction creates the recurring rule, snapshots the
 * upcoming teaching roster, and saves the idempotency receipt. Both browser
 * and delegated MCP use this exact validator and SQL command.
 */
export async function canonicalSlotCreate(
 db:Db,teacherId:string,input:z.input<typeof canonicalSlotCreateSchema>
){
 const parsed=canonicalSlotCreateSchema.safeParse(input);
 if(!parsed.success)fail(400,"VALIDATION_ERROR","Invalid recurring-slot details");
 const x=parsed.data!;
 const policy=await getPolicy(db,teacherId);
 const from=toLocalDateString(new Date(),policy.timezone);
 const to=addDays(from,56),startDate=x.startDate??from;
 if(x.endDate&&x.endDate<startDate)
  fail(400,"VALIDATION_ERROR","End date cannot precede slot start");
 const workplaces:CalendarWorkplace[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from("workplaces")
   .select("id,timezone").eq("teacher_id",teacherId)
   .order("created_at").order("id").range(offset,offset+499);
  if(error)fail(500,"DATABASE_ERROR","Unable to load teacher workplaces");
  workplaces.push(...(data??[]));
  if(workplaces.length>20000)
   fail(413,"ROSTER_TOO_LARGE","Workplace inventory too large");
  if((data?.length??0)<500)break;
 }
 if(!workplaces.length)fail(409,"CONFLICT","Personal workplace is unavailable");
 const slot={
  id:x.idempotencyKey,teacher_id:teacherId,student_id:x.studentId,
  workplace_id:x.workplaceId??null,day_of_week:x.dayOfWeek,
  start_time:x.startTime,duration_minutes:x.durationMinutes,
  start_date:startDate,end_date:x.endDate??null,
  rate_cents:x.rateCents,is_home_visit:x.isHomeVisit,active:true,
 } as CanonicalSlot;
 let planned;
 try{
  planned=planCanonicalOccurrences(teacherId,[slot],workplaces,
    workplaces[0].id,policy.timezone,from,to);
 }catch(e){
  fail(400,"VALIDATION_ERROR",e instanceof Error?e.message:"Invalid recurrence plan");
 }
 const {data,error}=await db.rpc("ccp_canonical_slot_create",{
  p_student_id:x.studentId,p_workplace_id:x.workplaceId??null,
  p_day_of_week:x.dayOfWeek,p_start_time:x.startTime,
  p_duration_minutes:x.durationMinutes,
  p_start_date:startDate,p_end_date:x.endDate??null,
  p_rate_cents:x.rateCents,p_is_home_visit:x.isHomeVisit,
  p_rows:planned,p_from:from,p_to:to,
  p_idempotency_key:x.idempotencyKey,
 });
 if(error){
  if(/CANONICAL_SLOT_CREATE_REPLAY_CONFLICT|SESSION_CONFLICT/.test(error.message)||
    ["23505","23P01"].includes(error.code))
   fail(409,"CONFLICT","Recurring slot request conflicts with existing teaching history");
  if(/CANONICAL_SLOT_(?:STUDENT_NOT_FOUND|ENROLLMENT_REQUIRED)/.test(error.message)||
    error.code==="42501")fail(404,"NOT_FOUND","Active student or workplace enrollment not found");
  if(/CANONICAL_SLOT_(?:CREATE_INVALID|INCOMPLETE|PLAN|DUPLICATE)/.test(error.message)||
    error.code==="22023")fail(400,"VALIDATION_ERROR","Invalid recurring-slot plan");
  fail(500,"DATABASE_ERROR","Unable to atomically create recurring slot");
 }
 return data;
}

export async function canonicalSlotUpdate(
 db:Db,teacherId:string,slotId:string,
 input:z.input<typeof canonicalSlotEditSchema>
){
 if(!uuid.safeParse(slotId).success)
  fail(400,"VALIDATION_ERROR","Invalid slot ID");
 const parsed=canonicalSlotEditSchema.safeParse(input);
 if(!parsed.success)fail(400,"VALIDATION_ERROR","Invalid recurring-slot edit or revision");
 const {data:slot,error:slotError}=await db.from("lesson_slots")
  .select("*").eq("teacher_id",teacherId).eq("id",slotId).maybeSingle();
 if(slotError)fail(500,"DATABASE_ERROR","Unable to read recurring slot");
 if(!slot)fail(404,"NOT_FOUND","Recurring slot not found");
 const policy=await getPolicy(db,teacherId);
 const workplaces:CalendarWorkplace[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from("workplaces")
    .select("id,timezone").eq("teacher_id",teacherId)
    .order("created_at").order("id").range(offset,offset+499);
  if(error)fail(500,"DATABASE_ERROR","Unable to load teacher workplaces");
  workplaces.push(...(data??[]));
  if(workplaces.length>20000)
   fail(413,"ROSTER_TOO_LARGE","Workplace inventory too large");
  if((data?.length??0)<500)break;
 }
 if(!workplaces.length)fail(409,"CONFLICT","Personal workplace is unavailable");
 const changes=parsed.data!.changes;
 const updated:CanonicalSlot={...(slot as CanonicalSlot),
  ...(changes.dayOfWeek!==undefined?{day_of_week:changes.dayOfWeek}:{}),
  ...(changes.startTime!==undefined?{start_time:changes.startTime}:{}),
  ...(changes.durationMinutes!==undefined?{duration_minutes:changes.durationMinutes}:{}),
  ...(changes.startDate!==undefined?{start_date:changes.startDate}:{}),
  ...(changes.endDate!==undefined?{end_date:changes.endDate}:{}),
  ...(changes.rateCents!==undefined?{rate_cents:changes.rateCents}:{}),
  ...(changes.isHomeVisit!==undefined?{is_home_visit:changes.isHomeVisit}:{}),
  ...(changes.active!==undefined?{active:changes.active}:{}),
  ...(changes.workplaceId!==undefined?{workplace_id:changes.workplaceId}:{}),
 };
 if(updated.end_date&&updated.end_date<updated.start_date)
  fail(400,"VALIDATION_ERROR","End date cannot precede slot start");
 const from=toLocalDateString(new Date(),policy.timezone);
 const to=addDays(from,56);
 let planned;
 try{
  planned=planCanonicalOccurrences(teacherId,[updated],workplaces,
    workplaces[0].id,policy.timezone,from,to);
 }catch(e){
  fail(400,"VALIDATION_ERROR",e instanceof Error?e.message:"Invalid recurrence plan");
 }
 const {data,error}=await db.rpc("ccp_canonical_slot_update",{
  p_slot_id:slotId,p_changes:changes,
  p_expected_updated_at:parsed.data!.expectedUpdatedAt,
  p_rows:planned,p_from:from,p_to:to,
  p_idempotency_key:parsed.data!.idempotencyKey,
 });
 if(error){
  if(/CANONICAL_SLOT_(?:REPLAY|REVISION)_CONFLICT|SESSION_CONFLICT/.test(error.message)||
    ["23505","23P01"].includes(error.code))
   fail(409,"CONFLICT","Slot changed or conflicts with protected teaching sessions");
  if(/CANONICAL_SLOT_NOT_FOUND|CANONICAL_SLOT_WORKPLACE_NOT_FOUND/.test(error.message)||
     error.code==="42501")fail(404,"NOT_FOUND","Slot or workplace not found");
  if(/CANONICAL_SLOT_(?:INVALID|INCOMPLETE|PLAN|DUPLICATE|TOO_MANY)/.test(error.message)||
     error.code==="22023")fail(400,"VALIDATION_ERROR","Invalid recurring-slot plan");
  fail(500,"DATABASE_ERROR","Unable to atomically reconcile recurring lessons");
 }
 return data;
}
export async function canonicalSlotDelete(
 db:Db,teacherId:string,slotId:string,
 input:z.input<typeof canonicalSlotDeleteSchema>
){
 void teacherId; // auth.uid() in the SQL command is authoritative.
 if(!uuid.safeParse(slotId).success||
   !canonicalSlotDeleteSchema.safeParse(input).success)
  fail(400,"VALIDATION_ERROR","Invalid recurring-slot delete request");
 const {data,error}=await db.rpc("ccp_canonical_slot_delete",{
  p_slot_id:slotId,p_idempotency_key:input.idempotencyKey,
 });
 if(error){
  if(error.message.includes("CANONICAL_SLOT_REPLAY_CONFLICT")||error.code==="23505")
   fail(409,"CONFLICT","Slot delete request conflicts with another operation");
  if(error.message.includes("CANONICAL_SLOT_NOT_FOUND")||error.code==="42501")
   fail(404,"NOT_FOUND","Recurring slot not found");
  if(error.message.includes("CANONICAL_SLOT_TOO_MANY"))
   fail(413,"ROSTER_TOO_LARGE","Too many recurring occurrences");
  fail(500,"DATABASE_ERROR","Unable to delete recurring slot safely");
 }
 return data;
}
