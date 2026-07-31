/**
 * Send email through the owner's Gmail connector (google-mail).
 *
 * Uses @replit/connectors-sdk's proxy — credentials are managed by Replit,
 * nothing is stored here. All sends are fail-soft: callers get a boolean and
 * should never let a notification failure break the main request.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

function base64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

let cachedAddress: string | null = null;

/**
 * The authenticated Gmail account's own address — used as the To: header on
 * BCC bulk sends (Gmail rejects "undisclosed-recipients" headers via the API).
 */
export async function getGmailAddress(): Promise<string | null> {
  if (cachedAddress) return cachedAddress;
  try {
    const res = await connectors.proxy("google-mail", "/gmail/v1/users/me/profile", { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as { emailAddress?: string };
    cachedAddress = data.emailAddress ?? null;
    return cachedAddress;
  } catch {
    return null;
  }
}

export async function sendGmail(opts: {
  to: string;
  subject: string;
  text: string;
  bcc?: string;
}): Promise<boolean> {
  try {
    // RFC 2822 plain-text message. Gmail fills in the authenticated From.
    const raw = base64Url(
      [
        `To: ${opts.to}`,
        ...(opts.bcc ? [`Bcc: ${opts.bcc}`] : []),
        `Subject: ${opts.subject}`,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "",
        opts.text,
      ].join("\r\n"),
    );
    const response = await connectors.proxy(
      "google-mail",
      "/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`Gmail send failed (${response.status}): ${body.slice(0, 500)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Gmail send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
