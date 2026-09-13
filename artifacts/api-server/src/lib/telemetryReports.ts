import cron from "node-cron";
import nodemailer, { type Transporter } from "nodemailer";
import {
  loadTelemetryClientConfigs,
  type TelemetryClientConfig,
  type TelemetryReportSchedule,
} from "./liveTelemetryConfig";
import {
  readTokenTelemetryLedger,
  type TokenTelemetryRecord,
} from "../middleware/tokenTracker";
import { logger } from "./logger";

type TelemetryReport = {
  clientId: string;
  schedule: TelemetryReportSchedule;
  periodStart: string;
  periodEnd: string;
  records: TokenTelemetryRecord[];
  totalTokensSuppressed: number;
  totalDollarsSaved: number;
  totalGkaGainShareDue: number;
  html: string;
  text: string;
  jsonl: string;
};

const scheduleExpressions: Record<TelemetryReportSchedule, string> = {
  daily: "0 8 * * *",
  weekly: "0 8 * * 1",
  monthly: "0 8 1 * *",
};

function roundMoney(value: number): number {
  return Number(value.toFixed(6));
}

function periodStart(schedule: TelemetryReportSchedule, now: Date): Date {
  const start = new Date(now);
  if (schedule === "daily") {
    start.setUTCDate(start.getUTCDate() - 1);
  } else if (schedule === "weekly") {
    start.setUTCDate(start.getUTCDate() - 7);
  } else {
    start.setUTCMonth(start.getUTCMonth() - 1);
  }
  return start;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildTelemetryReport(
  clientId: string,
  schedule: TelemetryReportSchedule,
  records: TokenTelemetryRecord[],
  now = new Date(),
): TelemetryReport {
  const start = periodStart(schedule, now);
  const verified = records.filter((record) => {
    if (record.client_id !== clientId || record.status !== "completed") return false;
    const createdAt = new Date(record.created_at);
    return Number.isFinite(createdAt.getTime()) && createdAt >= start && createdAt <= now;
  });
  const totals = verified.reduce(
    (result, record) => {
      result.totalTokensSuppressed += record.tokens_suppressed;
      result.totalDollarsSaved += record.dollar_savings;
      result.totalGkaGainShareDue += record.gka_gain_share_due;
      return result;
    },
    { totalTokensSuppressed: 0, totalDollarsSaved: 0, totalGkaGainShareDue: 0 },
  );
  const dollarsSaved = roundMoney(totals.totalDollarsSaved);
  const gainShare = roundMoney(totals.totalGkaGainShareDue);
  const safeClientId = escapeHtml(clientId);
  const range = `${start.toISOString()} — ${now.toISOString()}`;
  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f7f9;font-family:Arial,sans-serif;color:#17212b">
<div style="max-width:680px;margin:0 auto;padding:32px">
  <h1 style="margin:0 0 8px">GravelKing telemetry report</h1>
  <p style="margin:0 0 24px;color:#52606d">${safeClientId} · ${schedule} · ${range}</p>
  <div style="background:#fff;border:1px solid #d8e0e6;border-radius:10px;padding:24px">
    <p style="margin:0 0 10px"><strong>Total Dollars Saved:</strong> $${dollarsSaved.toFixed(6)}</p>
    <p style="margin:0 0 10px"><strong>Tokens Suppressed:</strong> ${totals.totalTokensSuppressed.toLocaleString("en-US")}</p>
    <p style="margin:0"><strong>Verified Records:</strong> ${verified.length}</p>
  </div>
  <p style="color:#52606d">The attached JSONL file contains only telemetry mapped to this client.</p>
</div></body></html>`;
  const text = [
    "GravelKing telemetry report",
    `Client: ${clientId}`,
    `Period: ${range}`,
    `Total Dollars Saved: $${dollarsSaved.toFixed(6)}`,
    `Tokens Suppressed: ${totals.totalTokensSuppressed}`,
    `Verified Records: ${verified.length}`,
  ].join("\n");

  return {
    clientId,
    schedule,
    periodStart: start.toISOString(),
    periodEnd: now.toISOString(),
    records: verified,
    totalTokensSuppressed: totals.totalTokensSuppressed,
    totalDollarsSaved: dollarsSaved,
    totalGkaGainShareDue: gainShare,
    html,
    text,
    jsonl: verified.map((record) => JSON.stringify(record)).join("\n") + (verified.length ? "\n" : ""),
  };
}

function smtpTransport(): { transport: Transporter; from: string } | null {
  const host = process.env.GKA_SMTP_HOST?.trim();
  const user = process.env.GKA_SMTP_USER?.trim();
  const password = process.env.GKA_SMTP_PASSWORD;
  const from = process.env.GKA_SMTP_FROM?.trim();
  const port = Number(process.env.GKA_SMTP_PORT ?? 587);
  if (!host || !user || !password || !from || !Number.isInteger(port) || port <= 0) {
    return null;
  }
  return {
    transport: nodemailer.createTransport({
      host,
      port,
      secure: process.env.GKA_SMTP_SECURE === "true" || port === 465,
      auth: { user, pass: password },
    }),
    from,
  };
}

export async function sendTelemetryReport(
  client: TelemetryClientConfig,
  mailer = smtpTransport(),
  now = new Date(),
): Promise<boolean> {
  if (!client.email || !client.schedule || !mailer) return false;
  const records = await readTokenTelemetryLedger(client.clientId);
  const report = buildTelemetryReport(client.clientId, client.schedule, records, now);
  const date = now.toISOString().slice(0, 10);
  await mailer.transport.sendMail({
    from: mailer.from,
    to: client.email,
    subject: `GravelKing ${client.schedule} telemetry report — ${date}`,
    text: report.text,
    html: report.html,
    attachments: [{
      filename: `gka-telemetry-${client.clientId}-${date}.jsonl`,
      content: Buffer.from(report.jsonl, "utf8"),
      contentType: "application/x-ndjson",
    }],
  });
  return true;
}

export function scheduleTelemetryReports(): void {
  const mailer = smtpTransport();
  const configuredReportClients = loadTelemetryClientConfigs().filter(
    (client) => client.email && client.schedule,
  );
  const uniqueReportClients = new Map<string, TelemetryClientConfig>();
  for (const client of configuredReportClients) {
    uniqueReportClients.set(
      `${client.clientId}:${client.email}:${client.schedule}`,
      client,
    );
  }
  const reportClients = [...uniqueReportClients.values()];
  if (!mailer || reportClients.length === 0) {
    logger.info("GKA telemetry email scheduler disabled: SMTP or report clients not configured");
    return;
  }

  const activeClients = new Set<string>();
  for (const client of reportClients) {
    cron.schedule(
      scheduleExpressions[client.schedule!],
      async () => {
        const lockKey = `${client.clientId}:${client.schedule}`;
        if (activeClients.has(lockKey)) return;
        activeClients.add(lockKey);
        try {
          await sendTelemetryReport(client, mailer);
          logger.info(
            { clientId: client.clientId, schedule: client.schedule },
            "GKA telemetry email report sent",
          );
        } catch (error) {
          logger.error(
            { error, clientId: client.clientId, schedule: client.schedule },
            "GKA telemetry email report failed",
          );
        } finally {
          activeClients.delete(lockKey);
        }
      },
      { timezone: client.timezone },
    );
  }
  logger.info({ clientCount: reportClients.length }, "GKA telemetry email scheduler registered");
}