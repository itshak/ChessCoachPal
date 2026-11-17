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
        const widths=await page.evaluate(()=>{
          const viewport=window.innerWidth,documentWidth=document.documentElement.scrollWidth;
          // Include safe, structural CSS diagnostics on failures. Do not put
          // user-controlled student names, notes, event titles or private data
          // into CI logs. The structural widths identify which container leaks.
          const culprits=documentWidth-viewport>2
            ?Array.from(document.querySelectorAll<HTMLElement>("body *"))
              .filter(el=>el.getClientRects().length>0)
              .map(el=>({
                tag:el.tagName.toLowerCase(),
                classes:String(el.className)
                  .split(/\s+/).slice(0,6).join(" ").slice(0,110),
                outer:Math.round(el.getBoundingClientRect().width),
                left:Math.round(el.getBoundingClientRect().left),
                right:Math.round(el.getBoundingClientRect().right),
                scroll:el.scrollWidth,client:el.clientWidth,
              }))
              .filter(x=>x.scroll-x.client>2||x.left < -2||x.right >viewport+2)
              .sort((a,b)=>Math.max(b.scroll-b.client,b.right-viewport,-b.left)-
                             Math.max(a.scroll-a.client,a.right-viewport,-a.left)).slice(0,14)
            :[];
          return {viewport,document:documentWidth,culprits};
        });
        expect(widths.document-widths.viewport,
          `${locale} ${path} causes document horizontal overflow; structural diagnostics: ${JSON.stringify(widths.culprits)}`)
          .toBeLessThanOrEqual(2);
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
