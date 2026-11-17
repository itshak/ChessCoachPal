import {test,expect} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

/**
 * Locale changes are presentation-only; teacher IDs, material enums and MCP
 * tool names remain constant. Restore the profile even after assertions fail.
 */
test("reviewed en/he/ru learning, teaching-evidence, and lesson-capture controls",async({page,request})=>{
  test.setTimeout(180_000);
  const call=await delegatedTool(page,request);
  const original=await call("ccp_teacher_profile_get",{});
  expect(original.error).toBeUndefined();
  const previous=original.data.preferredLocale as "en"|"he"|"ru";
  try{
    const cases=[
      {locale:"he",dir:"rtl",catalog:"ספריית חומרי למידה",
       observation:"למידת שחמט",materials:"חומרים שהוקצו, נלמדו והושלמו",
       capture:"תיעוד שיעור לפי שמות תלמידים",preview:"תצוגה מקדימה בלבד",
       search:"חיפוש חומרי למידה",addSkill:"הוספת מיומנות",saveMaterial:"שמירת חומר",
       homework:"שיעורי בית ומעקב אחר האימון",plans:"תוכניות אימון ויעדים"},
      {locale:"ru",dir:"ltr",catalog:"Библиотека учебных материалов",
       observation:"Изучение шахмат",materials:"Назначенные, изученные и завершённые материалы",
       capture:"Записать занятие по именам учеников",preview:"Только предварительный просмотр",
       search:"Поиск учебных материалов",addSkill:"Добавить навык",saveMaterial:"Сохранить материал",
       homework:"Домашние задания и отслеживание тренировок",plans:"Планы тренировок и цели"}
    ] as const;
    for(const lang of cases){
      const changed=await page.request.put("/api/auth/update-profile",{
        data:{preferredLocale:lang.locale}
      });
      expect(changed.status(),await changed.text()).toBe(200);
      await page.goto("/learning");
      await expect(page.locator("html")).toHaveAttribute("lang",lang.locale);
      await expect(page.locator("html")).toHaveAttribute("dir",lang.dir);
      await expect(page.getByRole("heading",{name:lang.catalog})).toBeVisible();
      await expect(page.getByRole("heading",{name:lang.observation})).toBeVisible();
      await expect(page.getByRole("heading",{name:lang.materials})).toBeVisible();
      await expect(page.getByRole("heading",{name:lang.homework})).toBeVisible();
      await expect(page.getByLabel(lang.search)).toBeVisible();
      await expect(page.getByRole("button",{name:lang.addSkill})).toBeVisible();
      await expect(page.getByRole("button",{name:lang.saveMaterial})).toBeVisible();
      await page.goto("/students");
      const studentLink=page.locator('a[href^="/students/"]').first();
      await expect(studentLink).toBeVisible();
      await studentLink.click();
      await expect(page.getByRole("heading",{name:lang.plans})).toBeVisible();
      await page.goto("/coaching");
      await expect(page.getByRole("heading",{name:lang.capture})).toBeVisible();
      await expect(page.getByRole("button",{name:lang.preview})).toBeVisible();
      await page.setViewportSize({width:390,height:844});
      const {overflow, offenders}=await page.evaluate(()=>{
        const viewport=window.innerWidth;
        const entries=Array.from(document.querySelectorAll<HTMLElement>("main *"))
          .map(element=>{
            const rect=element.getBoundingClientRect();
            return {tag:element.tagName, classes:String(element.className).slice(0,125),
              left:Math.round(rect.left), right:Math.round(rect.right),
              width:Math.round(rect.width)};
          })
          .filter(element=>element.right>viewport+2 || element.left<-2)
          .sort((a,b)=>b.right-a.right).slice(0,12);
        return {overflow:document.documentElement.scrollWidth-viewport,offenders:entries};
      });
      expect(overflow,lang.locale+" coaching page horizontal overflow: "+JSON.stringify(offenders))
        .toBeLessThanOrEqual(2);
      await page.setViewportSize({width:1280,height:720});
    }
  }finally{
    const restore=await page.request.put("/api/auth/update-profile",{
      data:{preferredLocale:previous}
    });
    expect(restore.status(),await restore.text()).toBe(200);
  }
});
