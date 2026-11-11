import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {signInAsTeacher} from "./helpers/auth";

const key=()=>randomUUID();
const row=(name:string,sourceRow:number)=>({
 studentName:name,sourceRow,familyKey:"solo:"+name.toLowerCase()+":"+sourceRow,
 birthdate:null,level:null,teacherNotes:null,guardianName:null,familyName:null,
 email:null,phone:null,secondaryName:null,secondaryEmail:null,secondaryPhone:null,
});
test("spreadsheet import rollback is atomic when hosted quota is exceeded",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="atomic-import-"+key()+"@example.com",password="SyntheticImport-123!";
 const {data:user,error:authError}=await admin.auth.admin.createUser({
   email,password,email_confirm:true,
 });
 expect(authError).toBeNull();
 const id=user.user!.id;
 expect((await admin.from("teachers").insert({
   id,email,display_name:"Atomic import synthetic",
   hosted_plan:"free",hosted_enforced:true,hosted_max_active_students:1,
 })).error).toBeNull();
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
 const idempotencyKey=key();
 const name1="Atomic learner one "+key(),name2="Atomic learner two "+key();
 const rows=[row(name1,2),row(name2,3)];
 const failed=await auth.rpc("ccp_teacher_spreadsheet_commit",{
   p_rows:rows,p_idempotency_key:idempotencyKey,
 });
 expect(failed.error?.code).toBe("23514");
 expect(failed.error?.message).toContain("HOSTED_LIMIT_REACHED");
 for(const table of ["students","guardians","teacher_spreadsheet_import_receipts"]){
   const {count,error}=await admin.from(table).select("*",{head:true,count:"exact"})
     .eq("teacher_id",id);
   expect(error).toBeNull();
   expect(count).toBe(0);
 }
 expect((await admin.from("teachers").select("active_student_count")
   .eq("id",id).single()).data?.active_student_count).toBe(0);
 const allowed=await auth.rpc("ccp_teacher_spreadsheet_commit",{
   p_rows:[rows[0]],p_idempotency_key:idempotencyKey,
 });
 expect(allowed.error).toBeNull();
 expect(allowed.data.studentsCreated).toBe(1);
 expect(allowed.data.familiesCreated).toBe(1);
 expect(allowed.data.receiptId).toBe(idempotencyKey);
 const repeated=await auth.rpc("ccp_teacher_spreadsheet_commit",{
   p_rows:[rows[0]],p_idempotency_key:idempotencyKey,
 });
 expect(repeated.error).toBeNull();
 expect(repeated.data).toEqual(allowed.data);
 const conflict=await auth.rpc("ccp_teacher_spreadsheet_commit",{
   p_rows:[rows[1]],p_idempotency_key:idempotencyKey,
 });
 expect(conflict.error?.code).toBe("23505");
 expect(conflict.error?.message).toContain("IMPORT_REPLAY_CONFLICT");
 const {data:students}=await admin.from("students").select("name")
   .eq("teacher_id",id);
 expect(students).toHaveLength(1);
 expect(students![0].name).toBe(name1);
 const {data:families}=await admin.from("guardians").select("portal_token")
   .eq("teacher_id",id);
 expect(families).toHaveLength(1);
 expect(families![0].portal_token.length).toBeGreaterThan(20);
 expect(JSON.stringify(allowed.data)).not.toContain(families![0].portal_token);
 const unsafeRead=await auth.from("teacher_spreadsheet_import_receipts")
   .select("request_hash,receipt").eq("teacher_id",id);
 expect(unsafeRead.error).not.toBeNull();
 expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});

test("website spreadsheet import retries have stable tenant-scoped receipts",async({page})=>{
 await signInAsTeacher(page);
 const name="Web import replay "+key();
 const body={rows:[{"Student Name":name,"Guardian Name":"Parent of "+name}],
   mapping:{student_name:"Student Name",guardian_name:"Guardian Name"}};
 const first=await page.request.post("/api/import/spreadsheet/commit",{data:body});
 expect(first.status(),await first.text()).toBe(200);
 const result=await first.json();
 expect(result.studentsCreated).toBe(1);
 expect(result.familiesCreated).toBe(1);
 expect(result.receiptId).toMatch(/^[0-9a-f-]{36}$/);
 const replay=await page.request.post("/api/import/spreadsheet/commit",{data:body});
 expect(replay.status(),await replay.text()).toBe(200);
 expect(await replay.json()).toEqual(result);
 const changed=await page.request.post("/api/import/spreadsheet/commit",{
   data:{...body,idempotencyKey:result.receiptId,rows:[{"Student Name":name+" changed",
     "Guardian Name":"Parent of "+name}]},
 });
 expect(changed.status()).toBe(409);
 expect((await changed.json()).code).toBe("IMPORT_REPLAY_CONFLICT");
 const websiteRoster=await page.request.get("/api/students?query="+encodeURIComponent(name));
 expect(websiteRoster.status()).toBe(200);
 expect((await websiteRoster.json()).students.filter(
   (s:{name:string})=>s.name===name)).toHaveLength(1);
});
