import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-calendar-token-rotation revokes feed through MCP without revealing new link",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const signed=await auth.auth.signInWithPassword(SEED_TEACHER);
 expect(signed.error).toBeNull();
 const teacherId=signed.data.user!.id;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const token=async()=>{
   const {data,error}=await admin.from("teachers").select("calendar_token")
     .eq("id",teacherId).single();
   expect(error).toBeNull();
   return data!.calendar_token as string;
 };
 const oldToken=await token();
 expect(oldToken.length).toBeGreaterThan(15);
 const status=await call("ccp_v1_calendar_feed_status",{});
 expect(status.error).toBeUndefined();
 expect(status.data).toEqual({configured:true,secretNotReturned:true});
 const denied=await call("ccp_v1_calendar_feed_rotate",{});
 expect(denied.error?.code).toBe("VALIDATION_ERROR");
 const mcp=await call("ccp_v1_calendar_feed_rotate",{confirmed:true});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual({ok:true,rotated:true,secretNotReturned:true});
 const newToken=await token();
 expect(newToken).not.toBe(oldToken);
 expect(JSON.stringify(mcp.data)).not.toContain(newToken);
 const old=await request.get("/api/feeds/"+encodeURIComponent(oldToken)+"/calendar");
 expect(old.status()).toBe(404);
 const website=await page.request.post("/api/teacher/calendar-token");
 expect(website.status(),await website.text()).toBe(200);
 const response=await website.json();
 const latestToken=await token();
 expect(response.calendar_token).toBe(latestToken);
 expect(latestToken).not.toBe(newToken);
 const safe=await call("ccp_v1_calendar_feed_status",{});
 expect(safe.error).toBeUndefined();
 expect(safe.data).toEqual({configured:true,secretNotReturned:true});
 expect(JSON.stringify(safe.data)).not.toContain(latestToken);
});
