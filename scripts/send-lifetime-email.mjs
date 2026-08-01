/**
 * Send the lifetime Node Auditor subscription email via the Replit Gmail
 * connector. Run from the workspace root:
 *   node scripts/send-lifetime-email.mjs
 */
import { ReplitConnectors } from "@replit/connectors-sdk";

const TO = "martypodany63@gmail.com";
const SUBJECT = "You've got lifetime access to GravelKing Pro — Node Auditor";
const BODY = `Hey Marty,

Good news — you've been granted a lifetime Node Auditor subscription to GravelKing Pro, on the house. No trial clock, no billing, no expiration. It's yours until you hear otherwise directly from the owner.

Node Auditor is the top tier — everything unlocked:
- Unlimited AI mastering with the MLK V3.5 kernel (full-length masters, all presets)
- The full Studio: multitrack DAW, mixing, and effects in your browser
- Vocal Booth recording with live monitor effects and karaoke mode
- IP certification on every release — cryptographic proof of ownership embedded in your masters
- Every future Pro feature as it ships

How to activate (takes 10 seconds):
1. Go to https://gravelkingpro.it.com
2. Click Sign In and choose Continue with Google
3. Use THIS email address (martypodany63@gmail.com) — your lifetime access applies automatically the moment you sign in. No code needed.

If anything doesn't show up unlocked after you sign in, just reply to this email and it'll get sorted same-day.

Welcome aboard,
GravelKing Pro — All N One LLC
https://gravelkingpro.it.com
`;

const raw = [
  `To: ${TO}`,
  `Subject: ${SUBJECT}`,
  `Content-Type: text/plain; charset="UTF-8"`,
  ``,
  BODY,
].join("\r\n");

const rawB64 = Buffer.from(raw, "utf8")
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");

const connectors = new ReplitConnectors();
const res = await connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ raw: rawB64 }),
});
const text = typeof res.text === "function" ? await res.text() : String(res);
const status = res.status ?? res.statusCode ?? 0;
console.log("status:", status, text.slice(0, 300));
process.exit(status >= 200 && status < 300 ? 0 : 1);
