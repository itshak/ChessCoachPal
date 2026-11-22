import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";
const origin=new URL(process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000").origin;

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
    await configureSyntheticStudentCapacity(admin,teacherId,5,3);
    const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
    // This synthetic teacher is new: the onboarding tour deliberately routes
    // visitors to its current step (Dashboard), overriding /coaching. Finish
    // the tour before testing cross-page workplace context, without disabling
    // the production onboarding behavior.
    await page.goto("/dashboard");
    await page.getByRole("button",{name:"Skip",exact:true}).click();
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

    // The saved filter becomes stale, not history or access. The same public
    // fallback token must be usable across transports without exposing its ID.
    // Use an otherwise empty workplace; the archive guard correctly rejects
    // the earlier school fixture because it still has an active enrollment.
    const obsolete=await call("ccp_workplaces_create",{
      name:"Retiring workplace "+randomUUID(),timezone:"UTC",currency:"USD",locale:"en",
      policy:{},idempotencyKey:randomUUID(),
    });
    expect(obsolete.error).toBeUndefined();
    const archivedId=obsolete.data.entityId as string;
    expect((await call("ccp_workplace_context_set",{
      selectedWorkplaceId:archivedId,expectedSelectedWorkplaceId:null,confirmed:true,
    })).error).toBeUndefined();
    expect((await admin.from("workplaces").update({archived_at:new Date().toISOString()})
      .eq("id",archivedId).eq("teacher_id",teacherId)).error).toBeNull();
    const fallback=await call("ccp_workplace_context_get",{});
    expect(fallback.error).toBeUndefined();
    expect(fallback.data).toMatchObject({selectedWorkplaceId:null,selectedWorkplace:null,selectionWasStale:true});
    expect(fallback.data.workplaces.some((w:{id:string})=>w.id===archivedId)).toBe(false);
    const browserFallback=await page.request.get("/api/teacher/workplace-context");
    expect(browserFallback.status()).toBe(200);
    expect(await browserFallback.json()).toEqual(fallback.data);
    await page.goto("/students");
    await expect(switcher).toHaveValue("all");
    await expect(switcher.locator('option[value="'+archivedId+'"]')).toHaveCount(0);
    await expect(page.getByText("Previous workplace unavailable. Showing all workplaces.",{exact:true})).toBeVisible();
    await switcher.selectOption(aId);
    await expect.poll(async()=>(await call("ccp_workplace_context_get",{})).data)
      .toMatchObject({selectedWorkplaceId:aId,selectionWasStale:false});
    await expect(page.getByText("Previous workplace unavailable. Showing all workplaces.",{exact:true})).toHaveCount(0);
    const staleNull=await call("ccp_workplace_context_set",{
      selectedWorkplaceId:null,expectedSelectedWorkplaceId:null,confirmed:true,
    });
    expect(staleNull.error?.code).toBe("STALE_WORKPLACE_CONTEXT");
    expect((await call("ccp_workplace_context_get",{})).data.selectedWorkplaceId).toBe(aId);

    // MCP may also recover to All from a stale owned ID, actually clearing it.
    expect((await admin.from("teachers").update({selected_workplace_id:archivedId})
      .eq("id",teacherId)).error).toBeNull();
    expect((await call("ccp_workplace_context_set",{
      selectedWorkplaceId:null,expectedSelectedWorkplaceId:null,confirmed:true,
    })).data).toMatchObject({selectedWorkplaceId:null,selectionWasStale:false,replayed:false});
    const stored=await admin.from("teachers").select("selected_workplace_id").eq("id",teacherId).single();
    expect(stored.error).toBeNull();
    expect(stored.data?.selected_workplace_id).toBeNull();

    // Do not attach, reassign, erase or double-count teaching data when the
    // selected preference changes. The original workplace rows remain intact.
    const all=await call("ccp_workplaces_list",{});
    expect(all.error).toBeUndefined();
    expect(all.data.some((w:{id:string})=>w.id===aId)).toBe(true);
    expect(all.data.some((w:{id:string})=>w.id===bId)).toBe(true);
    const preserved=await admin.from("workplaces").select("id,archived_at").eq("id",archivedId).eq("teacher_id",teacherId).single();
    expect(preserved.error).toBeNull();
    expect(preserved.data?.archived_at).toBeTruthy();
  }finally{
    const deleted=await admin.auth.admin.deleteUser(teacherId);
    expect(deleted.error).toBeNull();
  }
});

test("PARITY: Manage workplaces is a keyboard target and only the open tab can recognize a deleted selection",async({page,request,context})=>{
  test.setTimeout(90000);
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const email="workplace-deletion-"+randomUUID()+"@example.invalid",password="SyntheticDeleteContext-34!";
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(created.error).toBeNull();
  const teacherId=created.data.user!.id;
  try{
    expect((await admin.from("teachers").insert({id:teacherId,email,display_name:"Synthetic RTL workplace coach",
      onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
    await configureSyntheticStudentCapacity(admin,teacherId,5,3);
    const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
    expect((await call("ccp_teacher_profile_update",{preferredLocale:"he",confirmed:true})).error).toBeUndefined();
    const name="מקום לבדיקה "+randomUUID();
    const obsolete=await call("ccp_workplaces_create",{
      name,timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",policy:{},idempotencyKey:randomUUID(),
    });
    expect(obsolete.error).toBeUndefined();
    const gone=obsolete.data.entityId as string;
    const selected=await call("ccp_workplace_context_get",{});
    expect(selected.error).toBeUndefined();
    const kept=selected.data.workplaces.find((w:{id:string})=>w.id!==gone).id as string;
    expect((await call("ccp_workplace_context_set",{
      selectedWorkplaceId:gone,expectedSelectedWorkplaceId:null,confirmed:true,
    })).error).toBeUndefined();

    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveAttribute("dir","rtl");
    const manage=page.getByRole("link",{name:"ניהול מקומות עבודה",exact:true});
    await manage.focus();
    await manage.press("Enter");
    await expect(page).toHaveURL(/\/coaching#manage-workplaces$/);
    const section=page.getByRole("region",{name:"מקומות עבודה",exact:true});
    const heading=section.getByRole("heading",{name:"מקומות עבודה",exact:true});
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    await expect(section.getByText(name,{exact:true})).toBeVisible();
    const managed=await call("ccp_workplaces_list",{});
    expect(managed.error).toBeUndefined();
    expect(managed.data).toEqual(expect.arrayContaining([expect.objectContaining({id:gone,name})]));

    const selector=page.getByRole("combobox",{name:"הקשר מקום העבודה הפעיל"});
    const fallback="מקום העבודה הקודם אינו זמין. מוצגים כל מקומות העבודה.";
    await expect(selector).toHaveValue(gone);
    expect((await admin.from("workplaces").delete().eq("id",gone).eq("teacher_id",teacherId)
      .select("id").single()).data).toEqual({id:gone});
    const freshApi=await page.request.get("/api/teacher/workplace-context");
    const fresh=await freshApi.json();
    expect(fresh).toMatchObject({selectedWorkplaceId:null,selectionWasStale:false});
    expect((await call("ccp_workplace_context_get",{})).data).toEqual(fresh);

    // Another real selection attempt uses the tab's old CAS and refreshes
    // the route on 409, preserving the mounted header's local observation.
    const conflict=page.waitForResponse(r=>r.url().endsWith("/api/teacher/workplace-context")&&r.request().method()==="PUT");
    await selector.selectOption(kept);
    expect((await conflict).status()).toBe(409);
    await expect(selector).toHaveValue("all");
    await expect(selector).toHaveAccessibleDescription(fallback);
    await expect(page.getByRole("status").filter({hasText:fallback})).toBeVisible();
    await expect(selector.locator(`option[value="${gone}"]`)).toHaveCount(0);

    const separate=await context.newPage();
    try{
      await separate.goto("/dashboard");
      await expect(separate.getByRole("combobox",{name:"הקשר מקום העבודה הפעיל"})).toHaveValue("all");
      await expect(separate.getByText(fallback,{exact:true})).toHaveCount(0);
    }finally{await separate.close();}

    await selector.selectOption(kept);
    await expect.poll(async()=>(await call("ccp_workplace_context_get",{})).data.selectedWorkplaceId).toBe(kept);
    await expect(page.getByText(fallback,{exact:true})).toHaveCount(0);

    // A deliberate cross-transport clear while the old venue still exists
    // is ordinary All, not a missing-workplace recovery.
    expect((await call("ccp_workplace_context_set",{
      selectedWorkplaceId:null,expectedSelectedWorkplaceId:kept,confirmed:true,
    })).error).toBeUndefined();
    const clearRefresh=page.waitForResponse(r=>r.url().endsWith("/api/teacher/workplace-context")&&r.request().method()==="PUT");
    await selector.selectOption("all");
    expect((await clearRefresh).status()).toBe(200);
    await expect(selector).toHaveValue("all");
    await expect(page.getByText(fallback,{exact:true})).toHaveCount(0);
  }finally{expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();}
});
