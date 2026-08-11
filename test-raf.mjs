import { chromium } from 'playwright';
async function run() {
  const browser = await chromium.launch({ 
    executablePath: '/nix/store/hvv3n9pvjfq0x8wjw8f3igsyvlaz1ngr-playwright-browsers-chromium/chromium-1091/chrome-linux/chrome',
    headless: true 
  });
  const page = await browser.newPage();
  
  const client = await page.context().newCDPSession(page);
  await client.send('Animation.enable');
  await client.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
  
  await page.setContent(`
    <script>
      let start = performance.now();
      let frames = 0;
      function tick(t) {
        frames++;
        if (frames === 60) {
          console.log("60 frames took", (performance.now() - start), "ms real time");
          console.log("rAF timestamp delta:", t - start);
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    </script>
  `);
  
  page.on('console', msg => console.log(msg.text()));
  await page.waitForTimeout(2000);
  await browser.close();
}
run();
