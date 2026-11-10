import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

const unique=(prefix:string)=>prefix+" "+randomUUID().slice(0,8);

test("PARITY:PARITY-skill-dimensions-lifecycle preserves assessments across website and MCP create, rename and delete",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const label=unique("Synthetic chess skill");
 const created=await call("ccp_v1_skill_dimensions_create",{name:label,confirmed:true});
 expect(created.error).toBeUndefined();
 const id=created.data.id as string;
 const siteList=await page.request.get("/api/skills/dimensions");
 expect(siteList.status(),await siteList.text()).toBe(200);
 expect((await siteList.json()).some((x:{id:string})=>x.id===id)).toBe(true);
 expect((await call("ccp_v1_skill_dimensions_list",{})).data).toEqual(
   await (await page.request.get("/api/skills/dimensions")).json());
 const rename=unique("Corrected bishop endgames");
 const edited=await page.request.put("/api/skills/dimensions/"+id,{data:{name:rename}});
 expect(edited.status(),await edited.text()).toBe(200);
 expect((await call("ccp_v1_skill_dimensions_list",{})).data
   .find((x:{id:string})=>x.id===id).name).toBe(rename);
 const revised=await call("ccp_v1_skill_dimensions_update",{
   dimensionId:id,name:unique("MCP corrected skill"),confirmed:true,
 });
 expect(revised.error).toBeUndefined();
 expect((await page.request.put("/api/skills/dimensions/"+id,{data:{name:" "}})).status()).toBe(400);
 expect((await page.request.post("/api/skills/dimensions",{
   data:{name:revised.data.name},
 })).status()).toBe(409);
 const student=await call("ccp_v1_students_create",{
   name:unique("Skill history keeper"),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const rating=await call("ccp_v1_student_skill_assessments_record",{
   studentId,ratings:[{dimensionId:id,rating:4,note:"Attested chess assessment"}],confirmed:true,
 });
 expect(rating.error).toBeUndefined();
 const mcpImpact=await call("ccp_v1_skill_dimensions_delete_impact",{dimensionId:id});
 expect(mcpImpact.error).toBeUndefined();
 expect(mcpImpact.data).toEqual({dimensionId:id,assessmentCount:1,canDelete:false});
 const webImpact=await page.request.get("/api/skills/dimensions/"+id);
 expect(webImpact.status(),await webImpact.text()).toBe(200);
 expect(await webImpact.json()).toEqual(mcpImpact.data);
 expect((await page.request.delete("/api/skills/dimensions/"+id)).status()).toBe(400);
 const unsafe=await page.request.delete("/api/skills/dimensions/"+id,{
   data:{confirmed:true,expectedAssessmentCount:0},
 });
 expect(unsafe.status(),await unsafe.text()).toBe(409);
 const refused=await call("ccp_v1_skill_dimensions_delete",{
   dimensionId:id,expectedAssessmentCount:1,confirmed:true,
 });
 expect(refused.error?.code).toBe("CONFLICT");
 const history=await call("ccp_v1_student_skill_assessments_list",{studentId});
 expect(history.error).toBeUndefined();
 expect(history.data.some((x:{dimension_id:string;rating:number})=>
   x.dimension_id===id&&x.rating===4)).toBe(true);
 const empty=await call("ccp_v1_skill_dimensions_create",{
   name:unique("Unused skill"),confirmed:true,
 });
 expect(empty.error).toBeUndefined();
 const emptyId=empty.data.id as string;
 expect((await (await page.request.get("/api/skills/dimensions/"+emptyId)).json()).canDelete).toBe(true);
 const deleted=await page.request.delete("/api/skills/dimensions/"+emptyId,{
   data:{confirmed:true,expectedAssessmentCount:0},
 });
 expect(deleted.status(),await deleted.text()).toBe(200);
 expect((await call("ccp_v1_skill_dimensions_delete_impact",{dimensionId:emptyId})).error?.code)
   .toBe("NOT_FOUND");
 const other=await call("ccp_v1_skill_dimensions_create",{
   name:unique("Unused MCP removal"),confirmed:true,
 });
 expect(other.error).toBeUndefined();
 const mcDeleted=await call("ccp_v1_skill_dimensions_delete",{
   dimensionId:other.data.id,expectedAssessmentCount:0,confirmed:true,
 });
 expect(mcDeleted.error).toBeUndefined();
 expect((await page.request.get("/api/skills/dimensions/"+other.data.id)).status()).toBe(404);
});

test("PARITY:PARITY-skill-dimensions-tenant-boundary refuses foreign dimensions from both surfaces",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.SUPABASE_SERVICE_ROLE_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
 const email="foreign-skill-"+randomUUID()+"@example.com";
 const {data:user,error:userError}=await admin.auth.admin.createUser({
   email,password:"SyntheticForeignTenant-123!",email_confirm:true,
 });
 expect(userError).toBeNull();
 const teacherId=user.user!.id;
 try{
   const {error:teacherError}=await admin.from("teachers").insert({
     id:teacherId,email,display_name:"Foreign teacher",
   });
   expect(teacherError).toBeNull();
   const {data:dimension,error:createError}=await admin.from("skill_dimensions")
     .insert({teacher_id:teacherId,name:unique("Foreign skills"),sort_order:5})
     .select("id,name").single();
   expect(createError).toBeNull();
   const id=dimension!.id as string;
   expect((await page.request.get("/api/skills/dimensions/"+id)).status()).toBe(404);
   expect((await call("ccp_v1_skill_dimensions_delete_impact",{dimensionId:id})).error?.code)
     .toBe("NOT_FOUND");
   expect((await page.request.put("/api/skills/dimensions/"+id,{
     data:{name:"Unauthorized"},
   })).status()).toBe(404);
   expect((await call("ccp_v1_skill_dimensions_update",{
     dimensionId:id,name:"Unauthorized MCP",confirmed:true,
   })).error?.code).toBe("NOT_FOUND");
   expect((await page.request.delete("/api/skills/dimensions/"+id,{
     data:{confirmed:true,expectedAssessmentCount:0},
   })).status()).toBe(404);
   expect((await call("ccp_v1_skill_dimensions_delete",{
     dimensionId:id,expectedAssessmentCount:0,confirmed:true,
   })).error?.code).toBe("NOT_FOUND");
   const {data:untouched}=await admin.from("skill_dimensions").select("name")
     .eq("id",id).single();
   expect(untouched?.name).toBe(dimension!.name);
 }finally{
   expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
