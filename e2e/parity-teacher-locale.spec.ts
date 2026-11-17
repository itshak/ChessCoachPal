import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: teacher language preference persists identically via website and MCP", async ({page,request}) => {
  const call = await delegatedTool(page,request);
  const original = await call("ccp_teacher_profile_get",{});
  expect(original.error).toBeUndefined();
  const initial = original.data.preferredLocale as "en"|"he"|"ru";
  try {
    const web = await page.request.put("/api/auth/update-profile", {
      data:{preferredLocale:"he"}
    });
    expect(web.status(),await web.text()).toBe(200);
    const read = await call("ccp_teacher_profile_get",{});
    expect(read.error).toBeUndefined();
    expect(read.data.preferredLocale).toBe("he");
    expect(read.data.email).toBeUndefined();
    const context = await call("ccp_teacher_context_get",{});
    expect(context.error).toBeUndefined();
    expect(context.data.preferredLocale).toBe("he");
    await page.goto("/account");
    await expect(page).toHaveTitle(/הגדרות חשבון/);
    await expect(page.locator("html")).toHaveAttribute("lang","he");
    await expect(page.locator("html")).toHaveAttribute("dir","rtl");
    await expect(page.getByLabel("שפת הממשק").first()).toHaveValue("he");
    await page.goto("/schedule");
    await expect(page).toHaveTitle(/לוח שיעורים/);
    await expect(page.getByRole("heading",{name:"לוח שיעורים"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"שיעורים קבועים"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"זיכויי שיעורי השלמה"})).toBeVisible();
    await page.getByRole("button",{name:/Private session|שיעור פרטי/}).click();
    await expect(page.getByRole("heading",{name:"קביעת שיעור שחמט פרטי"})).toBeVisible();
    await page.goto("/events");
    await expect(page.getByRole("heading",{name:"אירועי שחמט"})).toBeVisible();
    await page.goto("/families");
    await expect(page.getByRole("heading",{name:"משפחות"})).toBeVisible();
    await page.setViewportSize({width:390,height:844});
    const familyOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(familyOverflow,"Hebrew family list horizontal overflow").toBeLessThanOrEqual(2);
    await page.setViewportSize({width:1280,height:720});
    await page.goto("/students");
    const studentLink=page.locator('a[href^="/students/"]').first();
    await expect(studentLink).toBeVisible();
    await studentLink.click();
    await expect(page.getByRole("heading",{name:"תצפיות דירוג לפי מקור וקצב משחק"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"התקדמות"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"למידת שחמט"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"חומרים שהוקצו, נלמדו והושלמו"})).toBeVisible();
    await expect(page.getByLabel("תצפיות דירוג שחמט")).toBeVisible();
    await expect(page.getByText("מתאמן מאז",{exact:true})).toBeVisible();
    const mcp = await call("ccp_teacher_profile_update",{
      preferredLocale:"ru", confirmed:true
    });
    expect(mcp.error).toBeUndefined();
    expect(mcp.data.ok).toBe(true);
    await page.goto("/account");
    await expect(page).toHaveTitle(/Настройки аккаунта/);
    await expect(page.locator("html")).toHaveAttribute("lang","ru");
    await expect(page.locator("html")).toHaveAttribute("dir","ltr");
    await expect(page.getByLabel("Язык интерфейса").first()).toHaveValue("ru");
    await page.goto("/schedule");
    await expect(page).toHaveTitle(/Расписание занятий/);
    await expect(page.getByRole("heading",{name:"Расписание занятий"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Повторяющиеся уроки"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Кредиты на отработки"})).toBeVisible();
    await page.goto("/events");
    await expect(page.getByRole("heading",{name:"Шахматные мероприятия"})).toBeVisible();
    await page.goto("/families");
    await expect(page.getByRole("heading",{name:"Семьи"})).toBeVisible();
    await page.goto("/students");
    const russianStudentLink=page.locator('a[href^="/students/"]').first();
    await expect(russianStudentLink).toBeVisible();
    await russianStudentLink.click();
    await expect(page.getByRole("heading",{name:"Рейтинги по источникам и контролю времени"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Прогресс"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Изучение шахмат"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Назначенные, изученные и завершённые материалы"})).toBeVisible();
    await expect(page.getByLabel("Наблюдения шахматного рейтинга")).toBeVisible();
    await expect(page.getByText("Занимается с",{exact:true})).toBeVisible();
    const invalidWeb = await page.request.put("/api/auth/update-profile", {
      data:{preferredLocale:"unsupported"}
    });
    expect(invalidWeb.status()).toBe(400);
    const invalidMcp = await call("ccp_teacher_profile_update",{
      preferredLocale:"unsupported", confirmed:true
    });
    expect(invalidMcp.error?.code).toBe("VALIDATION_ERROR");
    const after = await call("ccp_teacher_profile_get",{});
    expect(after.data.preferredLocale).toBe("ru");
  } finally {
    const restore = await page.request.put("/api/auth/update-profile",{
      data:{preferredLocale:initial}
    });
    expect(restore.status(),await restore.text()).toBe(200);
  }
});

test("anonymous locale cookie drives SSR document language and direction",async({browser})=>{
  const context = await browser.newContext({baseURL:"http://localhost:3000"});
  try {
    const reply = await context.request.post("/api/preferences/locale",{
      data:{locale:"he"}
    });
    expect(reply.status(),await reply.text()).toBe(200);
    const page = await context.newPage();
    await page.goto("/");
    await page.goto("/login");
    await expect(page).toHaveTitle(/כניסה/);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang","he");
    await expect(page.locator("html")).toHaveAttribute("dir","rtl");
    await expect(page.getByRole("heading",{name:"יותר זמן לאימון. פחות זמן לניהול."})).toBeVisible();
    const next = await context.request.post("/api/preferences/locale",{
      data:{locale:"ru"}
    });
    expect(next.status()).toBe(200);
    await page.reload();
    await page.goto("/login");
    await expect(page).toHaveTitle(/Вход/);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang","ru");
    await expect(page.locator("html")).toHaveAttribute("dir","ltr");
    await expect(page.getByRole("heading",{name:"Больше времени на шахматы. Меньше — на администрирование."})).toBeVisible();
    const invalid=await context.request.post("/api/preferences/locale",{
      data:{locale:"fr"}
    });
    expect(invalid.status()).toBe(400);
  } finally {await context.close();}
});

test("RTL mobile login and landing have no horizontal overflow",async({browser})=>{
  const context=await browser.newContext({baseURL:"http://localhost:3000",viewport:{width:390,height:844}});
  try{
    const response=await context.request.post("/api/preferences/locale",{data:{locale:"he"}});
    expect(response.status()).toBe(200);
    const page=await context.newPage();
    for(const path of ["/","/login"]){
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("dir","rtl");
      await expect(page.locator("html")).toHaveAttribute("lang","he");
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      expect(overflow, "horizontal overflow at "+path).toBeLessThanOrEqual(2);
    }
    await expect(page.getByRole("button",{name:"כניסה"})).toBeVisible();
    await page.getByLabel("שפת הממשק").focus();
    await expect(page.getByLabel("שפת הממשק")).toBeFocused();
  }finally{await context.close();}
});

test("anonymous family portal renders English, Hebrew RTL, and Russian without mutating records",async({browser})=>{
  const context=await browser.newContext({baseURL:"http://localhost:3000",viewport:{width:390,height:844}});
  try{
    const page=await context.newPage();
    for(const [locale,dir,heading] of [
      ["en","ltr","Upcoming Lessons"],
      ["he","rtl","שיעורים קרובים"],
      ["ru","ltr","Предстоящие уроки"]
    ] as const){
      const response=await context.request.post("/api/preferences/locale",{data:{locale}});
      expect(response.status(),await response.text()).toBe(200);
      const request=await page.goto("/portal/dev-portal-jordan");
      expect(request?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang",locale);
      await expect(page.locator("html")).toHaveAttribute("dir",dir);
      await expect(page.getByRole("heading",{name:heading})).toBeVisible();
      const over=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      expect(over, locale+" family portal horizontal overflow").toBeLessThanOrEqual(2);
    }
    await expect(page.getByLabel("Язык интерфейса")).toHaveValue("ru");
  }finally{await context.close();}
});

test("anonymous public try, hosting, password recovery and missing-page texts follow en/he/ru",async({browser})=>{
  const context=await browser.newContext({baseURL:"http://localhost:3000",viewport:{width:390,height:844}});
  try{
    const page=await context.newPage();
    const cases=[
      {locale:"en",dir:"ltr",tryTitle:"Try ChessCoachPal",
        hostingTitle:"Host ChessCoachPal your way",resetIntro:"Choose a new password",
        missingTitle:"Page not found 😕"},
      {locale:"he",dir:"rtl",tryTitle:"התנסות ב-ChessCoachPal",
        hostingTitle:"מארחים את ChessCoachPal בדרך שלכם",resetIntro:"בחרו סיסמה חדשה",
        missingTitle:"הדף לא נמצא 😕"},
      {locale:"ru",dir:"ltr",tryTitle:"Попробовать ChessCoachPal",
        hostingTitle:"Размещайте ChessCoachPal на своих условиях",resetIntro:"Выберите новый пароль",
        missingTitle:"Страница не найдена 😕"}
    ] as const;
    for(const row of cases){
      const response=await context.request.post("/api/preferences/locale",{data:{locale:row.locale}});
      expect(response.status(),await response.text()).toBe(200);
      const pages=[
        ["/try",row.tryTitle],
        ["/hosting",row.hostingTitle],
        ["/reset-password",row.resetIntro],
        ["/missing-coach-page-unknown",row.missingTitle]
      ] as const;
      for(const [route,heading] of pages){
        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("lang",row.locale);
        await expect(page.locator("html")).toHaveAttribute("dir",row.dir);
        await expect(page.getByText(heading,{exact:true}).first()).toBeVisible();
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
        expect(overflow,row.locale+" "+route+" 390px horizontal overflow").toBeLessThanOrEqual(2);
      }
    }
  }finally{await context.close();}
});

test("PARITY: family communication locale round-trips website and MCP without changing teacher UI",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const initialTeacher=await call("ccp_teacher_profile_get",{});
  expect(initialTeacher.error).toBeUndefined();
  const initialLocale=initialTeacher.data.preferredLocale;
  const created=await call("ccp_guardians_create",{
    name:"Localized family "+randomUUID(),preferredLocale:"he",confirmed:true,
  });
  expect(created.error).toBeUndefined();
  const id=created.data.id as string;
  const readWebsite=async()=>{
    const res=await page.request.get("/api/guardians/"+id);
    expect(res.status(),await res.text()).toBe(200);
    return await res.json() as {preferred_locale:string|null};
  };
  expect((await readWebsite()).preferred_locale).toBe("he");
  const safe=await call("ccp_guardians_detail",{guardianId:id});
  expect(safe.error).toBeUndefined();
  expect(safe.data.preferred_locale).toBe("he");
  expect(safe.data.email).toBeUndefined();
  expect(safe.data.portal_token).toBeUndefined();

  const fromWebsite=await page.request.put("/api/guardians/"+id,{
    data:{preferredLocale:"ru"},
  });
  expect(fromWebsite.status(),await fromWebsite.text()).toBe(200);
  const fromMcp=await call("ccp_guardians_detail",{guardianId:id});
  expect(fromMcp.data.preferred_locale).toBe("ru");

  const invalid=await page.request.put("/api/guardians/"+id,{
    data:{preferredLocale:"de"},
  });
  expect(invalid.status()).toBe(400);
  const modelInvalid=await call("ccp_guardians_update",{
    guardianId:id,preferredLocale:"de",confirmed:true,
  });
  expect(modelInvalid.error?.code).toBe("VALIDATION_ERROR");
  expect((await readWebsite()).preferred_locale).toBe("ru");

  const cleared=await call("ccp_guardians_update",{
    guardianId:id,preferredLocale:null,confirmed:true,
  });
  expect(cleared.error).toBeUndefined();
  expect((await readWebsite()).preferred_locale).toBeNull();
  const afterTeacher=await call("ccp_teacher_profile_get",{});
  expect(afterTeacher.data.preferredLocale).toBe(initialLocale);
  const deleted=await call("ccp_guardians_delete",{guardianId:id,confirmed:true});
  expect(deleted.error).toBeUndefined();
});
