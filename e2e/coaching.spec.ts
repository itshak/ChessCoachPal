import { test, expect } from "@playwright/test";
import { signInAsTeacher } from "./helpers/auth";

test("fresh website workflow: two workplaces, canonical student, group/private lessons, notes and reload", async ({ page }) => {
  await signInAsTeacher(page);
  await page.goto("/coaching");
  await expect(page.getByRole("heading", { name: "Chess coaching" })).toBeVisible();
  const suffix = Date.now().toString(36);
  const workplaceA = `E2E Chess North ${suffix}`;
  const workplaceB = `E2E Chess South ${suffix}`;
  const student = `E2E Learner ${suffix}`;
  const group = `E2E Rooks ${suffix}`;
  const topic = `E2E Pawn Endgames ${suffix}`;

  await page.getByLabel("New workplace name").fill(workplaceA);
  await page.getByRole("button", { name: "Create workplace" }).click();
  await expect(page.getByRole("status")).toContainText("Workplace created.");
  await page.getByLabel("New workplace name").fill(workplaceB);
  await page.getByRole("button", { name: "Create workplace" }).click();
  await expect(page.getByLabel("Active workplace")).toContainText(workplaceB);
  await page.getByLabel("Active workplace").selectOption({ label: workplaceA });

  await page.getByLabel("New student name").fill(student);
  await page.getByLabel("New student skill level").fill("Pawn endings");
  await page.getByRole("button", { name: "Create student" }).click();
  await expect(page.getByRole("status")).toContainText("Student created.");
  await page.getByLabel("Student to edit").selectOption({ label: student });
  await page.getByLabel("Edit student skill level").fill("Rook endings");
  await page.getByRole("button", { name: "Save student" }).click();
  await expect(page.getByRole("status")).toContainText("Student saved.");

  await page.getByLabel("Student for workplace").selectOption({ label: student });
  await page.getByRole("button", { name: "Enroll in workplace" }).click();
  await expect(page.getByRole("status")).toContainText("Student enrolled in workplace.");

  await page.getByLabel("New group name").fill(group);
  await page.getByRole("button", { name: "Create class group" }).click();
  await expect(page.getByRole("status")).toContainText("Class group created.");
  await page.getByLabel("Group to enroll").selectOption({ label: group });
  await page.getByLabel("Student to enroll").selectOption({ label: student });
  await page.getByRole("button", { name: "Enroll student", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Student enrolled.");
  await expect(page.getByText("Current group register").locator("..")).toContainText(student);

  await page.getByLabel("Session group").selectOption({ label: group });
  await page.getByLabel("Topic or title").fill(topic);
  await page.getByLabel("Local date and time (selected workplace timezone)").fill("2027-04-01T17:00");
  await page.getByLabel("Teaching note").fill("Opposition.");
  await page.getByRole("button", { name: "Create lesson" }).click();
  await expect(page.getByRole("status")).toContainText("Lesson session created");
  await expect(page.getByRole("button", { name: "Record attendance" })).toBeVisible();
  await page.getByLabel("Attendance").selectOption("absent");
  await page.getByLabel("Student note").fill("Absent with notice");
  await page.getByRole("button", { name: "Record attendance" }).click();
  await expect(page.getByRole("status")).toContainText("Attendance saved.");
  await page.getByLabel("Shared session note").fill("Improved opposition and calculation");
  await page.getByLabel("Session status").selectOption("completed");
  await page.getByRole("button", { name: "Save session changes" }).click();
  await expect(page.getByRole("status")).toContainText("Session changes saved.");

  await page.getByLabel("Lesson type").selectOption("private");
  await page.getByLabel("Private student").selectOption({ label: student });
  await page.getByLabel("Topic or title").fill(`E2E Private ${suffix}`);
  await page.getByLabel("Local date and time (selected workplace timezone)").fill("2027-04-02T15:00");
  await page.getByRole("button", { name: "Create lesson" }).click();
  await expect(page.getByRole("status")).toContainText("Lesson session created");
  await expect(page.getByText(/Instructor time in this workplace/)).toContainText("120 minutes");
  await page.getByLabel("Session status").selectOption("cancelled");
  await page.getByRole("button", { name: "Save session changes" }).click();
  await expect(page.getByText(/Instructor time in this workplace/)).toContainText("60 minutes");

  // The same student identity may enroll elsewhere; no duplicate student is created.
  await page.getByLabel("Active workplace").selectOption({ label: workplaceB });
  await page.getByLabel("Student for workplace").selectOption({ label: student });
  await page.getByRole("button", { name: "Enroll in workplace" }).click();
  await expect(page.getByRole("status")).toContainText("Student enrolled in workplace.");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Chess coaching" })).toBeVisible();
  await page.getByLabel("Active workplace").selectOption({ label: workplaceA });
  const lesson = page.getByLabel("Lesson", { exact: true });
  const option = lesson.locator("option").filter({ hasText: topic });
  const sessionId = await option.getAttribute("value");
  expect(sessionId).toBeTruthy();
  await lesson.selectOption(sessionId!);
  await expect(page.getByLabel("Shared session note")).toHaveValue("Improved opposition and calculation");
  await expect(page.getByLabel("Attendance")).toHaveValue("absent");
  await expect(page.getByLabel("Student note")).toHaveValue("Absent with notice");
  await expect(page.getByLabel("Session status")).toHaveValue("completed");
  await expect(page.getByText(/Instructor time in this workplace/)).toContainText("60 minutes");
});
