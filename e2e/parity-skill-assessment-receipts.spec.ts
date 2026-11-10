import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-skill-assessment-receipts replays one atomic round between real website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
   name:"Skill receipt student "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const dimension=await call("ccp_v1_skill_dimensions_create",{
   name:"Endgame receipt "+randomUUID(),confirmed:true,
 });
 expect(dimension.error).toBeUndefined();
 const dimensionId=dimension.data.id as string;
 const key=randomUUID();
 const ratings=[{dimensionId,rating:3,note:"Synthetic coach attestation"}];
 const first=await call("ccp_v1_student_skill_assessments_record",{
   studentId,ratings,idempotencyKey:key,confirmed:true,
 });
 expect(first.error).toBeUndefined();
 expect(first.data).toHaveLength(1);
 const websiteReplay=await page.request.post("/api/students/"+studentId+"/skills",{
   data:{ratings,idempotencyKey:key},
 });
 expect(websiteReplay.status(),await websiteReplay.text()).toBe(200);
 expect(await websiteReplay.json()).toEqual(first.data);
 const parallel=await Promise.all([
   page.request.post("/api/students/"+studentId+"/skills",{
     data:{ratings,idempotencyKey:key},
   }),
   call("ccp_v1_student_skill_assessments_record",{
     studentId,ratings,idempotencyKey:key,confirmed:true,
   }),
 ]);
 expect(parallel[0].status()).toBe(200);
 expect(await parallel[0].json()).toEqual(first.data);
 expect(parallel[1].data).toEqual(first.data);

 const changed=await page.request.post("/api/students/"+studentId+"/skills",{
   data:{ratings:[{...ratings[0],rating:4}],idempotencyKey:key},
 });
 expect(changed.status()).toBe(409);
 const refused=await call("ccp_v1_student_skill_assessments_record",{
   studentId,ratings:[{...ratings[0],rating:5}],idempotencyKey:key,confirmed:true,
 });
 expect(refused.error?.code).toBe("CONFLICT");
 const invalid=await page.request.post("/api/students/"+studentId+"/skills",{
   data:{ratings:[{dimensionId,rating:6}],idempotencyKey:randomUUID()},
 });
 expect(invalid.status()).toBe(400);
 const source=await page.request.get("/api/students/"+studentId+"/skills");
 expect(source.status(),await source.text()).toBe(200);
 const values=(await source.json()) as Array<{id:string;dimension_id:string;rating:number}>;
 expect(values.filter(x=>x.dimension_id===dimensionId)).toHaveLength(1);
 expect(values.find(x=>x.dimension_id===dimensionId)?.id).toBe(first.data[0].id);
 expect(values.find(x=>x.dimension_id===dimensionId)?.rating).toBe(3);
 const mcpHistory=await call("ccp_v1_student_skill_assessments_list",{studentId});
 expect(mcpHistory.error).toBeUndefined();
 expect(mcpHistory.data).toEqual(values);
});

test("PARITY:PARITY-skill-assessment-cross-tenant protects student and dimension on website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const own=await call("ccp_v1_students_create",{
   name:"Own assessment "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(own.error).toBeUndefined();
 const ownId=own.data.entityId as string;
 const ourDim=await call("ccp_v1_skill_dimensions_create",{
   name:"Our calculation "+randomUUID(),confirmed:true,
 });
 expect(ourDim.error).toBeUndefined();
 const dimensionId=ourDim.data.id as string;
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.SUPABASE_SERVICE_ROLE_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
 const email="foreign-assessment-"+randomUUID()+"@example.com";
 const {data:foreign,error:userError}=await admin.auth.admin.createUser({
   email,password:"SyntheticForeignTenant-123!",email_confirm:true,
 });
 expect(userError).toBeNull();
 const foreignId=foreign.user!.id;
 try {
   expect((await admin.from("teachers").insert({
     id:foreignId,email,display_name:"Foreign teacher",
   })).error).toBeNull();
   const {data:student,error:studentError}=await admin.from("students")
     .insert({teacher_id:foreignId,name:"Unrelated chess learner"})
     .select("id").single();
   expect(studentError).toBeNull();
   const {data:dim,error:dimError}=await admin.from("skill_dimensions")
     .insert({teacher_id:foreignId,name:"Foreign skill dimension",sort_order:6})
     .select("id").single();
   expect(dimError).toBeNull();
   const foreignStudent=student!.id as string;
   const foreignDimension=dim!.id as string;
   expect((await page.request.get("/api/students/"+foreignStudent+"/skills")).status()).toBe(404);
   expect((await call("ccp_v1_student_skill_assessments_list",{
     studentId:foreignStudent,
   })).error?.code).toBe("NOT_FOUND");
   const writeForeign=await page.request.post("/api/students/"+foreignStudent+"/skills",{
     data:{ratings:[{dimensionId,rating:2}],idempotencyKey:randomUUID()},
   });
   expect(writeForeign.status()).toBe(404);
   expect((await call("ccp_v1_student_skill_assessments_record",{
     studentId:foreignStudent,
     ratings:[{dimensionId,rating:2}],idempotencyKey:randomUUID(),confirmed:true,
   })).error?.code).toBe("NOT_FOUND");
   const injectDimension=await page.request.post("/api/students/"+ownId+"/skills",{
     data:{ratings:[{dimensionId:foreignDimension,rating:2}],idempotencyKey:randomUUID()},
   });
   expect(injectDimension.status()).toBe(404);
   expect((await call("ccp_v1_student_skill_assessments_record",{
     studentId:ownId,
     ratings:[{dimensionId:foreignDimension,rating:2}],idempotencyKey:randomUUID(),confirmed:true,
   })).error?.code).toBe("NOT_FOUND");
   const history=await page.request.get("/api/students/"+ownId+"/skills");
   expect(history.status()).toBe(200);
   expect((await history.json())).toEqual([]);
 } finally {
   expect((await admin.auth.admin.deleteUser(foreignId)).error).toBeNull();
 }
});
