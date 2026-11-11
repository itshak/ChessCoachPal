import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {SEED_TEACHER} from "./helpers/auth";

test("PARITY:PARITY-notifications-list-mark compares website and MCP read/unread state",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.SUPABASE_SERVICE_ROLE_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
 const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
 const signed=await auth.auth.signInWithPassword(SEED_TEACHER);
 expect(signed.error).toBeNull();
 const teacherId=signed.data.user!.id;
 const stamp=randomUUID();
 const inserted=await admin.from("notifications").insert([
   {teacher_id:teacherId,type:"event_rsvp",title:"MCP read "+stamp,body:"Synthetic first"},
   {teacher_id:teacherId,type:"event_rsvp",title:"Website read "+stamp,body:"Synthetic second"},
 ]).select("id");
 expect(inserted.error).toBeNull();
 const ids=inserted.data!.map(x=>x.id as string);
 expect(ids).toHaveLength(2);
 const website=await page.request.get("/api/notifications");
 expect(website.status(),await website.text()).toBe(200);
 const websiteRows=(await website.json()).notifications as Array<{id:string;read_at:string|null}>;
 const fromMcp=await call("ccp_v1_notifications_list",{});
 expect(fromMcp.error).toBeUndefined();
 const modelRows=fromMcp.data.notifications as Array<{id:string;read_at:string|null}>;
 for(const id of ids){
   expect(websiteRows.find(x=>x.id===id)?.read_at).toBeNull();
   expect(modelRows.find(x=>x.id===id)?.read_at).toBeNull();
 }
 const mcpEdit=await call("ccp_v1_notifications_mark_read",{id:ids[0]});
 expect(mcpEdit.error).toBeUndefined();
 expect(mcpEdit.data.ok).toBe(true);
 const webAfter=await page.request.get("/api/notifications");
 expect(webAfter.status()).toBe(200);
 const updated=(await webAfter.json()).notifications as Array<{id:string;read_at:string|null}>;
 expect(updated.find(x=>x.id===ids[0])?.read_at).toBeTruthy();
 expect(updated.find(x=>x.id===ids[1])?.read_at).toBeNull();
 const webEdit=await page.request.patch("/api/notifications",{data:{id:ids[1]}});
 expect(webEdit.status(),await webEdit.text()).toBe(200);
 const modelAfter=await call("ccp_v1_notifications_list",{});
 expect(modelAfter.error).toBeUndefined();
 for(const id of ids)
   expect((modelAfter.data.notifications as Array<{id:string;read_at:string|null}>)
     .find(x=>x.id===id)?.read_at).toBeTruthy();
 // Device push subscription is browser/device authorization, never MCP impersonation.
});
