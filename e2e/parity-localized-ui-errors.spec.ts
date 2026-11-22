import {expect} from "@playwright/test";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: teacher UI maps canonical server errors to Hebrew and Russian without changing MCP codes",async({page,request,isolatedTeacher})=>{
  const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
  // This case intentionally ends in Russian. Its disposable identity keeps later
  // tests on the seed teacher's English OAuth UI even if this case times out.
  for(const [locale,saveLabel,userCopy,dir] of [
    ["he","שמירת הגדרות העסק","בדקו את הערכים שהוזנו","rtl"],
    ["ru","Сохранить настройки практики","Проверьте введённые данные","ltr"],
  ] as const){
    const updated=await page.request.put("/api/auth/update-profile",{
      data:{preferredLocale:locale},
    });
    expect(updated.status(),await updated.text()).toBe(200);
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("lang",locale);
    await expect(page.locator("html")).toHaveAttribute("dir",dir);
    let intercepted=0;
    await page.route("**/api/settings/policy",async route=>{
      if(route.request().method()==="PUT"){
        intercepted++;
        await route.fulfill({status:400,contentType:"application/json",body:JSON.stringify({
          code:"VALIDATION_ERROR",error:"Choose a start and end date",
        })});
      }else await route.continue();
    });
    await page.getByRole("button",{name:saveLabel}).click();
    await expect(page.getByText(userCopy,{exact:true})).toBeVisible();
    expect(intercepted).toBe(1);
    await expect(page.getByText("Choose a start and end date",{exact:true})).toHaveCount(0);
    await page.unroute("**/api/settings/policy");
    // The actual delegated MCP retains canonical machine errors independently.
    const bad=await call("ccp_teacher_profile_update",{
      preferredLocale:"not-a-language",confirmed:true,
    });
    expect(bad.error?.code).toBe("VALIDATION_ERROR");
  }
});
