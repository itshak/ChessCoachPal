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
    await expect(page.locator("html")).toHaveAttribute("lang","he");
    await expect(page.locator("html")).toHaveAttribute("dir","rtl");
    await expect(page.getByLabel("שפת הממשק").first()).toHaveValue("he");
    await page.goto("/schedule");
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
    const mcp = await call("ccp_teacher_profile_update",{
      preferredLocale:"ru", confirmed:true
    });
    expect(mcp.error).toBeUndefined();
    expect(mcp.data.ok).toBe(true);
    await page.goto("/account");
    await expect(page.locator("html")).toHaveAttribute("lang","ru");
    await expect(page.locator("html")).toHaveAttribute("dir","ltr");
    await expect(page.getByLabel("Язык интерфейса").first()).toHaveValue("ru");
    await page.goto("/schedule");
    await expect(page.getByRole("heading",{name:"Расписание занятий"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Повторяющиеся уроки"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Кредиты на отработки"})).toBeVisible();
    await page.goto("/events");
    await expect(page.getByRole("heading",{name:"Шахматные мероприятия"})).toBeVisible();
    await page.goto("/families");
    await expect(page.getByRole("heading",{name:"Семьи"})).toBeVisible();
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
    await expect(page.locator("html")).toHaveAttribute("lang","he");
    await expect(page.locator("html")).toHaveAttribute("dir","rtl");
    await expect(page.getByRole("heading",{name:"יותר זמן לאימון. פחות זמן לניהול."})).toBeVisible();
    const next = await context.request.post("/api/preferences/locale",{
      data:{locale:"ru"}
    });
    expect(next.status()).toBe(200);
    await page.reload();
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
