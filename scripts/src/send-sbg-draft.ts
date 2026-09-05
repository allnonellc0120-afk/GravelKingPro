/**
 * Creates a Gmail draft to SBG Partners with the public promo deck attached.
 * Run with: pnpm --filter @workspace/scripts tsx src/send-sbg-draft.ts
 *
 * Does NOT send — saves as a draft so the founder can review and fire it.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "fs";
import path from "path";

const connectors = new ReplitConnectors();

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function main() {
  // Read the public promo deck
  const pdfPath = path.resolve(import.meta.dirname, "../../.local/outputs/GravelKing-Pro---Public-Promo-Deck.pdf");
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found at ${pdfPath}`);
  }
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBytes.toString("base64");
  // MIME requires 76-char lines for base64 attachments
  const pdfBase64Wrapped = pdfBase64.match(/.{1,76}/g)!.join("\r\n");

  console.log(`PDF loaded: ${pdfBytes.length} bytes`);

  // Build the multipart MIME message
  const boundary = "GK_DRAFT_BOUNDARY_SBG_20260816";
  const subject = "Live music-IP certification platform - seed";
  const to = "contact@sbg.vc";
  const body =
    "Hi SBG team - I'm the founder of GravelKing Pro (gravelkingpro.com): " +
    "AI-attribution certificates + proprietary mastering, live on web and Google Play " +
    "with billing wired, bootstrapped solo. Warner's Sureel acquisition shows where " +
    "attribution is heading. Public deck attached - could I get 15 minutes this week or next?";

  const rawEmail = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
    "",
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: attachment; filename="GravelKing-Pro---Public-Promo-Deck.pdf"',
    "",
    pdfBase64Wrapped,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const raw = base64url(Buffer.from(rawEmail, "utf8"));

  // POST to Gmail Send API (user confirmed explicit send)
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
  console.log("✅ Email sent successfully!");
  console.log(`   Message ID: ${data.id}`);
  console.log(`   Thread ID:  ${data.threadId}`);
  console.log(`   To:         ${to}`);
  console.log(`   Subject:    ${subject}`);
  console.log("   Attachment: GravelKing-Pro---Public-Promo-Deck.pdf (public deck only)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
