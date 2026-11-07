import { test, expect } from "@playwright/test";
import { SEED, signInAsTeacher } from "./helpers/auth";

// This is a ChessCoachPal-specific fresh-install flow. No CogNote compatibility
// expectations and no real student information; every new fixture is synthetic.
test("teacher creates a workplace, group lesson and attendance using shared API", async ({ page }) => {
  await signInAsTeacher(page);
  await page.goto("/coaching");
  await expect(page.getByRole("heading", { name: "Chess coaching" })).toBeVisible();

  const suffix = Date.now().toString(36);
  const workplace = `E2E Chess Club ${suffix}`;
  const group = `E2E Beginners ${suffix}`;
  const title = `E2E Pawn Endgames ${suffix}`;

  await page.getByLabel("New workplace name").fill(workplace);
  await page.getByRole("button", { name: "Create workplace" }).click();
  await expect(page.getByText("Workplace created.")).toBeVisible();

  await page.getByLabel("Workplace", { exact: true }).first().selectOption({ label: workplace });
  await page.getByLabel("New group name").fill(group);
  await page.getByRole("button", { name: "Create class group" }).click();
  await expect(page.getByText("Class group created.")).toBeVisible();

  await page.getByLabel("Group", { exact: true }).selectOption({ label: group });
  await page.getByLabel("Student", { exact: true }).selectOption({ label: SEED.students.emma });
  await page.getByRole("button", { name: "Enroll student" }).click();
  await expect(page.getByText("Student enrolled.")).toBeVisible();

  await page.getByLabel("Class group").selectOption({ label: group });
  await page.getByLabel("Topic or title").fill(title);
  await page.getByLabel("Local date and time (your browser timezone)").fill("2027-04-01T17:00");
  await page.getByLabel("Teaching note").fill("Reviewed opposition and king activity.");
  await page.getByRole("button", { name: "Create lesson" }).click();
  await expect(page.getByText("Lesson session created with a frozen attendance roster.")).toBeVisible();

  await expect(page.getByRole("button", { name: "Record attendance" })).toBeVisible();
  await page.getByRole("button", { name: "Record attendance" }).click();
  await expect(page.getByRole("button", { name: "Update attendance" })).toBeVisible();
  await expect(page.getByText("Attendance saved.")).toBeVisible();
});
