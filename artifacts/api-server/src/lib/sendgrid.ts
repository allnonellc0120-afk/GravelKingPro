import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export type SendGridSendResult = {
  accepted: boolean;
  status: number;
  messageId?: string;
  detail?: string;
};

export function isSendGridMockMode(): boolean {
  return process.env.SENDGRID_MODE?.trim().toLowerCase() === "mock";
}

export async function sendSendGridDetailed(opts: {
  to: string[];
  subject: string;
  text: string;
  from: string;
}): Promise<SendGridSendResult> {
  if (isSendGridMockMode()) {
    return {
      accepted: false,
      status: 0,
      detail: "SendGrid delivery is disabled in mock mode; no provider request was made.",
    };
  }
  try {
    const response = await connectors.proxy("sendgrid", "/v3/mail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // One personalization per recipient keeps the captured-address list
        // private; a single personalization containing many `to` entries can
        // expose the entire list in message headers.
        personalizations: opts.to.map((email) => ({ to: [{ email }] })),
        from: { email: opts.from },
        subject: opts.subject,
        content: [{ type: "text/plain", value: opts.text }],
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`SendGrid send failed (${response.status}): ${body.slice(0, 500)}`);
      return { accepted: false, status: response.status, detail: body.slice(0, 500) };
    }
    return {
      accepted: response.status === 202,
      status: response.status,
      messageId: response.headers.get("x-message-id") ?? undefined,
    };
  } catch (err) {
    console.error("SendGrid send failed:", err instanceof Error ? err.message : err);
    return { accepted: false, status: 0, detail: err instanceof Error ? err.message : "SendGrid unavailable" };
  }
}

export async function sendSendGrid(opts: {
  to: string[];
  subject: string;
  text: string;
  from: string;
}): Promise<boolean> {
  return (await sendSendGridDetailed(opts)).accepted;
}

export async function lookupSendGridBounce(email: string): Promise<{
  bounced: boolean;
  status: number;
  detail?: string;
}> {
  if (isSendGridMockMode()) {
    return {
      bounced: false,
      status: 0,
      detail: "SendGrid delivery is disabled in mock mode; no provider request was made.",
    };
  }
  try {
    const response = await connectors.proxy(
      "sendgrid",
      `/v3/suppression/bounces/${encodeURIComponent(email)}`,
      { method: "GET" },
    );
    if (response.status === 404) return { bounced: false, status: response.status };
    const body = await response.text().catch(() => "");
    if (!response.ok) {
      return { bounced: false, status: response.status, detail: body.slice(0, 500) };
    }
    try {
      const parsed: unknown = JSON.parse(body);
      return {
        bounced: Array.isArray(parsed) ? parsed.length > 0 : Boolean(parsed && typeof parsed === "object"),
        status: response.status,
      };
    } catch {
      return { bounced: false, status: response.status, detail: body.slice(0, 500) };
    }
  } catch (err) {
    return { bounced: false, status: 0, detail: err instanceof Error ? err.message : "Bounce lookup unavailable" };
  }
}

export async function checkSendGrid(): Promise<{ ok: boolean; detail?: string }> {
  if (isSendGridMockMode()) {
    return { ok: false, detail: "Disabled (mock mode)" };
  }
  try {
    const response = await connectors.proxy("sendgrid", "/v3/templates?generations=legacy,dynamic", { method: "GET" });
    if (response.ok) return { ok: true };
    return { ok: false, detail: `SendGrid returned ${response.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "SendGrid unavailable" };
  }
}