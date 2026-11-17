import {expect,test} from "@playwright/test";
import {signInAsTeacher} from "./helpers/auth";

/** Real authenticated page sweep, not a catalog-only or HTML snapshot check.
 * Verify that switching the saved teacher locale changes every entrypoint,
 * while the browser remains operable at the 390px mobile viewport.
 */
test("EN/HE/RU: all teacher entrypoints obey saved language and mobile layout direction",async({page})=>{
  test.setTimeout(240_000);
  await signInAsTeacher(page);
  const contextReply=await page.request.get("/api/teacher/context");
  expect(contextReply.status(),await contextReply.text()).toBe(200);
  const original=(await contextReply.json()).preferredLocale as "en"|"he"|"ru";
  await page.setViewportSize({width:390,height:844});
  const paths=[
    "/dashboard","/account","/studio","/students","/families",
    "/schedule","/coaching","/reports","/learning","/events",
    "/billing","/ai-connections","/help",
  ];
  try{
    for(const [locale,dir] of [["he","rtl"],["ru","ltr"],["en","ltr"]] as const){
      const saved=await page.request.put("/api/auth/update-profile",{
        data:{preferredLocale:locale},
      });
      expect(saved.status(),await saved.text()).toBe(200);
      for(const path of paths){
        const res=await page.goto(path,{waitUntil:"domcontentloaded"});
        expect(res?.status(),`${locale} ${path} HTTP`).toBe(200);
        await expect(page.locator("html"),`${locale} ${path} lang`).toHaveAttribute("lang",locale);
        await expect(page.locator("html"),`${locale} ${path} dir`).toHaveAttribute("dir",dir);
        const widths=await page.evaluate(()=>({
          viewport:window.innerWidth,
          document:document.documentElement.scrollWidth,
        }));
        expect(widths.document-widths.viewport,
          `${locale} ${path} causes document horizontal overflow (pixels)`).toBeLessThanOrEqual(2);
        await expect(page.locator("h1").first(),`${locale} ${path} must have accessible heading`)
          .toBeVisible();
      }
    }
  }finally{
    const restored=await page.request.put("/api/auth/update-profile",{
      data:{preferredLocale:original},
    });
    expect(restored.status(),await restored.text()).toBe(200);
  }
});
