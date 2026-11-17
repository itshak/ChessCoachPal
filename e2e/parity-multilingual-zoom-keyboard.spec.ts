import {expect,test} from "@playwright/test";
import {signInAsTeacher} from "./helpers/auth";

/**
 * At 200% browser zoom a 1280 physical-pixel desktop window exposes roughly
 * 640 effective CSS pixels for layout. This explicitly verifies the reflow
 * breakpoint. True browser UI zoom and a real screen reader still require
 * manual release acceptance, not a misleading synthetic claim.
 */
test("EN/HE/RU: 640px high-zoom-equivalent reflow, semantic headings and keyboard-addressable language control",async({page})=>{
  test.setTimeout(180_000);
  await signInAsTeacher(page);
  const profile=await page.request.get("/api/teacher/context");
  expect(profile.status()).toBe(200);
  const original=(await profile.json()).preferredLocale as "en"|"he"|"ru";
  const label={en:"Interface language",he:"שפת הממשק",ru:"Язык интерфейса"};
  await page.setViewportSize({width:640,height:900});
  const paths=["/account","/schedule","/dashboard","/students","/billing"];
  try{
    for(const locale of ["he","ru","en"] as const){
      const saved=await page.request.put("/api/auth/update-profile",{
        data:{preferredLocale:locale}
      });
      expect(saved.status(),await saved.text()).toBe(200);
      for(const path of paths){
        const response=await page.goto(path,{waitUntil:"domcontentloaded"});
        expect(response?.status(),`${locale} ${path} HTTP`).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang",locale);
        await expect(page.locator("html")).toHaveAttribute("dir",locale==="he"?"rtl":"ltr");
        await expect(page.getByRole("heading",{level:1}).first()).toBeVisible();
        const over=await page.evaluate(()=>
          document.documentElement.scrollWidth-window.innerWidth);
        expect.soft(over,`${locale} ${path}: layout exceeded the 640px effective viewport`)
          .toBeLessThanOrEqual(2);
      }
      await page.goto("/account");
      const control=page.getByRole("combobox",{name:label[locale]}).first();
      await expect(control).toBeVisible();
      await control.focus();
      await expect(control).toBeFocused();
      await expect(control.locator("option")).toHaveCount(3);
      await expect(control).toHaveValue(locale);
      // The label MUST remain exposed to assistive technology in all three
      // languages; an empty accessible name would fail getByRole above.
    }
  }finally{
    const restored=await page.request.put("/api/auth/update-profile",{
      data:{preferredLocale:original}
    });
    expect(restored.status(),await restored.text()).toBe(200);
  }
});
