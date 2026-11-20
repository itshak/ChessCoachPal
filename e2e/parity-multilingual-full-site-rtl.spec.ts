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
    "/dashboard","/account","/settings","/students","/contacts",
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
        // Soft assertions still FAIL E2E, but collect all affected pages in
        // one CI run instead of fixing only the first route per iteration.
        expect.soft(widths.document-widths.viewport,
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

test("EN/HE/RU: 390px students list wraps very long original Unicode names and skill labels without cutting text",async({page})=>{
  const {randomUUID}=await import("node:crypto");
  await signInAsTeacher(page);
  const orig=await page.request.get("/api/teacher/context");
  expect(orig.status(),await orig.text()).toBe(200);
  const original=(await orig.json()).preferredLocale as "en"|"he"|"ru";
  const name="תלמיד"+"שחמט".repeat(25)+"Русский".repeat(6)+randomUUID().slice(0,8);
  const level="уровень".repeat(12);
  const created=await page.request.post("/api/students",{
    data:{name,level},
  });
  expect(created.status(),await created.text()).toBe(201);
  await page.setViewportSize({width:390,height:844});
  try{
    for(const locale of ["en","he","ru"] as const){
      const set=await page.request.put("/api/auth/update-profile",{
        data:{preferredLocale:locale}
      });
      expect(set.status(),await set.text()).toBe(200);
      await page.goto("/students");
      await expect(page.locator("html")).toHaveAttribute("lang",locale);
      const link=page.locator('a[href^="/students/"]').filter({hasText:name});
      await expect(link).toBeVisible();
      await expect(link.locator("bdi").first()).toHaveText(name);
      await expect(link.getByText(level)).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),
        `${locale}: long real student names/levels must not overflow mobile UI`)
        .toBeLessThanOrEqual(2);
    }
  }finally{
    const restore=await page.request.put("/api/auth/update-profile",{
      data:{preferredLocale:original}
    });
    expect(restore.status(),await restore.text()).toBe(200);
  }
});
