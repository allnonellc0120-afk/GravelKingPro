import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const port = Number(process.env.CREDIT_WALLET_TEST_PORT ?? 4317);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  "pnpm",
  ["--filter", "@workspace/gravelkingpro", "run", "dev"],
  {
    cwd: process.cwd(),
    env: { ...process.env, BASE_PATH: "/", PORT: String(port), NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/tests/credit-wallet-harness.html`);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`wallet browser test server did not start:\n${serverOutput}`);
}

async function run() {
  await waitForServer();
  let executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  if (!executablePath) {
    try {
      executablePath = execFileSync("sh", ["-c", "command -v chromium"], { encoding: "utf8" }).trim();
    } catch {
      executablePath = undefined;
    }
  }
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const page = await browser.newPage();
  let grantArrived = false;
  let purchaseStatusChecks = 0;
  let transientStatusFailures = 0;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (url.pathname === "/api/credits/balance") {
      return json({ creditsBalance: grantArrived ? 750 : 0, userId: "browser-wallet-test-user" });
    }
    if (url.pathname === "/api/stripe/credit-packs") {
      return json({
        data: [{
          id: "starter",
          name: "Starter",
          credits: 500,
          bonusCredits: 250,
          totalCredits: 750,
          amountCents: 1000,
          description: "500 credits + 250 bonus credits",
        }],
      });
    }
    if (url.pathname === "/api/credits/history") {
      return json({
        data: grantArrived
          ? [{ id: "tx-browser-wallet", delta: 750, kind: "stripe_purchase", createdAt: new Date().toISOString() }]
          : [],
        page: 1,
        hasMore: false,
        pendingPurchase: null,
      });
    }
    if (url.pathname === "/api/stripe/create-credit-purchase-intent") {
      return json({
        clientSecret: "pi_browser_wallet_test_secret",
        paymentIntentId: "pi_browser_wallet_test",
      });
    }
    if (url.pathname === "/api/credits/purchase-status") {
      purchaseStatusChecks += 1;
      if (transientStatusFailures === 0) {
        transientStatusFailures += 1;
        return json({ error: "temporary settlement lookup failure" }, 503);
      }
      if (transientStatusFailures === 1) {
        transientStatusFailures += 1;
        return route.abort("failed");
      }
      return json({ settled: grantArrived });
    }
    return json({ error: `Unexpected wallet test request: ${url.pathname}` }, 404);
  });

  await page.goto(`${baseUrl}/tests/credit-wallet-harness.html`);
  const buyButton = page.getByTestId("credit-buy-starter");
  const pending = page.getByTestId("credit-pending");
  await buyButton.waitFor();
  await buyButton.click();
  await page.getByTestId("test-payment-element").getByRole("button").click();

  await pending.waitFor();
  assert(await pending.getByText("Payment of $10.00 is still settling").isVisible(), "pending settlement message was not shown");
  const failureDeadline = Date.now() + 3_000;
  while (transientStatusFailures < 2 && Date.now() < failureDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(transientStatusFailures === 2, "the wallet did not survive both temporary settlement-check failures");
  assert(await pending.isVisible(), "temporary settlement-check failures removed the pending message");
  assert(await buyButton.isDisabled(), "second purchase was not disabled while the webhook was delayed");
  assert(purchaseStatusChecks >= 2, "the wallet did not retry settlement status after temporary failures");

  // Model the delayed payment_intent.succeeded delivery arriving after the
  // browser has already shown the pending state.
  grantArrived = true;
  await pending.waitFor({ state: "hidden", timeout: 4_000 });
  const balance = page.getByTestId("credit-balance");
  assert(await balance.isVisible() && (await balance.textContent()).includes("750"), "balance did not update after the grant arrived");
  assert(!(await buyButton.isDisabled()), "purchase stayed disabled after settlement completed");
  console.log("credit wallet browser settlement flow passed");

  await browser.close();
}

try {
  await run();
} finally {
  server.kill("SIGTERM");
}