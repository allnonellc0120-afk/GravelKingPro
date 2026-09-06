import { execFileSync, spawn } from "node:child_process";
import { chromium } from "playwright";

const port = Number(process.env.MASTERING_EQ_TEST_PORT ?? 4318);
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
      const response = await fetch(`${baseUrl}/tests/mastering-eq-harness.html`);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`mastering EQ browser test server did not start:\n${serverOutput}`);
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
    await page.goto(`${baseUrl}/tests/mastering-eq-harness.html`);
    const result = await page.evaluate(() => window.__masteringEqRegression);
    assert(result?.ok, `mastering EQ regression failed: ${JSON.stringify(result)}`);
    assert(result.header.channels === 2, "rendered WAV channel count changed");
    assert(result.header.duration === 2, "rendered WAV duration changed");
    assert(result.responseErrors.every((error) => error < 0.025), "rendered EQ response changed");
    assert(
      JSON.stringify(result.progressStages) === JSON.stringify([
        "loading",
        "decoding",
        "rendering",
        "encoding",
      ]),
      `render progress stages changed: ${JSON.stringify(result.progressStages)}`,
    );
    assert(result.allocationError?.isResourceError === true, "allocation failure lost its resource classification");
    assert(result.allocationError?.code === "INSUFFICIENT_RESOURCES", "allocation failure code changed");
    assert(result.networkError?.isResourceError === false, "network failure was classified as a resource failure");
    console.log(`mastering EQ export regression passed (${result.header.size} bytes, 10 frequency checks, ${result.progressStages.join(" → ")})`);
  } finally {
    await browser.close();
  }
}

try {
  await run();
} finally {
  server.kill("SIGTERM");
}