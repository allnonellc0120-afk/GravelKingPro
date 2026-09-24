/**
 * Integration regression: an anonymous visitor claiming an email already
 * owned by another user must link the existing account instead of violating
 * either users.email or users.session_id uniqueness.
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";
import { ReplitConnectors } from "@replit/connectors-sdk";

import { db, emailCaptureTable, usersTable } from "@workspace/db";
import app from "../app";

process.env.ADMIN_KEY = process.env.ADMIN_KEY || "email-capture-test-admin-key";

type ProxyCall = {
  connectorName: string;
  path: string;
  body?: Record<string, unknown>;
};

function response(status: number, body = ""): Response {
  return new Response(body, {
    status,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

function decodeBase64Url(raw: string): string {
  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (raw.length % 4)) % 4);
  return Buffer.from(base64, "base64").toString("utf8");
}

async function main(): Promise<void> {
  const run = randomUUID();
  const email = `duplicate-email-${run}@example.test`;
  const ownerId = `email-owner-${run}`;
  const anonymousId = `email-anonymous-${run}`;
  const anonymousSessionId = `anonymous-session-${run}`;
  const captureServer = http.createServer(app);

  await db.insert(usersTable).values({
    id: ownerId,
    email,
  });
  await db.insert(usersTable).values({
    id: anonymousId,
    sessionId: anonymousSessionId,
  });

  try {
    await new Promise<void>((resolve) => captureServer.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(captureServer.address() as AddressInfo).port}`;
    const response = await fetch(`${base}/api/email-capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `gk_session=${anonymousSessionId}`,
      },
      body: JSON.stringify({
        email: email.toUpperCase(),
        source: "duplicate-email-regression",
      }),
    });
    const body = await response.json() as { ok?: boolean; error?: string };
    if (response.status !== 200 || body.ok !== true) {
      throw new Error(`duplicate-email capture failed: ${response.status} ${JSON.stringify(body)}`);
    }

    const [owner] = await db
      .select({ email: usersTable.email, sessionId: usersTable.sessionId })
      .from(usersTable)
      .where(eq(usersTable.id, ownerId));
    const [anonymous] = await db
      .select({ email: usersTable.email, sessionId: usersTable.sessionId })
      .from(usersTable)
      .where(eq(usersTable.id, anonymousId));
    if (owner?.email !== email || owner.sessionId !== anonymousSessionId) {
      throw new Error(`existing owner was not linked to the anonymous session: ${JSON.stringify(owner)}`);
    }
    if (anonymous?.sessionId !== null || anonymous.email !== null) {
      throw new Error(`anonymous row still owns identity state: ${JSON.stringify(anonymous)}`);
    }

    console.log("duplicate-email capture returns 200 and links the existing account");
  } finally {
    await new Promise<void>((resolve) => captureServer.close(() => resolve()));
    await db.delete(emailCaptureTable).where(eq(emailCaptureTable.email, email)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, anonymousId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, ownerId)).catch(() => {});
  }

  const sendGridEmails = Array.from(
    { length: 103 },
    (_, index) => `sendgrid-${run}-${index}@example.test`,
  );
  const gmailEmails = Array.from(
    { length: 81 },
    (_, index) => `gmail-${run}-${index}@example.test`,
  );
  const capturedEmails = [...sendGridEmails, ...gmailEmails];
  const existingRows = await db.select({ email: emailCaptureTable.email }).from(emailCaptureTable);
  const existingEmails = [...new Set(existingRows.map((row) => row.email))];
  const sendGridRecipientsExpected = [...new Set([...existingEmails, ...sendGridEmails])];
  const composerSource = readFileSync(
    fileURLToPath(new URL("../../../gravelkingpro/src/pages/admin-emails.tsx", import.meta.url)),
    "utf8",
  );
  if (
    !composerSource.includes("onClick={() => setConfirming(true)}")
    || !composerSource.includes("onClick={() => void blast()}")
    || !composerSource.includes("/api/admin/email-blast/preview")
    || !composerSource.includes("previewId: activePreview?.id")
  ) {
    throw new Error("email blast preview/confirmation flow is missing");
  }
  const proxyCalls: ProxyCall[] = [];
  let sendGridResults: boolean[] = [];
  let gmailResults: boolean[] = [];
  const originalProxy = ReplitConnectors.prototype.proxy;

  ReplitConnectors.prototype.proxy = async function (connectorName, path, options) {
    const body = typeof options?.body === "string"
      ? JSON.parse(options.body) as Record<string, unknown>
      : undefined;
    proxyCalls.push({ connectorName, path, body });

    if (connectorName === "sendgrid" && path === "/v3/mail/send") {
      return response((sendGridResults.shift() ?? true) ? 202 : 500, "mock sendgrid response");
    }
    if (connectorName === "google-mail" && path === "/gmail/v1/users/me/profile") {
      return response(200, JSON.stringify({ emailAddress: "owner@example.test" }));
    }
    if (connectorName === "google-mail" && path === "/gmail/v1/users/me/messages/send") {
      return response((gmailResults.shift() ?? true) ? 200 : 500, "mock gmail response");
    }
    throw new Error(`Unexpected connector proxy call: ${connectorName} ${path}`);
  };

  const appServer = http.createServer(app);
  try {
    await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
    const adminHeaders = {
      "Content-Type": "application/json",
      "x-admin-key": process.env.ADMIN_KEY!,
    };

    // Loading the staged composer or submitting incomplete copy must not touch
    // a provider. The provider call is only made by the UI's second,
    // confirmation-gated action.
    const incomplete = await fetch(`${base}/api/admin/email-blast`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ provider: "sendgrid" }),
    });
    if (incomplete.status !== 400 || proxyCalls.length !== 0) {
      throw new Error(`email blast bypassed confirmation-gated copy validation: ${incomplete.status}`);
    }

    await db.insert(emailCaptureTable).values(
      sendGridEmails.map((capturedEmail) => ({
        email: capturedEmail,
        source: "email-blast-integration",
      })),
    );

    // SendGrid: the first chunk succeeds and the second fails. Any additional
    // chunks (only possible when the database already has many captures)
    // succeed, and the successful chunks must not be sent again.
    const sendGridTotal = sendGridRecipientsExpected.length;
    const sendGridBatches = Math.ceil(sendGridTotal / 100);
    sendGridResults = Array.from({ length: sendGridBatches }, (_, index) => index !== 1);
    const sendGridPreviewResponse = await fetch(`${base}/api/admin/email-blast/preview`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ provider: "sendgrid" }),
    });
    const sendGridPreview = await sendGridPreviewResponse.json() as {
      previewId?: string;
      provider?: string;
      total?: number;
      batches?: number;
    };
    if (
      sendGridPreviewResponse.status !== 200
      || !sendGridPreview.previewId
      || sendGridPreview.provider !== "sendgrid"
      || sendGridPreview.total !== sendGridTotal
      || sendGridPreview.batches !== sendGridBatches
    ) {
      throw new Error(`unexpected SendGrid preview: ${JSON.stringify(sendGridPreview)}`);
    }
    const mismatchedProviderResponse = await fetch(`${base}/api/admin/email-blast`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        provider: "gmail",
        previewId: sendGridPreview.previewId,
        subject: "Provider mismatch must not send",
        body: "This request should be rejected before delivery.",
      }),
    });
    if (mismatchedProviderResponse.status !== 409 || proxyCalls.length !== 0) {
      throw new Error(`provider change bypassed preview invalidation: ${mismatchedProviderResponse.status}`);
    }
    proxyCalls.length = 0;
    const sendGridResponse = await fetch(`${base}/api/admin/email-blast`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        provider: "sendgrid",
        previewId: sendGridPreview.previewId,
        subject: "SendGrid integration test",
        body: "This is a test message.",
      }),
    });
    const sendGridResult = await sendGridResponse.json() as {
      ok?: boolean;
      provider?: string;
      sent?: number;
      failed?: number;
      failedRecipients?: string[];
      batches?: number;
      total?: number;
    };
    if (
      sendGridResponse.status !== 200
      || sendGridResult.ok !== false
      || sendGridResult.provider !== "sendgrid"
      || sendGridResult.sent !== sendGridTotal - Math.min(100, sendGridTotal - 100)
      || sendGridResult.failed !== Math.min(100, sendGridTotal - 100)
      || sendGridResult.batches !== sendGridBatches
      || sendGridResult.total !== sendGridTotal
    ) {
      throw new Error(`unexpected SendGrid partial result: ${JSON.stringify(sendGridResult)}`);
    }

    const sendGridCalls = proxyCalls.filter(
      (call) => call.connectorName === "sendgrid" && call.path === "/v3/mail/send",
    );
    if (sendGridCalls.length !== sendGridBatches || proxyCalls.length !== sendGridBatches) {
      throw new Error(`SendGrid retried a batch or made an unexpected call: ${proxyCalls.length}`);
    }
    const sendGridRecipients = new Set<string>();
    const sendGridBatchRecipients: string[][] = [];
    for (const [index, call] of sendGridCalls.entries()) {
      const personalizations = call.body?.personalizations;
      if (!Array.isArray(personalizations)) {
        throw new Error(`SendGrid batch ${index + 1} did not contain personalizations`);
      }
      const expectedSize = Math.min(100, sendGridTotal - index * 100);
      if (personalizations.length !== expectedSize) {
        throw new Error(`SendGrid batch ${index + 1} had ${personalizations.length} recipients`);
      }
      const batchRecipients: string[] = [];
      for (const personalization of personalizations) {
        const recipients = (personalization as { to?: Array<{ email?: string }> }).to;
        if (!recipients || recipients.length !== 1 || !recipients[0]?.email) {
          throw new Error("SendGrid exposed recipients through a shared personalization");
        }
        sendGridRecipients.add(recipients[0].email);
        batchRecipients.push(recipients[0].email);
      }
      sendGridBatchRecipients.push(batchRecipients);
    }
    if (sendGridRecipients.size !== sendGridTotal) {
      throw new Error(`SendGrid sent ${sendGridRecipients.size} unique recipients instead of ${sendGridTotal}`);
    }
    const failedSendGridRecipients = new Set(sendGridBatchRecipients[1]);
    if (
      failedSendGridRecipients.size !== sendGridResult.failed
      || new Set(sendGridResult.failedRecipients ?? []).size !== failedSendGridRecipients.size
      || (sendGridResult.failedRecipients ?? []).some((email) => !failedSendGridRecipients.has(email))
    ) {
      throw new Error(`SendGrid did not report exactly the failed batch: ${JSON.stringify(sendGridResult)}`);
    }

    // Retry only the addresses returned as failed. The successful first and
    // last batches must not appear in this request.
    sendGridResults = [true];
    proxyCalls.length = 0;
    const sendGridRetryResponse = await fetch(`${base}/api/admin/email-blast`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        provider: "sendgrid",
        subject: "SendGrid integration test",
        body: "This is a test message.",
        recipients: sendGridResult.failedRecipients,
      }),
    });
    const sendGridRetryResult = await sendGridRetryResponse.json() as {
      ok?: boolean;
      sent?: number;
      failed?: number;
      failedRecipients?: string[];
      total?: number;
    };
    const sendGridRetryCalls = proxyCalls.filter(
      (call) => call.connectorName === "sendgrid" && call.path === "/v3/mail/send",
    );
    const sendGridRetryPersonalizations = sendGridRetryCalls[0]?.body?.personalizations;
    const sendGridRetryRecipients = new Set(
      Array.isArray(sendGridRetryPersonalizations)
        ? sendGridRetryPersonalizations.map(
          (personalization) => (personalization as { to?: Array<{ email?: string }> }).to?.[0]?.email,
        ).filter((email): email is string => Boolean(email))
        : [],
    );
    if (
      sendGridRetryResponse.status !== 200
      || sendGridRetryResult.ok !== true
      || sendGridRetryResult.sent !== failedSendGridRecipients.size
      || sendGridRetryResult.failed !== 0
      || sendGridRetryResult.total !== failedSendGridRecipients.size
      || (sendGridRetryResult.failedRecipients ?? []).length !== 0
      || sendGridRetryCalls.length !== 1
      || sendGridRetryRecipients.size !== failedSendGridRecipients.size
      || [...sendGridRetryRecipients].some((email) => !failedSendGridRecipients.has(email))
    ) {
      throw new Error(`SendGrid retry included successful recipients: ${JSON.stringify({
        result: sendGridRetryResult,
        recipients: [...sendGridRetryRecipients],
      })}`);
    }

    // Gmail: the first BCC chunk succeeds and the second fails. Any additional
    // chunks succeed, and neither successful chunk is retried.
    await db.delete(emailCaptureTable).where(inArray(emailCaptureTable.email, capturedEmails));
    await db.insert(emailCaptureTable).values(
      gmailEmails.map((capturedEmail) => ({
        email: capturedEmail,
        source: "email-blast-integration",
      })),
    );
    const gmailRecipientsExpected = [...new Set([...existingEmails, ...gmailEmails])];
    const gmailTotal = gmailRecipientsExpected.length;
    const gmailBatches = Math.ceil(gmailTotal / 40);
    gmailResults = Array.from({ length: gmailBatches }, (_, index) => index !== 1);
    const gmailPreviewResponse = await fetch(`${base}/api/admin/email-blast/preview`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ provider: "gmail" }),
    });
    const gmailPreview = await gmailPreviewResponse.json() as {
      previewId?: string;
      provider?: string;
      total?: number;
      batches?: number;
    };
    if (
      gmailPreviewResponse.status !== 200
      || !gmailPreview.previewId
      || gmailPreview.provider !== "gmail"
      || gmailPreview.total !== gmailTotal
      || gmailPreview.batches !== gmailBatches
    ) {
      throw new Error(`unexpected Gmail preview: ${JSON.stringify(gmailPreview)}`);
    }
    proxyCalls.length = 0;
    const gmailResponse = await fetch(`${base}/api/admin/email-blast`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        provider: "gmail",
        previewId: gmailPreview.previewId,
        subject: "Gmail integration test",
        body: "This is a test message.",
      }),
    });
    const gmailResult = await gmailResponse.json() as {
      ok?: boolean;
      provider?: string;
      sent?: number;
      failed?: number;
      failedRecipients?: string[];
      batches?: number;
      total?: number;
    };
    if (
      gmailResponse.status !== 200
      || gmailResult.ok !== false
      || gmailResult.provider !== "gmail"
      || gmailResult.sent !== gmailTotal - Math.min(40, gmailTotal - 40)
      || gmailResult.failed !== Math.min(40, gmailTotal - 40)
      || gmailResult.batches !== gmailBatches
      || gmailResult.total !== gmailTotal
    ) {
      throw new Error(`unexpected Gmail partial result: ${JSON.stringify(gmailResult)}`);
    }

    const gmailSendCalls = proxyCalls.filter(
      (call) => call.connectorName === "google-mail" && call.path === "/gmail/v1/users/me/messages/send",
    );
    const profileCalls = proxyCalls.filter(
      (call) => call.connectorName === "google-mail" && call.path === "/gmail/v1/users/me/profile",
    );
    if (profileCalls.length !== 1 || gmailSendCalls.length !== gmailBatches || proxyCalls.length !== gmailBatches + 1) {
      throw new Error(`Gmail retried a batch or made an unexpected call: ${proxyCalls.length}`);
    }
    const gmailRecipients = new Set<string>();
    for (const call of gmailSendCalls) {
      const raw = call.body?.raw;
      if (typeof raw !== "string") throw new Error("Gmail send did not contain an RFC 2822 message");
      const message = decodeBase64Url(raw);
      const to = message.match(/^To: (.+)$/m)?.[1];
      const bcc = message.match(/^Bcc: (.+)$/m)?.[1];
      if (to !== "owner@example.test" || !bcc) {
        throw new Error(`Gmail batch did not use a private BCC message: ${message}`);
      }
      const recipients = bcc.split(",").map((address) => address.trim()).filter(Boolean);
      if (recipients.length > 40) throw new Error("Gmail BCC batch exceeded the privacy limit");
      for (const recipient of recipients) gmailRecipients.add(recipient);
    }
    if (gmailRecipients.size !== gmailTotal) {
      throw new Error(`Gmail sent ${gmailRecipients.size} unique recipients instead of ${gmailTotal}`);
    }
    const failedGmailRecipients = new Set(
      (decodeBase64Url(gmailSendCalls[1].body?.raw as string).match(/^Bcc: (.+)$/m)?.[1] ?? "")
        .split(",")
        .map((address) => address.trim())
        .filter(Boolean),
    );
    if (
      failedGmailRecipients.size !== gmailResult.failed
      || new Set(gmailResult.failedRecipients ?? []).size !== failedGmailRecipients.size
      || (gmailResult.failedRecipients ?? []).some((email) => !failedGmailRecipients.has(email))
    ) {
      throw new Error(`Gmail did not report exactly the failed batch: ${JSON.stringify(gmailResult)}`);
    }

    gmailResults = [true];
    proxyCalls.length = 0;
    const gmailRetryResponse = await fetch(`${base}/api/admin/email-blast`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        provider: "gmail",
        subject: "Gmail integration test",
        body: "This is a test message.",
        recipients: gmailResult.failedRecipients,
      }),
    });
    const gmailRetryResult = await gmailRetryResponse.json() as {
      ok?: boolean;
      sent?: number;
      failed?: number;
      failedRecipients?: string[];
      total?: number;
    };
    const gmailRetryCalls = proxyCalls.filter(
      (call) => call.connectorName === "google-mail" && call.path === "/gmail/v1/users/me/messages/send",
    );
    const retryRaw = gmailRetryCalls[0]?.body?.raw;
    const gmailRetryRecipients = new Set(
      typeof retryRaw === "string"
        ? (decodeBase64Url(retryRaw).match(/^Bcc: (.+)$/m)?.[1] ?? "")
          .split(",")
          .map((address) => address.trim())
          .filter(Boolean)
        : [],
    );
    if (
      gmailRetryResponse.status !== 200
      || gmailRetryResult.ok !== true
      || gmailRetryResult.sent !== failedGmailRecipients.size
      || gmailRetryResult.failed !== 0
      || gmailRetryResult.total !== failedGmailRecipients.size
      || (gmailRetryResult.failedRecipients ?? []).length !== 0
      || gmailRetryCalls.length !== 1
      || gmailRetryRecipients.size !== failedGmailRecipients.size
      || [...gmailRetryRecipients].some((email) => !failedGmailRecipients.has(email))
    ) {
      throw new Error(`Gmail retry included successful recipients: ${JSON.stringify({
        result: gmailRetryResult,
        recipients: [...gmailRetryRecipients],
      })}`);
    }

    console.log("email blast integration keeps confirmation, privacy, and partial-failure boundaries");
  } finally {
    ReplitConnectors.prototype.proxy = originalProxy;
    await new Promise<void>((resolve) => appServer.close(() => resolve()));
    await db.delete(emailCaptureTable).where(inArray(emailCaptureTable.email, capturedEmails)).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});