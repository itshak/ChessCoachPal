import {randomUUID} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";

/**
 * Synthetic-only published plan with an explicit SQL active-student ceiling.
 * Test fixtures must NEVER write inherited teachers.hosted_* fields.
 * A teacher's previous plan can be restored; published plan versions themselves
 * are immutable and deliberately not deleted.
 */
export async function configureSyntheticStudentCapacity(
 admin:SupabaseClient,teacherId:string,maxActiveStudents:number,
):Promise<{planId:string;originalPlanVersionId:string|null;restore:()=>Promise<void>}>{
 if(!Number.isSafeInteger(maxActiveStudents)||maxActiveStudents<0)
  throw new Error("Invalid synthetic capacity");
 const initial=await admin.from("teacher_entitlement_state")
  .select("baseline_plan_version_id").eq("teacher_id",teacherId).single();
 if(initial.error||!initial.data)
  throw new Error("Cannot load synthetic teacher entitlement baseline: "+initial.error?.message);
 const plan=await admin.from("plan_versions").insert({
  code:"test_"+randomUUID().replaceAll("-",""),version:1,lifecycle:"draft",
 }).select("id").single();
 if(plan.error||!plan.data)throw new Error("Cannot create synthetic plan: "+plan.error?.message);
 const planId=plan.data.id as string;
 const caps=await admin.from("plan_capabilities").insert([
  {plan_version_id:planId,capability_key:"students.active",
   capability_kind:"integer_limit",integer_value:maxActiveStudents,unlimited:false},
  {plan_version_id:planId,capability_key:"workplaces.professional",
   capability_kind:"integer_limit",integer_value:null,unlimited:true},
  {plan_version_id:planId,capability_key:"reports.publish",
   capability_kind:"boolean",boolean_value:false,unlimited:false},
 ]);
 if(caps.error)throw new Error("Cannot define synthetic capabilities: "+caps.error.message);
 const published=await admin.from("plan_versions").update({
  lifecycle:"published",effective_at:"2020-01-01T00:00:00Z",
 }).eq("id",planId);
 if(published.error)throw new Error("Cannot publish synthetic plan: "+published.error.message);
 const assigned=await admin.from("teacher_entitlement_state")
  .update({baseline_plan_version_id:planId}).eq("teacher_id",teacherId);
 if(assigned.error)throw new Error("Cannot apply synthetic capacity: "+assigned.error.message);
 return {
  planId,
  originalPlanVersionId:initial.data.baseline_plan_version_id as string|null,
  restore:async()=>{
   const result=await admin.from("teacher_entitlement_state")
    .update({baseline_plan_version_id:initial.data.baseline_plan_version_id})
    .eq("teacher_id",teacherId);
   if(result.error)throw new Error("Cannot restore original plan: "+result.error.message);
  },
 };
}
