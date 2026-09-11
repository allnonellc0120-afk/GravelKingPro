import { logger } from "./logger";

const SITE = "https://gravelkingpro.com";
const KEY = "56211938448b292a4e379b33d07da10a";
const PATHS = [
  "/", "/pricing", "/mastering", "/songwriting", "/vocal-booth",
  "/download", "/verify", "/whitepaper", "/privacy", "/data-deletion",
  "/contact", "/label", "/submit", "/optimizer", "/convert",
];

export async function submitIndexNow(): Promise<boolean> {
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: "gravelkingpro.com",
      key: KEY,
      keyLocation: `${SITE}/${KEY}.txt`,
      urlList: PATHS.map((path) => `${SITE}${path}`),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok && response.status !== 202) {
    const body = await response.text().catch(() => "");
    logger.error({ status: response.status, body: body.slice(0, 300) }, "IndexNow submission failed");
    return false;
  }
  logger.info({ urlCount: PATHS.length, status: response.status }, "IndexNow URLs submitted");
  return true;
}

export function scheduleIndexNowSubmission(): void {
  if (process.env.NODE_ENV !== "production") return;
  setTimeout(() => {
    submitIndexNow().catch((err) => logger.error({ err }, "IndexNow startup submission failed"));
  }, 45_000);
  setInterval(() => {
    submitIndexNow().catch((err) => logger.error({ err }, "IndexNow daily submission failed"));
  }, 24 * 60 * 60 * 1000);
  logger.info("Daily IndexNow submission registered");
}