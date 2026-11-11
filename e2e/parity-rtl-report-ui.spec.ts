import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {reportCsv} from "../lib/coaching-report";

test("PARITY:PARITY-reports-hebrew-rtl-csv renders RTL and exports exact MCP-local calendar totals safely",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const workplace=await call("ccp_v1_workplaces_create",{
   name:"מועדון שחמט "+randomUUID().slice(0,8),timezone:"Asia/Jerusalem",
   currency:"ILS",locale:"he",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const student=await call("ccp_v1_students_create",{
   name:"=SUM(1+1) משה "+randomUUID().slice(0,8),
   idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const enrolled=await call("ccp_v1_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
 });
 expect(enrolled.error).toBeUndefined();
 // 22:30 UTC is already the next day in Jerusalem summer time.
 for(const startsAt of ["2042-07-14T22:30:00.000Z","2042-07-15T22:30:00.000Z"]){
   const created=await call("ccp_v1_sessions_create",{
     workplaceId,studentId,title:"סיום צריח",startsAt,durationMinutes:50,
     lessonNote:"No accidental public student details",
     idempotencyKey:randomUUID(),
   });
   expect(created.error).toBeUndefined();
 }
 const date="2042-07-15";
 const url="/api/coaching/report?"+new URLSearchParams({
   workplaceId,from:date,to:date,
 });
 const browserApi=await page.request.get(url);
 expect(browserApi.status(),await browserApi.text()).toBe(200);
 const site=await browserApi.json();
 const mcp=await call("ccp_v1_reports_workplace_summary",{
   workplaceId,from:date,to:date,format:"json",
 });
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(site);
 expect(site.report.sessions).toBe(1);
 expect(site.report.teachingMinutes).toBe(50);
 expect(site.report.locale).toBe("he");
 await page.goto("/coaching");
 const region=page.locator('section[aria-label="Teaching activity report"]');
 await expect(region).toBeVisible();
 await region.getByLabel("Report workplace").selectOption(workplaceId);
 await expect(region).toHaveAttribute("dir","rtl");
 await region.getByLabel("From date").fill(date);
 await region.getByLabel("To date").fill(date);
 await region.getByRole("button",{name:"Generate report"}).click();
 const output=region.locator('[aria-live="polite"]');
 await expect(output).toBeVisible();
 await expect(output).toContainText("Teaching minutes: 50");
 await expect(output).toContainText("Time zone: Asia/Jerusalem");
 const [download]=await Promise.all([
   page.waitForEvent("download"),
   region.getByRole("button",{name:"Export CSV"}).click(),
 ]);
 expect(download.suggestedFilename()).toBe("chesscoachpal-report.csv");
 const path=await download.path();
 expect(path).toBeTruthy();
 const csv=await readFile(path!,"utf8");
 expect(csv).toBe(reportCsv(site.report));
 expect(csv).toBe("\uFEFF"+csv.slice(1));
 expect(csv).not.toContain("=SUM(1+1)");
 expect(csv).not.toContain("מֹשה");
 const mcpCsv=await call("ccp_v1_reports_workplace_summary",{
   workplaceId,from:date,to:date,format:"csv",
 });
 expect(mcpCsv.error).toBeUndefined();
 expect(mcpCsv.data.export).toBe(csv);
});
