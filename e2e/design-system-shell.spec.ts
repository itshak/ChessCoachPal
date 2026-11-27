import {expect} from "@playwright/test";
import {isolatedTeacherTest} from "./helpers/isolated-teacher";
isolatedTeacherTest("authenticated responsive shell, page finder and screenshots",async({page,isolatedTeacher},testInfo)=>{
 await page.goto("/login");
 await page.locator('form input[type="email"]').fill(isolatedTeacher.email);
 await page.locator('form input[type="password"]').fill(isolatedTeacher.password);
 await page.locator('form button[type="submit"]').click();
 await page.waitForURL("**/dashboard");
 await page.goto("/settings");
 const main=page.locator("#workspace-main");
 await expect(main).toBeVisible();
 for(const [name,width,height] of [["desktop",1440,900],["tablet",1024,768],["mobile",390,844]] as const){
  await page.setViewportSize({width,height});
  await expect(page.locator(".ccp-shell-sidebar")).toHaveCSS("display",name==="desktop"?"flex":"none");
  await expect(page.locator(".ccp-tablet-nav")).toHaveCSS("display",name==="tablet"?"flex":"none");
  await expect(page.locator(".ccp-mobile-nav")).toHaveCSS("display",name==="mobile"?"grid":"none");
  if(name==="mobile"){
   await expect(page.locator(".ccp-mobile-nav > *")).toHaveCount(5);
   const rect=await page.locator(".ccp-mobile-nav > *").first().boundingBox();
   expect(rect!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator("#global-workplace-switch")).toBeVisible();
  await page.screenshot({path:testInfo.outputPath(`shell-${name}.png`),animations:"disabled"});
 }
 await page.setViewportSize({width:1440,height:900});
 const search=page.locator(".ccp-search-trigger");
 await search.focus();
 await page.keyboard.press("Control+k");
 const dialog=page.locator(".ccp-dialog");
 await expect(dialog).toBeVisible();
 await dialog.locator("input").fill("Students");
 await expect(dialog.getByRole("link",{name:"Students",exact:true})).toBeVisible();
 await page.keyboard.press("Escape");
 await expect(dialog).toBeHidden();
 await expect(search).toBeFocused();
 for(const [locale,dir] of [["he","rtl"],["ru","ltr"]] as const){
  const saved=await page.request.put("/api/auth/update-profile",{data:{preferredLocale:locale}});
  expect(saved.status()).toBe(200);
  await page.goto("/settings");
  await expect(page.locator("html")).toHaveAttribute("lang",locale);
  await expect(page.locator("html")).toHaveAttribute("dir",dir);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator(".ccp-mobile-nav > *")).toHaveCount(5);
  await page.screenshot({path:testInfo.outputPath(`shell-mobile-${locale}.png`),animations:"disabled"});
 }
 await page.evaluate(()=>localStorage.setItem("chesscoachpal-teacher-theme","light"));
 await page.reload();
 await expect(page.locator("html")).toHaveAttribute("data-teacher-theme","light");
 await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:testInfo.outputPath("shell-desktop-ru-light.png"),animations:"disabled"});
});
