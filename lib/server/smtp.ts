/**
 * Minimal SMTP client for local dev delivery to Mailpit (no auth, no TLS).
 * Deliberately not a general-purpose SMTP implementation — production email
 * goes through the Resend provider in lib/email.ts. Zero dependencies so the
 * local stack needs nothing beyond `supabase start`.
 */

import net from "node:net";

export interface SmtpAttachment {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
}

export interface SmtpMessage {
  host: string;
  port: number;
  /** Envelope sender (bare address). */
  from: string;
  /** RFC 5322 From header, e.g. `"Studio (via ChessCoachPal)" <notifications@...>`. */
  fromHeader: string;
  to: string | string[];
  /**
   * Blind-copy recipients. Delivered via RCPT TO only; never written to the
   * message headers, so the family never sees the teacher's address.
   */
  bcc?: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: SmtpAttachment[];
}

const TIMEOUT_MS = 10_000;

/**
 * Envelope recipients: every To address plus every BCC address. BCC
 * recipients get a RCPT TO and no header. Exported for tests.
 */
export function smtpEnvelopeRecipients(
  msg: Pick<SmtpMessage, "to" | "bcc">
): string[] {
  const to = Array.isArray(msg.to) ? msg.to : [msg.to];
  const bcc = msg.bcc ? (Array.isArray(msg.bcc) ? msg.bcc : [msg.bcc]) : [];
  return [...to, ...bcc];
}

export async function sendViaSmtp(msg: SmtpMessage): Promise<void> {
  const socket = net.connect({ host: msg.host, port: msg.port });
  socket.setTimeout(TIMEOUT_MS);

  let buffer = "";
  let pending: { resolve: (line: string) => void; reject: (err: Error) => void } | null = null;

  const fail = (err: Error) => {
    socket.destroy();
    pending?.reject(err);
    pending = null;
  };

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    // SMTP replies end with "\r\n"; multiline replies use "250-..." continuation
    // lines, so wait until the final line ("250 ..." with a space) arrives.
    if (!buffer.endsWith("\r\n")) return;
    const lines = buffer.trimEnd().split("\r\n");
    const last = lines[lines.length - 1];
    if (last.length >= 4 && last[3] === "-") return;
    buffer = "";
    pending?.resolve(last);
    pending = null;
  });
  socket.on("error", (err) => fail(err));
  socket.on("timeout", () => fail(new Error("SMTP connection timed out")));

  const readReply = (expect: number): Promise<void> =>
    new Promise((resolve, reject) => {
      pending = {
        resolve: (line) => {
          const code = Number(line.slice(0, 3));
          if (code === expect) resolve();
          else reject(new Error(`Expected ${expect}, got: ${line}`));
        },
        reject,
      };
    });

  const send = (command: string, expect: number): Promise<void> => {
    const reply = readReply(expect);
    socket.write(command + "\r\n");
    return reply;
  };

  try {
    await readReply(220); // server greeting
    await send("EHLO localhost", 250);
    await send(`MAIL FROM:<${msg.from}>`, 250);
    for (const recipient of smtpEnvelopeRecipients(msg)) {
      await send(`RCPT TO:<${recipient}>`, 250);
    }
    await send("DATA", 354);
    await send(buildData(msg), 250);
    await send("QUIT", 221).catch(() => {}); // best-effort; message accepted
  } finally {
    socket.end();
    socket.destroy();
  }
}

/** Produce 7-bit MIME headers even for Hebrew and Cyrillic subjects/names.
 * SMTPUTF8 is not guaranteed by the local Mailpit transport or external SMTP.
 * A deliberately short UTF-8 chunk keeps each RFC 2047 encoded-word <75 chars.
 */
export function encodeMimeHeader(value:string):string{
  const clean=value.replace(/[\r\n\u0000-\u001f]+/g," ").trim();
  if(!/[^\x20-\x7e]/.test(clean))return clean;
  const parts:string[]=[];
  let chunk="";
  for(const ch of clean){
    if(chunk&&Buffer.byteLength(chunk+ch,"utf8")>36){
      parts.push(`=?UTF-8?B?${Buffer.from(chunk,"utf8").toString("base64")}?=`);
      chunk="";
    }
    chunk+=ch;
  }
  if(chunk)parts.push(`=?UTF-8?B?${Buffer.from(chunk,"utf8").toString("base64")}?=`);
  return parts.join("\r\n ");
}
function encodedFromHeader(header:string):string{
  const safe=header.replace(/[\r\n]+/g," ").trim();
  const match=/^"([^"]+)"\s*<([^<>]+)>$/.exec(safe);
  if(!match)return safe;
  // Only the display name is encoded; the SMTP mailbox stays an address.
  const name=match[1];
  return /[^\x20-\x7e]/.test(name)
    ? `${encodeMimeHeader(name)} <${match[2]}>`
    : safe;
}
function mimeBody(value:string):string{
  return Buffer.from(value,"utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n")??"";
}

/** Exported for tests. BCC recipients are intentionally absent from headers. */
export function buildData(msg: SmtpMessage): string {
  const headers = [
    `From: ${encodedFromHeader(msg.fromHeader)}`,
    `To: ${(Array.isArray(msg.to) ? msg.to.join(", ") : msg.to).replace(/[\r\n]+/g," ")}`,
    ...(msg.replyTo ? [`Reply-To: ${msg.replyTo.replace(/[\r\n]+/g," ")}`] : []),
    `Subject: ${encodeMimeHeader(msg.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
  ];

  const hasAttachments = (msg.attachments?.length ?? 0) > 0;
  let body: string;

  if (hasAttachments) {
    const mixed = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    headers.push(`Content-Type: multipart/mixed; boundary="${mixed}"`);
    const parts: string[] = [];
    parts.push(`--${mixed}`);
    parts.push(buildAlternativePart(msg));
    for (const att of msg.attachments!) {
      const b64 = Buffer.from(att.content).toString("base64");
      const wrapped = b64.replace(/(.{76})/g, "$1\r\n").trim();
      parts.push(`--${mixed}`);
      parts.push(
        `Content-Type: ${att.contentType ?? "application/octet-stream"}; name="${att.filename}"`
      );
      parts.push("Content-Transfer-Encoding: base64");
      parts.push(
        `Content-Disposition: attachment; filename="${att.filename}"`
      );
      parts.push("");
      parts.push(wrapped);
    }
    parts.push(`--${mixed}--`);
    body = parts.join("\r\n");
  } else if (msg.html) {
    const boundary = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      mimeBody(msg.text),
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      mimeBody(msg.html),
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    headers.push('Content-Type: text/plain; charset="utf-8"');
    headers.push("Content-Transfer-Encoding: base64");
    body = mimeBody(msg.text);
  }

  const data = headers.join("\r\n") + "\r\n\r\n" + body;
  // Dot-stuffing per RFC 5321 §4.5.2, then terminate DATA.
  return data.replace(/\r\n\./g, "\r\n..") + "\r\n.";
}

function buildAlternativePart(msg: SmtpMessage): string {
  if (!msg.html) {
    return [
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      mimeBody(msg.text),
    ].join("\r\n");
  }
  const boundary = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "",
    msg.text,
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    "",
    msg.html,
    `--${boundary}--`,
  ].join("\r\n");
}
