import {createHash,randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {dayOfWeek} from "../lib/schedule";

test("seven concurrent-role RPCs enforce their actor and explicit service target contracts",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
 const client=()=>createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
 const owner=client(),foreign=client(),anonymous=client();
 const userIds:string[]=[];
 const createTeacher=async(viewer:ReturnType<typeof client>)=>{
  const email="routine-roles-"+randomUUID()+"@example.com",password="SyntheticRoutineRoles-123!";
  const identity=await service.auth.admin.createUser({email,password,email_confirm:true});
  expect(identity.error).toBeNull();
  const id=identity.data.user!.id;
  userIds.push(id);
  expect((await service.from("teachers").insert({id,email,display_name:"Synthetic RPC role fixture"})).error)
   .toBeNull();
  expect((await viewer.auth.signInWithPassword({email,password})).error).toBeNull();
  return id;
 };
 try{
  const teacherId=await createTeacher(owner),foreignId=await createTeacher(foreign);
  const workplace=await service.from("workplaces").select("id").eq("teacher_id",teacherId).eq("kind","personal").single();
  expect(workplace.error).toBeNull();
  const workplaceId=workplace.data!.id;
  const student=await service.from("students").insert({teacher_id:teacherId,name:"Synthetic RPC learner"})
   .select("id,updated_at").single();
  expect(student.error).toBeNull();
  const studentId=student.data!.id;
  expect((await service.from("workplace_enrollments").insert({
   teacher_id:teacherId,student_id:studentId,workplace_id:workplaceId,source:"manual",starts_on:"2020-01-01",
  })).error).toBeNull();
  const date="2060-01-08";
  const slot=await service.from("lesson_slots").insert({
   teacher_id:teacherId,student_id:studentId,workplace_id:workplaceId,start_date:date,
   day_of_week:dayOfWeek(date),start_time:"14:00:00",duration_minutes:45,
  }).select("id").single();
  expect(slot.error).toBeNull();
  const p_rows=[{
   teacher_id:teacherId,student_id:studentId,workplace_id:workplaceId,slot_id:slot.data!.id,
   slot_occurrence_date:date,starts_at:date+"T14:00:00Z",duration_minutes:45,
   local_timezone:"UTC",is_home_visit:false,slot_rate_cents:null,
  }];
  const materialize="ccp_canonical_slot_materialize";
  const compositeDenial={code:"42501",message:"CANONICAL_MATERIALIZE_SLOT_NOT_OWNED"};
  expect((await foreign.rpc(materialize,{p_rows})).error).toMatchObject(compositeDenial);
  expect((await foreign.rpc(materialize,{p_rows,p_teacher_id:teacherId})).error)
   .toMatchObject({code:"42501",message:"UNAUTHENTICATED"});
  expect((await service.rpc(materialize,{p_rows})).error).toMatchObject({code:"42501",message:"UNAUTHENTICATED"});
  expect((await service.rpc(materialize,{p_rows,p_teacher_id:foreignId})).error).toMatchObject(compositeDenial);
  const noOccurrence=await service.from("teaching_sessions").select("id").eq("slot_id",slot.data!.id);
  expect(noOccurrence.error).toBeNull();
  expect(noOccurrence.data).toEqual([]);
  const first=await service.rpc(materialize,{p_rows,p_teacher_id:teacherId});
  expect(first.error).toBeNull();
  expect(first.data).toEqual({planned:1,inserted:1});
  const replay=await owner.rpc(materialize,{p_rows});
  expect(replay.error).toBeNull();
  expect(replay.data).toEqual({planned:1,inserted:0});
  const session=await service.from("teaching_sessions").select("id,title,updated_at")
   .eq("slot_id",slot.data!.id).single();
  expect(session.error).toBeNull();

  const mutation={
   p_operation:"students.update",p_payload:{studentId,name:"Reviewed synthetic rename"},
   p_expected_updated_at:student.data!.updated_at,p_idempotency_key:randomUUID(),p_client_id:"synthetic-role-test",
  };
  const commit={
   p_session_id:session.data!.id,p_changes:{title:"Reviewed synthetic title"},p_attendance:[],
   p_expected_updated_at:session.data!.updated_at,p_idempotency_key:randomUUID(),
  };
  const material={
   id:randomUUID(),teacher_id:teacherId,kind:"external_link",title:"Protected synthetic entry",
   source_url:"https://example.invalid/synthetic",request_id:randomUUID(),request_hash:"a".repeat(64),
  };
  const importRows={learning_materials:[material]};
  const restored=await owner.rpc("ccp_restore_canonical_chess_rows",{p_tables:importRows});
  expect(restored.error).toBeNull();
  expect(restored.data).toMatchObject({learning_materials:1});
  const modified={...material,title:"Denied foreign catalog rename"};
  const invalidTables={contacts:[{id:randomUUID(),display_name:"Must roll back"}],learning_materials:[modified]};
  const backup={
   p_tables:invalidTables,p_display_name:null,p_digest:createHash("sha256").update(JSON.stringify(invalidTables)).digest("hex"),
  };
  const capability={p_teacher:teacherId,p_capability_key:"students.active"};
  const matrix=[
   ["agent_coaching_mutate",mutation,{code:"P0001",message:"UNAUTHENTICATED"}],
   ["ccp_teacher_session_commit",commit,{code:"42501",message:"UNAUTHENTICATED"}],
   ["ccp_restore_canonical_chess_rows",{p_tables:{learning_materials:[modified]}},{code:"42501",message:"UNAUTHENTICATED"}],
   ["ccp_teacher_backup_restore",backup,{code:"42501",message:"UNAUTHENTICATED"}],
   ["ccp_entitlement_summary",{},{code:"42501",message:"FORBIDDEN"}],
  ] as const;
  for(const [name,args,error] of matrix){
   expect((await service.rpc(name,args)).error,name+" headless service").toMatchObject(error);
   expect((await anonymous.rpc(name,args)).error?.code,name+" anonymous").toBe("42501");
  }
  for(const [name,args] of [[materialize,{p_rows,p_teacher_id:teacherId}],["ccp_effective_capability",capability]] as const)
   expect((await anonymous.rpc(name,args)).error?.code,name+" anonymous").toBe("42501");

  expect((await foreign.rpc("agent_coaching_mutate",mutation)).error)
   .toMatchObject({code:"P0001",message:"CONFLICT_OR_NOT_FOUND"});
  expect((await foreign.rpc("ccp_teacher_session_commit",commit)).error)
   .toMatchObject({code:"42501",message:"SESSION_NOT_FOUND"});
  expect((await foreign.rpc("ccp_restore_canonical_chess_rows",{p_tables:{learning_materials:[modified]}})).error)
   .toMatchObject({code:"42501",message:"IMPORT_FOREIGN_RECORD:learning_materials"});
  expect((await foreign.rpc("ccp_teacher_backup_restore",backup)).error)
   .toMatchObject({code:"42501",message:"IMPORT_FOREIGN_RECORD:learning_materials"});
  expect((await foreign.rpc("ccp_effective_capability",capability)).error)
   .toMatchObject({code:"42501",message:"FORBIDDEN"});
  const serviceCap=await service.rpc("ccp_effective_capability",capability);
  const ownerCap=await owner.rpc("ccp_effective_capability",capability);
  expect(serviceCap.error).toBeNull();
  expect(ownerCap.error).toBeNull();
  expect(serviceCap.data).toMatchObject({planVersionId:ownerCap.data?.planVersionId,limit:ownerCap.data?.limit});
  for(const [db,count] of [[owner,1],[foreign,0]] as const){
   const ownSummary=await db.rpc("ccp_entitlement_summary");
   expect(ownSummary.error).toBeNull();
   expect(ownSummary.data?.activeStudentCount).toBe(count);
  }

  const receipts=await service.from("agent_tool_receipts").select("teacher_id,idempotency_key")
   .in("idempotency_key",[mutation.p_idempotency_key,commit.p_idempotency_key]);
  expect(receipts.error).toBeNull();
  expect(receipts.data).toEqual([]);
  const importReceipt=await service.from("teacher_backup_import_receipts").select("teacher_id").eq("digest",backup.p_digest);
  expect(importReceipt.error).toBeNull();
  expect(importReceipt.data).toEqual([]);
  const rolledBack=await service.from("contacts").select("id").eq("id",invalidTables.contacts[0].id);
  expect(rolledBack.error).toBeNull();
  expect(rolledBack.data).toEqual([]);
  const keptMaterial=await service.from("learning_materials").select("title").eq("id",material.id).single();
  expect(keptMaterial.error).toBeNull();
  expect(keptMaterial.data?.title).toBe(material.title);
  const keptSession=await service.from("teaching_sessions").select("id,title,updated_at")
   .eq("slot_id",slot.data!.id).single();
  expect(keptSession.error).toBeNull();
  expect(keptSession.data).toEqual(session.data);
  const acceptedMutation=await owner.rpc("agent_coaching_mutate",mutation);
  expect(acceptedMutation.error).toBeNull();
  expect(acceptedMutation.data).toMatchObject({entityId:studentId,actorId:teacherId});
  expect((await owner.rpc("ccp_teacher_session_commit",commit)).error).toBeNull();
  expect((await owner.rpc("ccp_teacher_backup_restore",{
   p_tables:importRows,p_display_name:null,p_digest:createHash("sha256").update(JSON.stringify(importRows)).digest("hex"),
  })).error).toBeNull();
 }finally{
  for(const id of userIds.reverse())expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
