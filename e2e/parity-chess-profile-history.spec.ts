import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

async function student(call:(name:string,args:Record<string,unknown>)=>Promise<any>){
 const made=await call("ccp_v1_students_create",{
   name:"Chess history pupil "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(made.error).toBeUndefined();
 return made.data.entityId as string;
}

test("PARITY:PARITY-students-strength-goals-history tracks teacher goals and 1-10 assessment corrections on both interfaces",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const id=await student(call);
 const web=await page.request.put("/api/students/"+id,{data:{
   strength:6,chessGoals:"Learn tactical motifs and elementary rook endings",
 }});
 expect(web.status(),await web.text()).toBe(200);
 const before=await page.request.get("/api/students/"+id);
 expect(before.status()).toBe(200);
 const profile=await before.json();
 expect(profile.strength).toBe(6);
 expect(profile.chess_goals).toContain("rook endings");
 const viaMcp=await call("ccp_v1_students_profile",{studentId:id});
 expect(viaMcp.error).toBeUndefined();
 expect(viaMcp.data.strength).toBe(6);
 expect(viaMcp.data.chess_goals).toBe(profile.chess_goals);
 const historyPath="/api/students/"+id+"?chessHistory=true";
 const initial=await page.request.get(historyPath);
 expect(initial.status()).toBe(200);
 const first=await initial.json();
 expect(first.entries.some((x:{field_name:string,next_value:unknown})=>
   x.field_name==="strength"&&x.next_value===6)).toBe(true);
 expect(first.entries.some((x:{field_name:string,next_value:unknown})=>
   x.field_name==="chess_goals"&&String(x.next_value).includes("tactical"))).toBe(true);
 const mcpHistory=await call("ccp_v1_students_chess_history",{studentId:id});
 expect(mcpHistory.error).toBeUndefined();
 expect(mcpHistory.data).toEqual(first);
 const correction=await call("ccp_v1_students_profile_edit",{
   studentId:id,expectedUpdatedAt:profile.updated_at,
   changes:{strength:8,chessGoals:"Plan: calculate knight forks before rook endings"},
   confirmed:true,
 });
 expect(correction.error).toBeUndefined();
 const changed=await page.request.get("/api/students/"+id);
 expect(changed.status()).toBe(200);
 expect((await changed.json()).strength).toBe(8);
 const history=await page.request.get(historyPath);
 expect(history.status()).toBe(200);
 const later=await history.json();
 expect(later.entries.filter((x:{field_name:string})=>x.field_name==="strength"))
   .toHaveLength(2);
 expect(later.entries.some((x:{field_name:string;previous_value:unknown;next_value:unknown})=>
   x.field_name==="strength"&&x.previous_value===6&&x.next_value===8))
   .toBe(true);
 expect((await call("ccp_v1_students_chess_history",{studentId:id})).data).toEqual(later);
 await page.goto("/students/"+id);
 await expect(page.getByLabel("Teaching goals")).toHaveValue(
   "Plan: calculate knight forks before rook endings");
 const impact=await page.request.get("/api/students/"+id+"?deletePreview=true");
 expect(impact.status()).toBe(200);
 expect((await impact.json()).blockers.chessProfileHistory).toBeGreaterThan(0);
});

test("PARITY:PARITY-students-multicontrol-ratings-history supports named chess platforms, distinct time controls and correction audit",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const id=await student(call);
 const posted=await page.request.put("/api/students/"+id,{
   data:{lichessUsername:"testLichess",chesscomUsername:"testChessCom",
     lichessRating:1700,chesscomRating:1850,
     chessRatings:{lichess:{blitz:1610,rapid:1760},
       chesscom:{blitz:1740,rapid:1840}}},
 });
 expect(posted.status(),await posted.text()).toBe(200);
 const browser=await page.request.get("/api/students/"+id);
 expect(browser.status()).toBe(200);
 const profile=await browser.json();
 expect(profile.chess_ratings).toEqual({
   lichess:{blitz:1610,rapid:1760},chesscom:{blitz:1740,rapid:1840},
 });
 const model=await call("ccp_v1_students_profile",{studentId:id});
 expect(model.error).toBeUndefined();
 expect(model.data.chess_ratings).toEqual(profile.chess_ratings);
 expect(model.data.lichess_username).toBe("testLichess");
 expect(model.data.chesscom_username).toBe("testChessCom");
 const update=await call("ccp_v1_students_profile_edit",{
   studentId:id,expectedUpdatedAt:profile.updated_at,
   changes:{chessRatings:{lichess:{rapid:1810}},
     lichessRating:1820},confirmed:true,
 });
 expect(update.error).toBeUndefined();
 const after=await page.request.get("/api/students/"+id);
 expect(after.status()).toBe(200);
 const newProfile=await after.json();
 expect(newProfile.chess_ratings.lichess).toEqual({blitz:1610,rapid:1810});
 expect(newProfile.chess_ratings.chesscom).toEqual({blitz:1740,rapid:1840});
 expect(newProfile.lichess_rating).toBe(1820);
 const historyPath="/api/students/"+id+"?chessHistory=true";
 const site=await page.request.get(historyPath);
 expect(site.status()).toBe(200);
 const entries=(await site.json()).entries as Array<{
   field_name:string;previous_value:any;next_value:any;
 }>;
 expect(entries.filter(e=>e.field_name==="chess_ratings")).toHaveLength(2);
 expect(entries.some(e=>e.field_name==="chess_ratings"&&
   e.previous_value?.lichess?.rapid===1760&&
   e.next_value?.lichess?.rapid===1810)).toBe(true);
 const mcpHistory=await call("ccp_v1_students_chess_history",{studentId:id});
 expect(mcpHistory.error).toBeUndefined();
 expect(mcpHistory.data.entries).toEqual(entries);
 await page.goto("/students/"+id);
 await expect(page.getByLabel("lichess rapid rating")).toHaveValue("1810");
 await expect(page.getByLabel("chesscom blitz rating")).toHaveValue("1740");
 const missingId="00000000-0000-4000-8000-000000000001";
 const siteMissing=await page.request.get(
   "/api/students/"+missingId+"?chessHistory=true");
 expect(siteMissing.status()).toBe(404);
 const toolMissing=await call("ccp_v1_students_chess_history",{studentId:missingId});
 expect(toolMissing.error?.code).toBe("NOT_FOUND");
});
