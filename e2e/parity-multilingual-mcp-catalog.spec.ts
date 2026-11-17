import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

/** One MCP endpoint, one stable ccp_* catalogue for all teacher UI locales.
 * Tool schema language is machine-facing English, not user-facing prose.
 */
test("EN/HE/RU: MCP catalogue and OAuth scopes are invariant when the teacher changes UI language",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const profile=await call("ccp_teacher_profile_get",{});
  expect(profile.error).toBeUndefined();
  const initial=profile.data.preferredLocale as "en"|"he"|"ru";
  const baseline=await call.listTools();
  expect(baseline.length).toBeGreaterThanOrEqual(150);
  const names=baseline.map(t=>t.name);
  expect(new Set(names).size).toBe(names.length);
  expect(names.every(name=>name.startsWith("ccp_"))).toBe(true);
  try{
    for(const locale of ["en","he","ru"] as const){
      const updated=await page.request.put("/api/auth/update-profile",{
        data:{preferredLocale:locale},
      });
      expect(updated.status(),await updated.text()).toBe(200);
      const context=await call("ccp_teacher_context_get",{});
      expect(context.error).toBeUndefined();
      expect(context.data.preferredLocale).toBe(locale);
      const next=await call.listTools();
      expect(next,"tools/list must not vary across locales").toEqual(baseline);
      const invalid=await call("ccp_teacher_profile_update",{
        confirmed:true,preferredLocale:"it",
      });
      expect(invalid.error?.code).toBe("VALIDATION_ERROR");
    }
  }finally{
    const restored=await page.request.put("/api/auth/update-profile",{
      data:{preferredLocale:initial},
    });
    expect(restored.status(),await restored.text()).toBe(200);
  }
});
