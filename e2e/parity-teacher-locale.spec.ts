import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: teacher language preference persists identically via website and MCP", async ({page,request}) => {
  const call = await delegatedTool(page,request);
  const original = await call("ccp_teacher_profile_get",{});
  expect(original.error).toBeUndefined();
  const initial = original.data.preferredLocale as "en"|"he"|"ru";
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,{
      auth:{persistSession:false,autoRefreshToken:false},
    });
  const teacher=await page.request.get("/api/teacher/context");
  expect(teacher.status()).toBe(200);
  const teacherId=(await teacher.json()).teacherId as string;
  const checkAuthEmailLanguage=async(locale:"en"|"he"|"ru")=>{
    const {data,error}=await admin.auth.admin.getUserById(teacherId);
    expect(error).toBeNull();
    expect(data.user?.user_metadata?.preferred_locale).toBe(locale);
  };
  const readWorkplaceContracts=async()=>{
    const result=await call("ccp_workplaces_list",{});
    expect(result.error).toBeUndefined();
    return (result.data as Array<{
      id:string;timezone:string;currency:string;locale:string;
    }>).map(({id,timezone,currency,locale})=>({id,timezone,currency,locale}));
  };
  // A teacher's display language must not silently modify any workplace's
  // business locale, billing currency or timezone (including a seeded legacy
  // workplace). Compare through the live authenticated MCP data service.
  const originalWorkplaces=await readWorkplaceContracts();
  try {
    const web = await page.request.put("/api/auth/update-profile", {
      data:{preferredLocale:"he"}
    });
    expect(web.status(),await web.text()).toBe(200);
    const read = await call("ccp_teacher_profile_get",{});
    expect(read.error).toBeUndefined();
    expect(read.data.preferredLocale).toBe("he");
    await checkAuthEmailLanguage("he");
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
    await checkAuthEmailLanguage("ru");
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
    expect(await readWorkplaceContracts()).toEqual(originalWorkplaces);
  } finally {
    const restore = await page.request.put("/api/auth/update-profile",{
      data:{preferredLocale:initial}
    });
    expect(restore.status(),await restore.text()).toBe(200);
    await checkAuthEmailLanguage(initial);
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

test("anonymous explicitly scoped portal renders English, Hebrew RTL, Russian without leaking other learners",async({page,request,browser})=>{
  const call=await delegatedTool(page,request);
  const student=await call("ccp_students_create",{
    name:"Portal language learner "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const workplace=await call("ccp_workplaces_create",{
    name:"Localized portal classroom "+randomUUID(),timezone:"UTC",
    currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
  });
  expect(workplace.error).toBeUndefined();
  const workplaceId=workplace.data.entityId as string;
  const enrolled=await call("ccp_workplaces_enroll",{
    workplaceId,studentId,idempotencyKey:randomUUID(),
  });
  expect(enrolled.error).toBeUndefined();
  const contact=await call("ccp_contacts_create",{
    displayName:"Portal locale parent "+randomUUID(),
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(contact.error).toBeUndefined();
  const linked=await call("ccp_student_contacts_link",{
    studentId,contactId:contact.data.id,relationshipLabel:"Parent",
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(linked.error).toBeUndefined();
  const grant=await call("ccp_portal_grants_create",{
    studentId,contactId:contact.data.id,workplaceId,
    permissions:["calendar"],expiresAt:new Date(Date.now()+20*86400000).toISOString(),
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(grant.error).toBeUndefined();
  const issued=await page.request.post("/api/portal-grants/"+grant.data.id+"/issue",{
    headers:{origin:"http://localhost:3000"},
    data:{expectedRevision:1,confirmed:true},
  });
  expect(issued.status(),await issued.text()).toBe(200);
  const pathname=new URL((await issued.json()).url).pathname;
  const context=await browser.newContext({
    baseURL:"http://localhost:3000",viewport:{width:390,height:844},
  });
  try{
    const guest=await context.newPage();
    for(const [locale,dir,heading] of [
      ["en","ltr","Upcoming Lessons"],
      ["he","rtl","שיעורים קרובים"],
      ["ru","ltr","Предстоящие уроки"]
    ] as const){
      const setting=await context.request.post("/api/preferences/locale",{data:{locale}});
      expect(setting.status(),await setting.text()).toBe(200);
      const response=await guest.goto(pathname);
      expect(response?.status()).toBe(200);
      await expect(guest.locator("html")).toHaveAttribute("lang",locale);
      await expect(guest.locator("html")).toHaveAttribute("dir",dir);
      await expect(guest.getByRole("heading",{name:heading})).toBeVisible();
      const over=await guest.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      expect(over,locale+" portal horizontal overflow").toBeLessThanOrEqual(2);
      expect(await guest.locator("body").innerText()).toContain("Portal locale parent");
    }
    await expect(guest.getByLabel("Язык интерфейса")).toHaveValue("ru");
    // Old broad household tokens do not authorize anything.
    expect((await context.request.get("/portal/dev-portal-jordan")).status()).toBe(404);
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

test("PARITY: contact communication locale round-trips website/MCP independently of teacher UI",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const initialTeacher=await call("ccp_teacher_profile_get",{});
  expect(initialTeacher.error).toBeUndefined();
  const initialLocale=initialTeacher.data.preferredLocale;
  const created=await call("ccp_contacts_create",{
    displayName:"Localized contact "+randomUUID(),preferredLocale:"he",
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(created.error).toBeUndefined();
  const contactId=created.data.id as string;
  const readWebsite=async()=>{
    const res=await page.request.get("/api/contacts/"+contactId);
    expect(res.status(),await res.text()).toBe(200);
    return await res.json() as {preferredLocale:string|null;revision:number};
  };
  expect((await readWebsite()).preferredLocale).toBe("he");
  const safe=await call("ccp_contacts_detail",{contactId});
  expect(safe.error).toBeUndefined();
  expect(safe.data.preferredLocale).toBeUndefined();
  expect(safe.data.email).toBeUndefined();
  const fromWebsite=await page.request.patch("/api/contacts/"+contactId,{
    data:{preferredLocale:"ru",expectedRevision:1,idempotencyKey:randomUUID()},
  });
  expect(fromWebsite.status(),await fromWebsite.text()).toBe(200);
  const fromMcp=await call("ccp_contacts_detail",{
    contactId,includeDetails:true,confirmed:true,
  });
  expect(fromMcp.data.preferredLocale).toBe("ru");
  const invalid=await page.request.patch("/api/contacts/"+contactId,{
    data:{preferredLocale:"de",expectedRevision:2,idempotencyKey:randomUUID()},
  });
  expect(invalid.status()).toBe(400);
  const modelInvalid=await call("ccp_contacts_update",{
    contactId,preferredLocale:"de",expectedRevision:2,
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(modelInvalid.error?.code).toBe("VALIDATION_ERROR");
  expect((await readWebsite()).preferredLocale).toBe("ru");
  const cleared=await call("ccp_contacts_update",{
    contactId,preferredLocale:null,expectedRevision:2,
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(cleared.error).toBeUndefined();
  expect((await readWebsite()).preferredLocale).toBeNull();
  const afterTeacher=await call("ccp_teacher_profile_get",{});
  expect(afterTeacher.data.preferredLocale).toBe(initialLocale);
});

test("LANGUAGE: changing interface language in one authenticated tab reloads another tab with the same SSR direction",async({page})=>{
  const {signInAsTeacher}=await import("./helpers/auth");
  await signInAsTeacher(page);
  const profile=await page.request.get("/api/teacher/context");
  expect(profile.status()).toBe(200);
  const original=(await profile.json()).preferredLocale as "en"|"he"|"ru";
  const alternate=original==="he"?"ru":"he";
  const direction=alternate==="he"?"rtl":"ltr";
  const second=await page.context().newPage();
  try{
    await page.goto("/account");
    await second.goto("/account");
    await page.locator("#account-language").selectOption(alternate);
    await expect(page.locator("html")).toHaveAttribute("lang",alternate);
    await expect(second.locator("html")).toHaveAttribute("lang",alternate);
    await expect(second.locator("html")).toHaveAttribute("dir",direction);
    await expect(second.locator("#account-language")).toHaveValue(alternate);
  }finally{
    const restored=await page.request.put("/api/auth/update-profile",{
      data:{preferredLocale:original},
    });
    expect(restored.status(),await restored.text()).toBe(200);
    await second.close();
  }
});

test("RTL: account theme switch thumb stays within its track in both states",async({page})=>{
  const {signInAsTeacher}=await import("./helpers/auth");
  await signInAsTeacher(page);
  const original=(await (await page.request.get("/api/teacher/context")).json())
    .preferredLocale as "en"|"he"|"ru";
  try{
    const response=await page.request.put("/api/auth/update-profile",{
      data:{preferredLocale:"he"},
    });
    expect(response.status()).toBe(200);
    await page.setViewportSize({width:390,height:844});
    await page.goto("/dashboard");
    await page.getByRole("button",{name:"תפריט חשבון"}).click();
    const toggle=page.getByRole("switch");
    await expect(toggle).toBeVisible();
    const assertInside=async()=>{
      const track=await toggle.boundingBox();
      const thumb=await toggle.locator("span").boundingBox();
      expect(track).not.toBeNull();expect(thumb).not.toBeNull();
      expect(thumb!.x, "thumb must not leave the track on the left")
        .toBeGreaterThanOrEqual(track!.x-1);
      expect(thumb!.x+thumb!.width, "thumb must not leave the track on the right")
        .toBeLessThanOrEqual(track!.x+track!.width+1);
    };
    const before=await toggle.getAttribute("aria-checked");
    await assertInside();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked",before==="true"?"false":"true");
    await page.waitForTimeout(230); // CSS transition must complete before geometry assertion.
    await assertInside();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked",before!);
  }finally{
    const restored=await page.request.put("/api/auth/update-profile",{
      data:{preferredLocale:original},
    });
    expect(restored.status(),await restored.text()).toBe(200);
  }
});
