import { test, expect } from "@playwright/test";
import { SEED, signInAsTeacher, studentListLink } from "./helpers/auth";

/**
 * Disposable GitHub Supabase fixtures only. Tests cover chess coaching and
 * retained schedule/family flows instead of removed music-practice links.
 */
test.describe.configure({ mode: "serial" });
test.describe("ChessCoachPal core browser flows", () => {
  test("seed teacher signs in to chess coaching dashboard", async ({ page }) => {
    await signInAsTeacher(page);
    await expect(page.getByText("Active students")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open coaching workspace" })).toBeVisible();
  });

  test("teacher creates a student and opens chess learning", async ({ page }) => {
    await signInAsTeacher(page);
    await page.goto("/students");
    const name=`E2E Chess Learner ${Date.now()}`;
    await page.getByPlaceholder("Student name").fill(name);
    await page.getByRole("button", { name: "Add Student" }).click();
    await expect(studentListLink(page,name)).toBeVisible();
    await studentListLink(page,name).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByLabel("Chess learning")).toBeVisible();
  });

  test("family portal contains schedule and no deleted practice-score links", async ({ page }) => {
    await page.goto(`/portal/${SEED.portalTokenJordan}`);
    await expect(page.getByText("Family Portal")).toBeVisible();
    await expect(page.getByText(/Welcome,/i)).toBeVisible();
    await expect(page.getByRole("heading",{name:"Upcoming Lessons"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Sheet Music"})).toHaveCount(0);
    await expect(page.getByRole("heading",{name:"Practice",exact:true})).toHaveCount(0);
  });

  test("teacher manages the retained scheduling and attendance flow", async ({ page }) => {
    await signInAsTeacher(page);
    await page.goto("/schedule");
    await expect(page.getByRole("heading",{name:"Schedule"})).toBeVisible();
    await expect(page.getByRole("button",{name:"Add One-off Lesson"})).toBeVisible();
    await page.goto("/learning");
    await expect(page.getByRole("heading",{name:"Chess learning"})).toBeVisible();
  });
});
