import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-dashboard-summary matches all website counts through read-only MCP",async({page,request})=>{
 const call=await delegatedTool(page,request,"coach:read");
 const website=await page.request.get("/api/dashboard/summary");
 expect(website.status(),await website.text()).toBe(200);
 const tool=await call("ccp_v1_dashboard_summary",{});
 expect(tool.error).toBeUndefined();
 expect(tool.data).toEqual(await website.json());
 for(const key of ["studentCount","workplaceCount","groupCount"])
   expect(Number.isInteger(tool.data[key])).toBe(true);
});

test("PARITY:PARITY-security-read-only-client cannot mutate students or workplaces",async({page,request})=>{
 const call=await delegatedTool(page,request,"coach:read");
 const before=await page.request.get("/api/students?limit=10&activeOnly=true");
 expect(before.status(),await before.text()).toBe(200);
 const marker="Unauthorized read-only mutation "+randomUUID();
 const attempted=await call("ccp_v1_students_create",{
   name:marker,idempotencyKey:randomUUID(),
 });
 expect(attempted.error?.code).toBe("FORBIDDEN");
 const workplace=await call("ccp_v1_workplaces_create",{
   name:marker,timezone:"UTC",currency:"USD",locale:"en",
   policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error?.code).toBe("FORBIDDEN");
 const site=await page.request.get("/api/students?query="+encodeURIComponent(marker));
 expect(site.status(),await site.text()).toBe(200);
 expect((await site.json()).students).toEqual([]);
 const read=await call("ccp_v1_workplaces_list",{});
 expect(read.error).toBeUndefined();
 expect((read.data as Array<{name:string}>).some(x=>x.name===marker)).toBe(false);
});

test("PARITY:PARITY-security-cross-tenant-ids cannot be read or edited on website or MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.SUPABASE_SERVICE_ROLE_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
 const email="foreign-security-"+randomUUID()+"@example.com";
 const {data:identity,error:userError}=await admin.auth.admin.createUser({
   email,password:"SyntheticForeignTenant-123!",email_confirm:true,
 });
 expect(userError).toBeNull();
 const id=identity.user!.id;
 try{
   const {error:teacherError}=await admin.from("teachers").insert({
     id,email,display_name:"Foreign parity teacher",
   });
   expect(teacherError).toBeNull();
   const {data:student,error:createError}=await admin.from("students")
     .insert({teacher_id:id,name:"Unrelated account "+randomUUID()})
     .select("id").single();
   expect(createError).toBeNull();
   const studentId=student!.id as string;
   const mcp=await call("ccp_v1_students_profile",{studentId});
   expect(mcp.error?.code).toBe("NOT_FOUND");
   const site=await page.request.get("/api/students/"+studentId);
   expect(site.status()).toBe(404);
   const blockedMcp=await call("ccp_v1_students_profile_edit",{
     studentId,expectedUpdatedAt:new Date().toISOString(),
     changes:{name:"Cross-tenant violation"},confirmed:true,
   });
   expect(blockedMcp.error?.code).toBe("NOT_FOUND");
   const deniedSite=await page.request.put("/api/students/"+studentId,{
     data:{name:"Cross-tenant website violation"},
   });
   expect(deniedSite.status()).toBe(404);
   const {data:still}=await admin.from("students")
     .select("teacher_id,name").eq("id",studentId).single();
   expect(still?.teacher_id).toBe(id);
   expect(still?.name).not.toBe("Cross-tenant violation");
 }finally{
   expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});

test("PARITY:PARITY-delegated-oauth-website-roundtrip performs actual teacher-owned writes",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const firstName="Roundtrip "+randomUUID();
 const created=await call("ccp_v1_students_create",{
   name:firstName,idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const studentId=created.data.entityId as string;
 const website=await page.request.get("/api/students/"+studentId);
 expect(website.status(),await website.text()).toBe(200);
 expect((await website.json()).name).toBe(firstName);
 const nextName="Roundtrip browser "+randomUUID();
 const changed=await page.request.put("/api/students/"+studentId,{
   data:{name:nextName},
 });
 expect(changed.status(),await changed.text()).toBe(200);
 const read=await call("ccp_v1_students_profile",{studentId});
 expect(read.error).toBeUndefined();
 expect(read.data.name).toBe(nextName);
 expect(read.data.id).toBe(studentId);
});
