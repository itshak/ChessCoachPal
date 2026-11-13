import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SEED_TEACHER } from "./helpers/auth";
import { delegatedTool } from "./helpers/delegated-mcp";
import { mailpitMessagesTo } from "./helpers/mailpit";

/** A single reviewed, synthetic invoice; no real recipients or payments. */
test("PARITY:PARITY-billing-send-bulk-reviewed uses previews and at-most-once website/MCP delivery", async ({page, request}) => {
  const call = await delegatedTool(page, request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {persistSession: false, autoRefreshToken: false},
  });
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {persistSession: false, autoRefreshToken: false},
  });
  const signed = await anon.auth.signInWithPassword(SEED_TEACHER);
  expect(signed.error).toBeNull();
  const teacherId = signed.data.user!.id;

  const invoices: Array<{id: string; email: string; cents: number}> = [];
  for (let i = 0; i < 4; i++) {
    const email = "bulk-invoice-" + randomUUID() + "@example.com";
    const cents = 4100 + 1000 * i;
    const family = await admin.from("guardians").insert({
      teacher_id: teacherId, name: "Bulk recipient " + randomUUID(),
      email, portal_token: randomUUID(),
    }).select("id,portal_token").single();
    expect(family.error).toBeNull();
    const invoice = await admin.from("invoices").insert({
      teacher_id: teacherId, guardian_id: family.data!.id, status: "draft",
      period_start: "2042-08-01", period_end: "2042-08-31",
      currency: "USD", subtotal_cents: cents,
    }).select("id").single();
    expect(invoice.error).toBeNull();
    const invoiceId = invoice.data!.id as string;
    const line = await admin.from("invoice_items").insert({
      invoice_id: invoiceId, session_id:null,student_id:null, kind: "lesson",
      description: "Reviewed chess lesson charge",
      quantity: 1, unit_cents: cents, amount_cents: cents, sort_order: 0,
    });
    expect(line.error).toBeNull();
    const previewPath = "/api/billing/invoices/" + invoiceId + "/send";
    const browserPreview = await page.request.get(previewPath + "?includeRecipients=true");
    expect(browserPreview.status(), await browserPreview.text()).toBe(200);
    const site = await browserPreview.json();
    const modelPreview = await call("ccp_v1_billing_invoice_send_preview", {
      invoiceId, includeRecipients: true, confirmed: true,
    });
    expect(modelPreview.error).toBeUndefined();
    expect(modelPreview.data).toEqual(site);
    expect(site.subtotalCents).toBe(cents);
    expect(site.recipients).toEqual([email]);
    expect(site.deliveryPossible).toBe(true);
    expect(JSON.stringify(modelPreview.data)).not.toContain(family.data!.portal_token);
    invoices.push({id: invoiceId, email, cents});
  }

  const ids = invoices.map(item => item.id);
  const denied = await call("ccp_v1_billing_invoices_bulk", {
    ids, action: "send", confirmed: true,
  });
  expect(denied.error?.code).toBe("VALIDATION_ERROR");

  // A malformed browser batch is rejected before any invoices or emails change.
  const duplicate = await page.request.post("/api/billing/invoices/bulk", {
    data: {action: "send", ids: [ids[0], ids[0]]},
  });
  expect(duplicate.status()).toBe(400);
  for (const item of invoices) expect(await mailpitMessagesTo(request, item.email)).toHaveLength(0);

  const previewWeb=await page.request.post("/api/billing/invoices/bulk",{
    data:{action:"preview",ids:ids.slice(0,2),includeRecipients:true},
  });
  expect(previewWeb.status(),await previewWeb.text()).toBe(200);
  const webRead=await previewWeb.json();
  expect(webRead.ok).toBe(true);
  expect(webRead.readyCount).toBe(2);
  expect(webRead.results[0].preview.recipients).toEqual([invoices[0].email]);
  const previewModel=await call("ccp_v1_billing_invoices_bulk_preview",{
    ids:ids.slice(0,2),includeRecipients:true,confirmed:true,
  });
  expect(previewModel.error).toBeUndefined();
  expect(previewModel.data).toEqual(webRead);
  const deniedNoPreview=await page.request.post("/api/billing/invoices/bulk",{
    data:{action:"send",ids:ids.slice(0,2),confirmedEmail:true},
  });
  expect(deniedNoPreview.status()).toBe(400);

  const website = await page.request.post("/api/billing/invoices/bulk", {
    data: {action: "send", ids: ids.slice(0, 2),
      confirmedEmail:true,previewDigest:webRead.previewDigest},
  });
  expect(website.status(), await website.text()).toBe(200);
  const webBody = await website.json();
  expect(webBody).toMatchObject({ok: true, succeeded: 2, failed: []});
  expect(webBody.results.map((x: {id: string}) => x.id)).toEqual(ids.slice(0, 2));

  const mcpPreview=await call("ccp_v1_billing_invoices_bulk_preview",{
    ids:ids.slice(2),includeRecipients:true,confirmed:true,
  });
  expect(mcpPreview.error).toBeUndefined();
  expect(mcpPreview.data.readyCount).toBe(2);
  const mcp = await call("ccp_v1_billing_invoices_bulk", {
    ids: ids.slice(2), action: "send", confirmed: true, confirmedEmail: true,
    previewDigest:mcpPreview.data.previewDigest,
  });
  expect(mcp.error).toBeUndefined();
  expect(mcp.data).toMatchObject({ok: true, succeeded: 2, failed: []});
  expect(mcp.data.results.map((x: {id: string}) => x.id)).toEqual(ids.slice(2));

  for (const item of invoices) {
    await expect.poll(async () => (await mailpitMessagesTo(request, item.email)).length, {
      timeout: 10000,
    }).toBe(1);
    const browser = await page.request.get("/api/billing/invoices/" + item.id);
    expect(browser.status(), await browser.text()).toBe(200);
    const detail = await browser.json();
    expect(detail.status).toBe("sent");
    expect(detail.subtotal_cents).toBe(item.cents);
    const model = await call("ccp_v1_billing_invoice_detail", {invoiceId: item.id});
    expect(model.error).toBeUndefined();
    expect(model.data.status).toBe(detail.status);
    expect(model.data.subtotal_cents).toBe(item.cents);
  }

  // Retrying on the opposite client must not send duplicate mail.
  const mcpReplay = await call("ccp_v1_billing_invoices_bulk", {
    ids: ids.slice(0, 2), action: "send", confirmed: true, confirmedEmail: true,
    previewDigest:webRead.previewDigest,
  });
  expect(mcpReplay.error?.code).toBe("CONFLICT");
  const webReplay = await page.request.post("/api/billing/invoices/bulk", {
    data: {action: "send", ids: ids.slice(2),
      confirmedEmail:true,previewDigest:mcpPreview.data.previewDigest},
  });
  expect(webReplay.status(), await webReplay.text()).toBe(409);
  for (const item of invoices) expect(await mailpitMessagesTo(request, item.email)).toHaveLength(1);
});
