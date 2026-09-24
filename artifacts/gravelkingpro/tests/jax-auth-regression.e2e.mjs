import { execFileSync, spawn } from "node:child_process";
import { chromium } from "playwright";

const port = Number(process.env.JAX_AUTH_TEST_PORT ?? 4319);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  "pnpm",
  ["--filter", "@workspace/gravelkingpro", "run", "dev"],
  {
    cwd: process.cwd(),
    env: { ...process.env, BASE_PATH: "/", PORT: String(port), NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  },
);

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stopServer() {
  if (!server.pid) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // The server may already have exited after a failed startup.
  }
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/tests/jax-auth-harness.html`);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`JAX auth browser test server did not start:\n${serverOutput}`);
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
  try {
    const page = await browser.newPage();
    const requests = [];
    const replies = [
      "[Chorus]\nSignal in the static",
      "Signal through the night",
      "Dark outlaw alt-rock, 78 BPM, close vocal",
    ];
    await page.route("**/api/chat/jax", async (route) => {
      const request = route.request();
      requests.push({
        authorization: request.headers().authorization,
        accept: request.headers().accept,
        body: JSON.parse(request.postData() ?? "{}"),
      });
      const text = replies[requests.length - 1];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ text }),
      });
    });

    await page.goto(`${baseUrl}/tests/jax-auth-harness.html`);
    await page.waitForFunction(() => window.__jaxAuthRegression);
    const result = await page.evaluate(() => window.__jaxAuthRegression);
    assert(result.ok, `JAX auth harness failed: ${JSON.stringify(result)}`);
    assert(JSON.stringify(result.statuses) === JSON.stringify([200, 200, 200]), "not every JAX request returned HTTP 200");
    assert(requests.length === 3, `expected three JAX requests, received ${requests.length}`);
    assert(
      requests.every(({ authorization }) => authorization === "Bearer jax-browser-test-session"),
      `a JAX request lost the Clerk bearer token: ${JSON.stringify(requests)}`,
    );
    assert(result.generatorLyrics === replies[1], "generated lyric text did not reach generator state");
    console.log("JAX sign-in regression passed (chat, selected-line regeneration, smart-fill)");
  } finally {
    await browser.close();
  }
}

try {
  await run();
} finally {
  stopServer();
}
