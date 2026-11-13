import { test, expect, type Page } from "@playwright/test";
import { signInAsTeacher } from "./helpers/auth";

const MOBILE_WIDTHS = [320, 360, 375, 412];

function overflowOf(page: Page) {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
}

/** Private canonical sessions require current workplace enrollment.
 * Seed that owned relationship through the same teacher website gateway
 * before testing the mobile lesson/attendance presentation. */
async function enrollForCalendar(page: Page, studentId: string) {
  const listed = await page.request.post("/api/agent/v1", {
    data: { action: "workplaces.list" },
  });
  expect(listed.status(), await listed.text()).toBe(200);
  const workplaces = (await listed.json()).data as Array<{ id: string }>;
  expect(workplaces.length).toBeGreaterThan(0);
  const enrolled = await page.request.post("/api/agent/v1", {
    data: { action: "workplaces.enroll", workplaceId: workplaces[0].id, studentId },
  });
  expect(enrolled.status(), await enrolled.text()).toBe(200);
}

test.describe("mobile layout", () => {
  test("schedule has no horizontal overflow across mobile widths", async ({
    page,
  }) => {
    await signInAsTeacher(page);

    for (const width of MOBILE_WIDTHS) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/schedule");
      await expect(
        page.getByRole("heading", { name: "Schedule" })
      ).toBeVisible();

      const overflow = await overflowOf(page);
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
        1
      );
    }
  });

  test("one-off lesson date input is labelled on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await signInAsTeacher(page);
    await page.goto("/schedule");

    await page.getByRole("button", { name: "+ Private session" }).click();
    await expect(page.getByLabel("Date")).toBeVisible();
  });

  test("long student names wrap without overflow", async ({ page }) => {
    const longName = `AlexandertheGreatLongnameExtraordinaire${Date.now()}`;
    let studentId: string | null = null;
    await page.setViewportSize({ width: 360, height: 812 });
    await signInAsTeacher(page);

    try {
      await page.goto("/students");
      await page.getByPlaceholder("Student name").fill(longName);
      await page.getByRole("button", { name: "Add Student" }).click();
      const studentLink = page.getByRole("link", {
        name: new RegExp(`^${longName}\\b`),
      });
      await expect(studentLink).toBeVisible();
      studentId = (await studentLink.getAttribute("href"))
        ?.split("/")
        .filter(Boolean)
        .pop() ?? null;
      expect(studentId).toBeTruthy();
      await enrollForCalendar(page, studentId!);

      // Use the canonical private-session form and frozen-roster calendar card.
      await page.goto("/schedule");
      await page.getByRole("button",{name:"+ Private session"}).click();
      await page.locator("select").filter({has:page.getByRole("option",{name:longName,exact:true})}).first().selectOption({label:longName});
      await page.getByRole("button",{name:"Create session"}).click();
      const card=page.locator("div.rounded-lg.border.border-border.bg-background")
        .filter({hasText:longName}).first();
      await expect(card).toBeVisible();
      const overflow=await overflowOf(page);
      expect(overflow,"canonical private-session card overflow").toBeLessThanOrEqual(1);
      const text=card.getByText(longName,{exact:true});
      const box=await text.boundingBox();
      if(!box)throw new Error("student roster label has no layout box");
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x+box.width).toBeLessThanOrEqual(361);

    } finally {
      if (studentId) {
        await page.request
          .delete(`/api/students/${studentId}`)
          .catch(() => undefined);
      }
    }
  });

  test("notifications panel stays inside the viewport on mobile", async ({
    page,
  }) => {
    await signInAsTeacher(page);

    for (const width of MOBILE_WIDTHS) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/schedule");
      await page.getByRole("button", { name: /^Notifications/ }).click();

      const panel = page.getByRole("dialog", { name: "Notifications" });
      await expect(panel).toBeVisible();

      const box = await panel.boundingBox();
      if (!box) throw new Error("notification panel has no layout box");
      expect(box.x, `panel left edge at ${width}px`).toBeGreaterThanOrEqual(-1);
      expect(
        box.x + box.width,
        `panel right edge at ${width}px`
      ).toBeLessThanOrEqual(width + 1);
      expect(
        await overflowOf(page),
        `overflow at ${width}px`
      ).toBeLessThanOrEqual(1);
    }
  });

  test("account menu has no blank band above Sign out", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await signInAsTeacher(page);
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Account menu" }).click();
    const help = page.getByRole("menuitem", { name: "Help" });
    const signOut = page.getByRole("menuitem", { name: "Sign out" });
    await expect(help).toBeVisible();
    await expect(signOut).toBeVisible();

    const above = await help.boundingBox();
    const below = await signOut.boundingBox();
    if (!above || !below) throw new Error("account menu has no layout box");

    // The iOS install hint is hidden on every other browser, but its wrapper kept
    // its border and padding anyway, so an empty band sat between Help and Sign
    // out with a divider on each side of it. One divider plus its margin is a few
    // pixels; the blank band measured roughly thirty.
    expect(below.y - (above.y + above.height)).toBeLessThanOrEqual(12);
  });

  test("chess learning page has no horizontal overflow on mobile", async ({
    page,
  }) => {
    await signInAsTeacher(page);

    for (const width of MOBILE_WIDTHS) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/learning");
      await expect(
        page.getByRole("heading", { name: "Chess learning" })
      ).toBeVisible();

      const overflow = await overflowOf(page);
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
        1
      );
    }
  });

  test("canonical attendance decisions remain usable on mobile", async ({page})=>{
    const name="MobileAttendance"+Date.now();
    await page.setViewportSize({width:360,height:812});
    await signInAsTeacher(page);
    await page.goto("/students");
    await page.getByPlaceholder("Student name").fill(name);
    await page.getByRole("button",{name:"Add Student"}).click();
    const studentLink=page.getByRole("link",{name:new RegExp("^"+name)});
    await expect(studentLink).toBeVisible();
    const studentId=(await studentLink.getAttribute("href"))?.split("/").filter(Boolean).pop();
    expect(studentId).toBeTruthy();
    await enrollForCalendar(page,studentId!);
    await page.goto("/schedule");
    await page.getByRole("button",{name:"+ Private session"}).click();
    await page.locator("select").filter({has:page.getByRole("option",{name:name,exact:true})}).first().selectOption({label:name});
    await page.getByRole("button",{name:"Create session"}).click();
    const card=page.locator("div.rounded-lg.border.border-border.bg-background")
      .filter({hasText:name}).first();
    await expect(card).toBeVisible();
    await card.getByRole("button",{name:"Attendance"}).click();
    const dialog=page.getByRole("dialog",{name:"Teaching session details"});
    await expect(dialog.getByLabel("Decision")).toBeVisible();
    for(const decision of ["Present","Arrived late","Absent / no-show",
       "Student cancelled","Teacher cancelled"]){
      await dialog.getByLabel("Decision").selectOption({label:decision});
      expect(await overflowOf(page),decision+" mobile overflow").toBeLessThanOrEqual(1);
    }
    await expect(dialog.getByRole("button",{name:"Save attendance"})).toBeVisible();
  });
});
