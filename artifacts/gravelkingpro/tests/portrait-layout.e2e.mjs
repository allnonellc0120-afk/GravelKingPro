import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.PHASE3_BROWSER_BASE_URL ?? "http://127.0.0.1:19390";
const browserExecutable = process.env.PHASE3_BROWSER_EXECUTABLE ?? "/repl/tools/bin/chromium";
const viewports = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: browserExecutable,
  args: ["--no-sandbox", "--disable-gpu"],
});

const results = [];
let sharedRouteResult;
try {
  const sharedContext = await browser.newContext({
    viewport: viewports[1],
    serviceWorkers: "block",
  });
  const sharedPage = await sharedContext.newPage();
  try {
    const response = await sharedPage.goto(
      `${baseUrl}/stage/duet/GK-STAGE-TEST123?portrait_layout_test=1`,
      { waitUntil: "domcontentloaded" },
    );
    await sharedPage.locator('[data-testid="live-performance-stage"]').waitFor();
    const sharedEvidence = await sharedPage.evaluate(() => ({
      notFound: document.body.innerText.includes("404 Page Not Found"),
      stage: document.querySelectorAll('[data-testid="live-performance-stage"]').length,
      path: window.location.pathname,
    }));
    assert.equal(response?.status(), 200, "shared duet URL did not return HTTP 200");
    assert.equal(sharedEvidence.notFound, false, "shared duet URL rendered the 404 page");
    assert.equal(sharedEvidence.stage, 1, "shared duet URL did not render Main Stage");
    sharedRouteResult = {
      path: sharedEvidence.path,
      http_status: response?.status() ?? null,
      not_found_page: false,
      stage_instances: sharedEvidence.stage,
      status: "PASS",
    };
  } finally {
    await sharedContext.close();
  }

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/main-stage?portrait_layout_test=1`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator('[data-testid="live-performance-stage"]').waitFor();

      const evidence = await page.evaluate(() => {
        const rect = (element) => {
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            right: box.right,
            bottom: box.bottom,
          };
        };
        const visible = (element) => {
          if (!element) return false;
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const overlap = (a, b) =>
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const toEdges = (box) => ({
          left: box.x,
          top: box.y,
          right: box.right,
          bottom: box.bottom,
        });

        const dock = document.querySelector("footer.stage-control-rail");
        const dockInner = dock?.querySelector(".stage-control-inner");
        const timeline = dock?.querySelector(".stage-control-timeline");
        const volume = [...document.querySelectorAll('input[aria-label="Backing track master volume"]')].find(visible);
        const playback = [...document.querySelectorAll('button[aria-label="Play playback"], button[aria-label="Pause playback"]')].find(visible);
        const record = [...document.querySelectorAll('button[aria-label="Start recording"], button[aria-label="Stop recording"]')].find(visible);
        const timeDisplay = timeline?.querySelector(".font-mono");
        const named = {
          volumeSlider: rect(volume),
          playPause: rect(playback),
          timeDisplay: rect(timeDisplay),
          recordButton: rect(record),
        };
        const namedEdges = Object.fromEntries(
          Object.entries(named).map(([name, box]) => [name, box ? toEdges(box) : null]),
        );
        const namedOverlapPairs = [];
        const namedEntries = Object.entries(namedEdges);
        for (let i = 0; i < namedEntries.length; i += 1) {
          for (let j = i + 1; j < namedEntries.length; j += 1) {
            const [leftName, left] = namedEntries[i];
            const [rightName, right] = namedEntries[j];
            if (left && right && overlap(left, right)) namedOverlapPairs.push(`${leftName}/${rightName}`);
          }
        }

        const interactive = [...document.querySelectorAll(
          'a[href], button, input, select, textarea, [role="button"], [role="slider"]',
        )].filter(visible);
        const undersizedTargets = interactive
          .map((element) => {
            const box = rect(element);
            return {
              label: element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim().slice(0, 40) || element.tagName,
              tag: element.tagName,
              width: box.width,
              height: box.height,
              box,
            };
          })
          .filter(({ width, height }) => width < 44 || height < 44);

        const dockBox = rect(dock);
        const innerBox = rect(dockInner);
        const safePaddingBottom = Number.parseFloat(getComputedStyle(dock).paddingBottom) || 0;
        const viewportBottom = window.visualViewport?.height ?? window.innerHeight;
        const purgeCount = document.querySelectorAll(
          '[src*="launchstag"], [id*="launchstag"], [class*="launchstag"]',
        ).length;

        return {
          viewport: { width: innerWidth, height: innerHeight },
          purgeCount,
          dock: dockBox,
          dockInner: innerBox,
          safePaddingBottom,
          viewportBottom,
          named,
          namedOverlapPairs,
          interactiveCount: interactive.length,
          undersizedTargets,
        };
      });

      assert.equal(
        evidence.purgeCount,
        0,
        `${viewport.width}x${viewport.height}: launchstag selector matched ${evidence.purgeCount} element(s)`,
      );
      for (const [name, box] of Object.entries(evidence.named)) {
        assert.ok(box, `${viewport.width}x${viewport.height}: missing visible ${name}`);
      }
      assert.deepEqual(
        evidence.namedOverlapPairs,
        [],
        `${viewport.width}x${viewport.height}: transport controls overlap`,
      );
      assert.deepEqual(
        evidence.undersizedTargets,
        [],
        `${viewport.width}x${viewport.height}: undersized interactive targets`,
      );
      assert.ok(evidence.dock, `${viewport.width}x${viewport.height}: transport dock is missing`);
      assert.ok(
        evidence.dock.bottom <= evidence.viewportBottom + 0.5 &&
          evidence.dock.x >= -0.5 &&
          evidence.dock.right <= evidence.viewport.width + 0.5,
        `${viewport.width}x${viewport.height}: transport dock is clipped by the viewport`,
      );
      assert.ok(
        evidence.dockInner.bottom <= evidence.viewportBottom - evidence.safePaddingBottom + 0.5,
        `${viewport.width}x${viewport.height}: dock content is clipped into the safe-area bottom`,
      );

      results.push({
        viewport: `${viewport.width}x${viewport.height}`,
        purge: "PASS",
        controls: "PASS",
        targets: evidence.interactiveCount,
        dock: "PASS",
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`BROWSER_BASE_URL=${baseUrl}`);
console.log(`BROWSER_EXECUTABLE=${browserExecutable}`);
console.log(
  `[PASS] shared_duet_route path=${sharedRouteResult.path} http_status=${sharedRouteResult.http_status} not_found_page=${sharedRouteResult.not_found_page} stage_instances=${sharedRouteResult.stage_instances}`,
);
for (const result of results) {
  console.log(
    `[PASS] ${result.viewport} purge=PASS controls=PASS touch_targets=${result.targets} dock=PASS`,
  );
}
console.log(`[RECEIPT] portrait_layout=${results.length}/${viewports.length} PASS`);