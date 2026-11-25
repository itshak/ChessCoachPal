import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {addDays,oneToOne,toLocalDateString} from "@/lib/schedule";
import {WorkplaceContextError} from "@/lib/server/teacher-workplace-context";

export const professionalCreditExpiryInput=z.object({workplaceId:z.string().uuid()}).strict();
const candidateLimit=80;
const eventLimit=500;
const redemptionLimit=500;
const displayLimit=24;
const horizonDays=14;

type PackageRow={
 id:string;student_id:string;credits:number;starts_on:string;expires_on:string|null;
 invoice:{status:string}|{status:string}[]|null;
};
type Adjustment={package_id:string;credits_delta:number;kind:string;new_expires_on:string|null};
export type CreditExpiryRow={packageId:string;studentId:string;studentName:string;expiresOn:string;unredeemedUnits:number;
 learnerHref:string};
export type ProfessionalCreditExpiry={
 workplaceId:string;workplaceName:string;asOf:string;through:string;timeZone:string;
} & ({status:"ready";packages:CreditExpiryRow[];truncated:boolean;limit:number}
 | {status:"unavailable"|"scope_too_large"});

/** A present-tense owner read, not a historical snapshot, funding read or spending decision. */
export async function teacherProfessionalCreditExpiry(
 db:SupabaseClient,teacherId:string,input:z.input<typeof professionalCreditExpiryInput>,now=new Date(),
):Promise<ProfessionalCreditExpiry>{
 const {workplaceId}=professionalCreditExpiryInput.parse(input);
 const {data:place,error}=await db.from("workplaces").select("id,name,timezone")
  .eq("teacher_id",teacherId).eq("id",workplaceId.toLowerCase()).is("archived_at",null).maybeSingle();
 if(error)throw new WorkplaceContextError(503,"DATABASE_ERROR","Credit review unavailable");
 if(!place)throw new WorkplaceContextError(404,"WORKPLACE_NOT_FOUND","Active workplace not found");
 let asOf:string;
 try{if(!place.timezone)throw Error();asOf=toLocalDateString(now,place.timezone)}
 catch{throw new WorkplaceContextError(503,"WORKPLACE_TIMEZONE_UNAVAILABLE","Recorded workplace timezone unavailable")}
 const through=addDays(asOf,horizonDays);
 const scope={workplaceId:place.id,workplaceName:place.name,asOf,through,timeZone:place.timezone};
 const empty={...scope,status:"ready" as const,packages:[],truncated:false,limit:displayLimit};
 const unavailable={...scope,status:"unavailable" as const};
 const exceed={...scope,status:"scope_too_large" as const};

 // A base date can move out of the window and an extension can move one in. A
 // missing/truncated branch never certifies a complete count.
 const [base,extensions]=await Promise.all([
  db.from("credit_packages").select("id").eq("teacher_id",teacherId).eq("workplace_id",place.id)
   .lte("starts_on",asOf).gte("expires_on",asOf).lte("expires_on",through).order("id").limit(candidateLimit+1),
  db.from("credit_adjustment_events").select("package_id,credit_packages!inner(workplace_id,starts_on)")
   .eq("teacher_id",teacherId).eq("kind","expiry_extension").eq("credit_packages.workplace_id",place.id)
   .lte("credit_packages.starts_on",asOf).gte("new_expires_on",asOf).lte("new_expires_on",through)
   .order("id").limit(candidateLimit+1),
 ]);
 if(base.error||extensions.error||!base.data||!extensions.data)return unavailable;
 if(base.data.length>candidateLimit||extensions.data.length>candidateLimit)return exceed;
 const ids=[...new Set([...base.data.map(row=>row.id),...extensions.data.map(row=>row.package_id)])];
 if(ids.length>candidateLimit)return exceed;
 if(!ids.length)return empty;

 const [packages,events,redemptions]=await Promise.all([
  db.from("credit_packages").select("id,student_id,credits,starts_on,expires_on,invoice:invoices(status)")
   .eq("teacher_id",teacherId).eq("workplace_id",place.id).in("id",ids).lte("starts_on",asOf)
   .overrideTypes<PackageRow[],{merge:false}>(),
  db.from("credit_adjustment_events").select("package_id,credits_delta,kind,new_expires_on")
   .eq("teacher_id",teacherId).in("package_id",ids).order("recorded_at").order("id").limit(eventLimit+1)
   .overrideTypes<Adjustment[],{merge:false}>(),
  db.from("credit_redemptions").select("package_id").eq("teacher_id",teacherId)
   .in("package_id",ids).not("session_id","is",null).not("student_id","is",null).order("id").limit(redemptionLimit+1),
 ]);
 if(packages.error||events.error||redemptions.error||!packages.data||!events.data||!redemptions.data)
  return unavailable;
 if(events.data.length>eventLimit||redemptions.data.length>redemptionLimit)return exceed;
 const adjustments=new Map<string,{delta:number;expiry:string|null}>();
 for(const row of events.data){
  const a=adjustments.get(row.package_id)??{delta:0,expiry:null};
  a.delta+=row.credits_delta;
  if(row.kind==="expiry_extension"&&row.new_expires_on)a.expiry=row.new_expires_on;
  adjustments.set(row.package_id,a);
 }
 const used=new Map<string,number>();
 for(const row of redemptions.data)used.set(row.package_id,(used.get(row.package_id)??0)+1);
 if(!packages.data.length)return empty;
 const learners=[...new Set(packages.data.map(row=>row.student_id))];
 const [members,profiles]=await Promise.all([
  db.from("workplace_enrollments").select("student_id").eq("teacher_id",teacherId)
   .eq("workplace_id",place.id).in("student_id",learners).is("cancelled_at",null)
   .or(`starts_on.is.null,starts_on.lte.${asOf}`).or(`ends_on.is.null,ends_on.gte.${asOf}`)
   .order("id").limit(eventLimit+1),
  db.from("students").select("id,name").eq("teacher_id",teacherId).is("archived_at",null).in("id",learners),
 ]);
 if(members.error||profiles.error||!members.data||!profiles.data)return unavailable;
 if(members.data.length>eventLimit)return exceed;
 const byId=new Map(profiles.data.map(row=>[row.id,row.name]));
 const activeLearners=new Set(members.data.map(row=>row.student_id));
 const rows=packages.data.flatMap(p=>{
  const status=oneToOne(p.invoice)?.status;
  if((status!=="sent"&&status!=="paid")||!activeLearners.has(p.student_id)||!byId.has(p.student_id))return [];
  const a=adjustments.get(p.id),expiresOn=a?.expiry??p.expires_on;
  const unredeemedUnits=p.credits+(a?.delta??0)-(used.get(p.id)??0);
  return expiresOn!==null&&expiresOn>=asOf&&expiresOn<=through&&unredeemedUnits>0
   ?[{packageId:p.id,studentId:p.student_id,expiresOn,unredeemedUnits}]:[];
 }).sort((a,b)=>a.expiresOn.localeCompare(b.expiresOn)||a.packageId.localeCompare(b.packageId));
 const shown=rows.slice(0,displayLimit);
 if(!shown.length)return empty;
 return {...scope,status:"ready",limit:displayLimit,truncated:rows.length>displayLimit,
  packages:shown.map(row=>({...row,studentName:byId.get(row.studentId)!,learnerHref:"/students/"+row.studentId}))};
}
