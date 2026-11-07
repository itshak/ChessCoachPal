import { test, expect } from "@playwright/test";
import { signInAsTeacher } from "./helpers/auth";

test("workplace report is teacher-scoped, counts group minutes once, and exports", async ({ page }) => {
  await signInAsTeacher(page);
  await page.goto("/coaching");
  const suffix = Date.now().toString(36);
  const action = async (name: string, payload: Record<string, unknown> = {}) => {
    const response = await page.request.post("/api/agent/v1", {
      data: { action: name, ...payload },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.ok).toBe(true);
    return body.data;
  };
  const workplace = await action("workplaces.create", { name: "Report " + suffix,
    timezone: "Asia/Jerusalem", currency: "ILS", locale: "he" });
  const student1 = await action("students.create", { name: "Report A " + suffix });
  const student2 = await action("students.create", { name: "Report B " + suffix });
  const group = await action("groups.create", { workplaceId: workplace.id, name: "Report group " + suffix });
  await action("groups.enroll", { groupId: group.id, studentId: student1.id });
  await action("groups.enroll", { groupId: group.id, studentId: student2.id });
  const session = await action("sessions.create", { workplaceId: workplace.id, groupId: group.id,
    title: "Report group lesson", startsAt: "2027-04-01T16:00:00Z", durationMinutes: 60,
    requestId: crypto.randomUUID() });
  await action("attendance.record", { sessionId: session.id, studentId: student1.id, status: "present" });
  await action("attendance.record", { sessionId: session.id, studentId: student2.id, status: "absent" });
  await expect(page.getByRole("heading", { name: "Teaching activity report" })).toBeVisible();
  // Separate component loads its workplace selector independently of the coaching workspace.
  await page.getByLabel("Report workplace").selectOption(workplace.id);
  await page.getByLabel("From date").fill("2027-04-01");
  await page.getByLabel("To date").fill("2027-04-02");
  await page.getByRole("button", { name: "Generate report" }).click();
  const panel = page.getByRole("region", { name: "Teaching activity report" });
  await expect(panel).toContainText("Teaching minutes: 60");
  await expect(panel).toContainText("Participants: 2");
  await expect(panel).toContainText("Present: 1");
  await expect(panel).toContainText("Absent: 1");
  await expect(panel.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await page.reload();
  await page.getByLabel("Report workplace").selectOption(workplace.id);
  await page.getByLabel("From date").fill("2027-04-01");
  await page.getByLabel("To date").fill("2027-04-02");
  await page.getByRole("button", { name: "Generate report" }).click();
  await expect(panel).toContainText("Teaching minutes: 60");
  const outsider = await page.request.get("/api/coaching/report?" + new URLSearchParams({
    workplaceId: "00000000-0000-0000-0000-000000000001", from: "2027-04-01", to: "2027-04-02",
  }));
  expect(outsider.status()).toBe(404);
  const badRange = await page.request.get("/api/coaching/report?" + new URLSearchParams({
    workplaceId: workplace.id, from: "2027-04-02", to: "2027-04-01",
  }));
  expect(badRange.status()).toBe(400);
});
