import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

function clients(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 return {
  admin:createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  }),
  browserDb:createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  }),
 };
}
test("PARITY:PARITY-student-delete-impact-current-material-schema denies historical links in both website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {admin,browserDb}=clients();
 expect((await browserDb.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const teacherId=(await browserDb.auth.getUser()).data.user!.id;
 const student=await call("ccp_v1_students_create",{
  name:"Delete history guard "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const read=async()=>{
  const web=await page.request.get("/api/students/"+studentId+"?deletePreview=true");
  expect(web.status(),await web.text()).toBe(200);
  const data=await web.json();
  const mcp=await call("ccp_v1_students_delete_impact",{studentId});
  expect(mcp.error).toBeUndefined();
  expect(mcp.data).toEqual(data);
  return data as {canDelete:boolean;updatedAt:string;blockers:Record<string,number>};
 };
 const empty=await read();
 expect(empty.canDelete).toBe(true);
 expect(empty.blockers.materialLinks).toBe(0);
 expect(empty.blockers.materialTeachingEvidence).toBe(0);
 // A real current-schema typed material and two different historical links
 // must block student deletion; no legacy resource/progress tables exist.
 const material=await admin.from("learning_materials").insert({
  teacher_id:teacherId,kind:"external_link",
  title:"Synthetic rook ending "+randomUUID(),
  source_url:"https://lichess.org/study/abcdef",
  description:"Review past practice",
  request_id:randomUUID(),request_hash:randomUUID(),
 }).select("id").single();
 expect(material.error).toBeNull();
 const materialId=material.data!.id as string;
 const relation=await admin.from("material_links").insert({
  teacher_id:teacherId,student_id:studentId,material_id:materialId,
  request_id:randomUUID(),
 });
 expect(relation.error).toBeNull();
 const taught=await admin.from("material_teaching_evidence").insert({
  teacher_id:teacherId,student_id:studentId,material_id:materialId,
  stage:"assigned",occurred_on:"2055-06-20",
  note:"Teacher assigned the rook ending",request_id:randomUUID(),
 });
 expect(taught.error).toBeNull();
 const blocked=await read();
 expect(blocked.canDelete).toBe(false);
 expect(blocked.blockers.materialLinks).toBe(1);
 expect(blocked.blockers.materialTeachingEvidence).toBe(1);
 const websiteDelete=await page.request.delete("/api/students/"+studentId,{
  data:{confirmed:true,expectedUpdatedAt:blocked.updatedAt},
 });
 expect(websiteDelete.status(),await websiteDelete.text()).toBe(409);
 expect((await websiteDelete.json()).code).toBe("HISTORY_DEPENDENCIES");
 const modelDelete=await call("ccp_v1_students_delete",{
  studentId,expectedUpdatedAt:blocked.updatedAt,confirmed:true,
 });
 expect(modelDelete.error?.code).toBe("HISTORY_DEPENDENCIES");
 const survives=await admin.from("students").select("id").eq("id",studentId).single();
 expect(survives.error).toBeNull();
 const still=await admin.from("material_teaching_evidence").select("id")
  .eq("student_id",studentId);
 expect(still.error).toBeNull();
 expect(still.data).toHaveLength(1);
});

test("PARITY:PARITY-student-delete-revision-race-and-tenant-isolation allow one approved empty-profile removal",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {admin,browserDb}=clients();
 expect((await browserDb.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const student=await call("ccp_v1_students_create",{
  name:"Deletable empty profile "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const before=await call("ccp_v1_students_delete_impact",{studentId});
 expect(before.error).toBeUndefined();
 expect(before.data.canDelete).toBe(true);
 const unreviewed=await page.request.delete("/api/students/"+studentId,{
  data:{confirmed:true},
 });
 expect(unreviewed.status()).toBe(400);
 const unconfirmed=await call("ccp_v1_students_delete",{
  studentId,expectedUpdatedAt:before.data.updatedAt,
 });
 expect(unconfirmed.error?.code).toBe("VALIDATION_ERROR");
 const [web,mcp]=await Promise.all([
  page.request.delete("/api/students/"+studentId,{
   data:{confirmed:true,expectedUpdatedAt:before.data.updatedAt},
  }),
  call("ccp_v1_students_delete",{
   studentId,expectedUpdatedAt:before.data.updatedAt,confirmed:true,
  }),
 ]);
 const websiteWon=web.status()===200,mcpWon=mcp.error===undefined;
 expect(Number(websiteWon)+Number(mcpWon)).toBe(1);
 if(!websiteWon)expect([404,409]).toContain(web.status());
 if(!mcpWon)expect(["NOT_FOUND","CONFLICT"]).toContain(mcp.error?.code);
 const deleted=await admin.from("students").select("id").eq("id",studentId).maybeSingle();
 expect(deleted.error).toBeNull();
 expect(deleted.data).toBeNull();

 // A different real tenant's existing student is never exposable or deleted.
 const foreignEmail="foreign-delete-"+randomUUID()+"@example.com";
 const foreign=await admin.auth.admin.createUser({
  email:foreignEmail,password:"SyntheticDifferentTeacher-123!",email_confirm:true,
 });
 expect(foreign.error).toBeNull();
 const foreignId=foreign.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:foreignId,email:foreignEmail,display_name:"Foreign chess teacher",
   hosted_enforced:false,
  })).error).toBeNull();
  const other=await admin.from("students").insert({
   teacher_id:foreignId,name:"Not your pupil "+randomUUID(),
  }).select("id,updated_at").single();
  expect(other.error).toBeNull();
  const target=other.data!.id as string;
  const foreignPreview=await page.request.get("/api/students/"+target+"?deletePreview=true");
  expect(foreignPreview.status()).toBe(404);
  const deniedModel=await call("ccp_v1_students_delete_impact",{studentId:target});
  expect(deniedModel.error?.code).toBe("NOT_FOUND");
  const foreignDelete=await page.request.delete("/api/students/"+target,{
   data:{confirmed:true,expectedUpdatedAt:other.data!.updated_at},
  });
  expect(foreignDelete.status()).toBe(404);
  const modelDelete=await call("ccp_v1_students_delete",{
   studentId:target,expectedUpdatedAt:other.data!.updated_at,confirmed:true,
  });
  expect(modelDelete.error?.code).toBe("NOT_FOUND");
  const remains=await admin.from("students").select("id").eq("id",target).single();
  expect(remains.error).toBeNull();
 }finally{await admin.auth.admin.deleteUser(foreignId);}
});
