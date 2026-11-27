import {test,expect} from "@playwright/test";
import {signInAsTeacher} from "./helpers/auth";
test("authenticated responsive shell, page finder and screenshots",async({page},testInfo)=>{
 await signInAsTeacher(page);
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
});
