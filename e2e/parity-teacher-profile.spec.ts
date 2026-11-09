import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-teacher-profile-display-name shares website and MCP without exposing auth secrets",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const signed=await auth.auth.signInWithPassword(SEED_TEACHER);
 expect(signed.error).toBeNull();
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const id=signed.data.user!.id;
 const {data:before,error}=await admin.from("teachers")
   .select("display_name,avatar_url").eq("id",id).single();
 expect(error).toBeNull();
 const browserName="Coach website "+randomUUID().slice(0,8);
 const modelName="Coach MCP "+randomUUID().slice(0,8);
 try{
   const web=await page.request.put("/api/auth/update-profile",{
     data:{displayName:browserName},
   });
   expect(web.status(),await web.text()).toBe(200);
   const read=await call("ccp_v1_teacher_profile_get",{});
   expect(read.error).toBeUndefined();
   expect(read.data.displayName).toBe(browserName);
   expect(read.data.email).toBeUndefined();
   expect(read.data.password).toBeUndefined();
   const rejected=await call("ccp_v1_teacher_profile_update",{
     displayName:"Unconfirmed mutation",
   });
   expect(rejected.error?.code).toBe("VALIDATION_ERROR");
   const changed=await call("ccp_v1_teacher_profile_update",{
     displayName:modelName,confirmed:true,
   });
   expect(changed.error).toBeUndefined();
   expect(changed.data.ok).toBe(true);
   await page.goto("/account");
   await expect(page.getByLabel("Display name")).toHaveValue(modelName);
   const invalid=await call("ccp_v1_teacher_profile_update",{
     avatarUrl:"https://example.com/evil.png",confirmed:true,
   });
   expect(invalid.error?.code).toBe("VALIDATION_ERROR");
   const {data:after}=await admin.from("teachers").select("avatar_url")
     .eq("id",id).single();
   expect(after?.avatar_url).toBe(before!.avatar_url);
 }finally{
   const restore=await page.request.put("/api/auth/update-profile",{
     data:{displayName:before!.display_name},
   });
   expect(restore.status(),await restore.text()).toBe(200);
 }
});
