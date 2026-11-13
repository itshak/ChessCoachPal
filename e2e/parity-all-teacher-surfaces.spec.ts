import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-all-teacher-route-field-action-contract discovers every teacher MCP operation and roundtrips chess fields",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const catalogue=await call.listTools();
  const byName=new Map(catalogue.map(tool=>[tool.name,tool]));
  const inventory=JSON.parse(readFileSync(resolve("scripts/mcp-website-parity.json"),"utf8"));
  const routes=(inventory.apiRoutes as Array<{
    path:string;kind:string;parity:string;existingTools:string[];
  }>).filter(x=>x.kind==="teacher");
  expect(routes.length).toBeGreaterThanOrEqual(59);
  expect(byName.size).toBeGreaterThan(100);
  for(const route of routes){
    expect(route.parity,route.path).toBe("mcp");
    expect(route.existingTools.length,route.path).toBeGreaterThan(0);
    for(const name of route.existingTools){
      expect(byName.has(name),route.path+" -> missing deployed "+name).toBe(true);
      expect(byName.get(name)?.inputSchema).toBeDefined();
    }
  }
  // Source audit additionally establishes the shared imported operation for
  // every teacher endpoint; the individually named E2E matrix exercises each.
  // This acceptance independently confirms runtime OAuth discovery and a
  // representative full chess-specific profile field update/clear contract.
  const editSchema=byName.get("ccp_v1_students_profile_edit")!.inputSchema!;
  const changes=((editSchema.properties??{}).changes??{}).properties??{};
  for(const field of ["nameAliases","strength","lichessUsername",
    "chesscomUsername","lichessRating","chesscomRating","chessGoals",
    "teacherNotes","defaultRateCents","travelFeeCents","archived"])
    expect(Object.hasOwn(changes,field),"student edit field "+field).toBe(true);
  const newName="Parity catalog learner "+randomUUID().slice(0,8);
  const created=await call("ccp_v1_students_create",{
    name:newName,idempotencyKey:randomUUID(),
  });
  expect(created.error).toBeUndefined();
  const studentId=created.data.entityId as string;
  const alias="Player "+randomUUID().slice(0,8);
  const website=await page.request.put("/api/students/"+studentId,{data:{
    nameAliases:[alias],strength:7,lichessUsername:"PlayerLichess",
    chesscomUsername:"PlayerChessCom",lichessRating:1710,
    chesscomRating:1820,chessGoals:"Endgames and tactics",
  }});
  expect(website.status(),await website.text()).toBe(200);
  const model=await call("ccp_v1_students_profile",{studentId});
  expect(model.error).toBeUndefined();
  expect(model.data).toMatchObject({
    id:studentId,name:newName,name_aliases:[alias],strength:7,
    lichess_username:"PlayerLichess",chesscom_username:"PlayerChessCom",
    lichess_rating:1710,chesscom_rating:1820,
    chess_goals:"Endgames and tactics",
  });
  const corrected=await call("ccp_v1_students_profile_edit",{
    studentId,expectedUpdatedAt:model.data.updated_at,
    changes:{nameAliases:[],strength:8,lichessUsername:null,
      chesscomUsername:null,lichessRating:null,chesscomRating:null},
    confirmed:true,
  });
  expect(corrected.error).toBeUndefined();
  const siteRead=await page.request.get("/api/students/"+studentId);
  expect(siteRead.status(),await siteRead.text()).toBe(200);
  expect(await siteRead.json()).toMatchObject({
    id:studentId,name:newName,name_aliases:[],strength:8,
    lichess_username:null,chesscom_username:null,
    lichess_rating:null,chesscom_rating:null,
  });
});
