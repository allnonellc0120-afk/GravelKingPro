/**
 * Sends Touch 2 to SBG Partners: new proof point (live certified-track count).
 * Run with: pnpm --filter @workspace/scripts tsx src/send-sbg-touch2.ts
 */
import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function main() {
  const to = "contact@sbg.vc";
  const subject = "Re: Live music-IP certification platform - seed";

  // Proof point: live certified tracks on gravelkingpro.com
  const proofUrl = "https://gravelkingpro.com";
  const body = [
    "Hi again —",
    "",
    "Quick follow-up to my note earlier this week.",
    "",
    "Since sending, we've continued accumulating certified tracks on the platform. " +
    "Each one earns a timestamped IP certificate with an AI-attribution score and " +
    "a copyright-clearance badge — verifiable live at " + proofUrl + ".",
    "",
    "The market signal we're tracking: Warner's Sureel acquisition closed a thesis " +
    "around music-IP attribution that we've been building in production. GravelKing Pro " +
    "is the attribution infrastructure layer — bootstrapped, billing wired, live on " +
    "web and Google Play.",
    "",
    "Happy to walk you through a live demo this week or next — 15 minutes is all it takes.",
    "",
    "Best,",
    "GravelKing Pro",
    proofUrl,
  ].join("\r\n");

  const rawEmail = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");

  const raw = base64url(Buffer.from(rawEmail, "utf8"));

  const response = await connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error(`Gmail send API failed (${response.status}):`, responseText.slice(0, 600));
    process.exit(1);
  }

  const data = JSON.parse(responseText) as { id: string; threadId: string; labelIds?: string[] };
  console.log("✅ Touch 2 sent to SBG Partners!");
  console.log(`   Message ID: ${data.id}`);
  console.log(`   Thread ID:  ${data.threadId}`);
  console.log(`   To:         ${to}`);
  console.log(`   Subject:    ${subject}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
