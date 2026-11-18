import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
const origin="http://localhost:3000";

/** A distinct synthetic teacher keeps global preference changes isolated from
 * every other concurrently running browser/MCP acceptance scenario. */
test("PARITY:PARITY-global workplace context persists across browser and MCP without granting foreign access",async({page,request})=>{
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,{
      auth:{persistSession:false,autoRefreshToken:false},
    });
  const email="workplace-context-"+randomUUID()+"@example.invalid";
  const password="SyntheticCtx-Password123!";
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(created.error).toBeNull();
  const teacherId=created.data.user!.id;
  try{
    const inserted=await admin.from("teachers").insert({
      id:teacherId,email,display_name:"Synthetic workplace context coach",
    });
    expect(inserted.error).toBeNull();
    const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
    const initialBrowser=await page.request.get("/api/teacher/workplace-context");
    expect(initialBrowser.status(),await initialBrowser.text()).toBe(200);
    const initial=await initialBrowser.json() as {selectedWorkplaceId:string|null;
      workplaces:Array<{id:string;name:string}>};
    expect(initial.selectedWorkplaceId).toBeNull();
    const firstMcp=await call("ccp_workplace_context_get",{});
    expect(firstMcp.error).toBeUndefined();
    expect(firstMcp.data).toMatchObject(initial);

    const a=await call("ccp_workplaces_create",{
      name:"Club "+randomUUID(),timezone:"UTC",currency:"USD",locale:"en",
      policy:{},idempotencyKey:randomUUID(),
    });
    const b=await call("ccp_workplaces_create",{
      name:"School "+randomUUID(),timezone:"Asia/Jerusalem",currency:"ILS",
      locale:"he",policy:{},idempotencyKey:randomUUID(),
    });
    expect(a.error).toBeUndefined();expect(b.error).toBeUndefined();
    const aId=a.data.entityId as string,bId=b.data.entityId as string;
    // The global selection must actually scope daily teacher screens. A
    // learner can be enrolled in both places without duplicating their ID.
    const firstStudentName="Scoped learner A "+randomUUID();
    const secondStudentName="Scoped learner B "+randomUUID();
    const learnerA=await call("ccp_students_create",{
      name:firstStudentName,idempotencyKey:randomUUID(),
    });
    const learnerB=await call("ccp_students_create",{
      name:secondStudentName,idempotencyKey:randomUUID(),
    });
    expect(learnerA.error).toBeUndefined();expect(learnerB.error).toBeUndefined();
    const learnerAId=learnerA.data.entityId as string;
    const learnerBId=learnerB.data.entityId as string;
    for(const [workplaceId,studentId] of [[aId,learnerAId],[bId,learnerBId]]){
      const enrolled=await call("ccp_workplaces_enroll",{
        workplaceId,studentId,idempotencyKey:randomUUID(),
      });
      expect(enrolled.error).toBeUndefined();
    }
    const foreign=await call("ccp_workplace_context_set",{
      selectedWorkplaceId:randomUUID(),expectedSelectedWorkplaceId:null,confirmed:true,
    });
    expect(foreign.error?.code).toBe("WORKPLACE_NOT_FOUND");
    const toolSet=await call("ccp_workplace_context_set",{
      selectedWorkplaceId:aId,expectedSelectedWorkplaceId:null,confirmed:true,
    });
    expect(toolSet.error).toBeUndefined();
    expect(toolSet.data).toMatchObject({selectedWorkplaceId:aId,replayed:false});
    await page.goto("/students");
    await expect(page.getByText(firstStudentName,{exact:true})).toBeVisible();
    await expect(page.getByText(secondStudentName,{exact:true})).toHaveCount(0);
    await page.goto("/dashboard");
    await expect(page.getByText(firstStudentName,{exact:true})).toBeVisible();
    await expect(page.getByText(secondStudentName,{exact:true})).toHaveCount(0);
    await page.goto("/coaching");
    await expect(page.getByTestId("coaching-workplace-select")).toHaveValue(aId);
    await expect(page.getByTestId("report-workplace-select")).toHaveValue(aId);
    await expect(page.getByTestId("history-workplace-select")).toHaveValue(aId);
    const siteA=await page.request.get("/api/teacher/workplace-context");
    expect((await siteA.json()).selectedWorkplaceId).toBe(aId);
    const retry=await call("ccp_workplace_context_set",{
      selectedWorkplaceId:aId,expectedSelectedWorkplaceId:null,confirmed:true,
    });
    expect(retry.error).toBeUndefined();expect(retry.data.replayed).toBe(true);
    const conflicting=await page.request.put("/api/teacher/workplace-context",{
      headers:{origin},data:{selectedWorkplaceId:bId,
        expectedSelectedWorkplaceId:null,confirmed:true},
    });
    expect(conflicting.status()).toBe(409);
    expect((await page.request.get("/api/teacher/workplace-context")).status()).toBe(200);
    const updated=await page.request.put("/api/teacher/workplace-context",{
      headers:{origin},data:{selectedWorkplaceId:bId,
        expectedSelectedWorkplaceId:aId,confirmed:true},
    });
    expect(updated.status(),await updated.text()).toBe(200);
    expect((await updated.json()).selectedWorkplaceId).toBe(bId);
    await page.goto("/students");
    await expect(page.getByText(secondStudentName,{exact:true})).toBeVisible();
    await expect(page.getByText(firstStudentName,{exact:true})).toHaveCount(0);
    await page.goto("/coaching");
    await expect(page.getByTestId("coaching-workplace-select")).toHaveValue(bId);
    await expect(page.getByTestId("report-workplace-select")).toHaveValue(bId);
    await expect(page.getByTestId("history-workplace-select")).toHaveValue(bId);
    const toolRead=await call("ccp_workplace_context_get",{});
    expect(toolRead.error).toBeUndefined();
    expect(toolRead.data.selectedWorkplaceId).toBe(bId);
    const denied=await page.request.put("/api/teacher/workplace-context",{
      headers:{origin:"https://other.example.invalid"},data:{
        selectedWorkplaceId:null,expectedSelectedWorkplaceId:bId,confirmed:true,
      },
    });
    expect(denied.status()).toBe(403);

    await page.goto("/dashboard");
    const switcher=page.locator("#global-workplace-switch");
    await expect(switcher).toHaveValue(bId);
    await switcher.selectOption("all");
    await expect(switcher).toHaveValue("all");
    await expect.poll(async()=>{
      const response=await page.request.get("/api/teacher/workplace-context");
      return (await response.json()).selectedWorkplaceId;
    }).toBeNull();
    await page.goto("/students");
    await expect(page.getByText(firstStudentName,{exact:true})).toBeVisible();
    await expect(page.getByText(secondStudentName,{exact:true})).toBeVisible();
    const cleared=await call("ccp_workplace_context_get",{});
    expect(cleared.data.selectedWorkplaceId).toBeNull();

    // Do not attach, reassign, erase or double-count teaching data when the
    // selected preference changes. The original workplace rows remain intact.
    const all=await call("ccp_workplaces_list",{});
    expect(all.error).toBeUndefined();
    expect(all.data.some((w:{id:string})=>w.id===aId)).toBe(true);
    expect(all.data.some((w:{id:string})=>w.id===bId)).toBe(true);
  }finally{
    const deleted=await admin.auth.admin.deleteUser(teacherId);
    expect(deleted.error).toBeNull();
  }
});
