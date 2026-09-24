/**
 * Integration regressions for the optional RVC stage:
 *
 *   1. RVC dispatch failure continues with the original Demucs vocal and bed.
 *   2. Failed and canceled RVC webhooks continue with that same base mix.
 *   3. If base processing also fails, the job is failed and spent credits are
 *      refunded exactly once.
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";

import {
  db,
  creditTransactionsTable,
  masterJobsTable,
  usersTable,
} from "@workspace/db";
import app from "../app";
import {
  __setGenerationPipelineTestHooksForTest,
  handleDemucsWebhook,
  pipelineWebhookToken,
} from "../services/generationPipeline";
import { CREDIT_COSTS, spendCredits } from "../lib/credits";

const BASE_VOCAL_URL = "https://fixtures.example.test/demucs-vocals.wav";
const BASE_INSTRUMENTAL_URL = "https://fixtures.example.test/demucs-instrumental.wav";

type JobConfig = {
  demucsVocalUrl: string;
  demucsInstrumentalUrl: string;
  creditsSpent?: boolean;
  creditReference?: string;
  [key: string]: unknown;
};

async function insertJob(userId: string, config: JobConfig): Promise<string> {
  const id = `rvc-fallback-${randomUUID()}`;
  await db.insert(masterJobsTable).values({
    id,
    userId,
    type: "generation",
    status: "processing",
    stage: "processing_rvc",
    progress: 60,
    requestConfig: config,
  });
  return id;
}

async function getJob(jobId: string) {
  const [job] = await db
    .select()
    .from(masterJobsTable)
    .where(eq(masterJobsTable.id, jobId))
    .limit(1);
  return job;
}

async function waitForJobStatus(jobId: string, status: string): Promise<Awaited<ReturnType<typeof getJob>>> {
  for (let attempt = 0; attempt < 80; attempt++) {
    const job = await getJob(jobId);
    if (job?.status === status) return job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return getJob(jobId);
}

async function main(): Promise<void> {
  const run = randomUUID();
  const baseUserId = `rvc-base-user-${run}`;
  const refundUserId = `rvc-refund-user-${run}`;
  const createdJobIds: string[] = [];
  const observedBaseMixes: Array<{
    jobId: string;
    vocal: unknown;
    instrumental: string | undefined;
    fallback: unknown;
  }> = [];
  const appServer = http.createServer(app);

  await db.insert(usersTable).values({ id: baseUserId, creditsBalance: 0 });
  await db.insert(usersTable).values({ id: refundUserId, creditsBalance: CREDIT_COSTS.song });

  const restoreHooks = __setGenerationPipelineTestHooksForTest({
    convertToGravelKingVoice: async () => {
      throw new Error("simulated RVC dispatch outage");
    },
    handleRvcWebhook: async (jobId, output) => {
      const job = await getJob(jobId);
      const config = (job?.requestConfig ?? {}) as JobConfig;
      observedBaseMixes.push({
        jobId,
        vocal: output,
        instrumental: config.demucsInstrumentalUrl,
        fallback: config.rvcFallback,
      });
      await db
        .update(masterJobsTable)
        .set({
          status: "completed",
          stage: "done",
          progress: 100,
          outputObjectKey: `test-output-${jobId}`,
          completedAt: new Date(),
        })
        .where(eq(masterJobsTable.id, jobId));
    },
  });

  try {
    // A Demucs success followed by an RVC creation error must use both base
    // Demucs stems, not turn an otherwise valid generation into a failure.
    const dispatchFailureJobId = await insertJob(baseUserId, {
      demucsVocalUrl: "",
      demucsInstrumentalUrl: "",
    });
    createdJobIds.push(dispatchFailureJobId);
    await handleDemucsWebhook(dispatchFailureJobId, {
      vocals: BASE_VOCAL_URL,
      no_vocals: BASE_INSTRUMENTAL_URL,
    });
    const dispatchFailureJob = await getJob(dispatchFailureJobId);
    const dispatchMix = observedBaseMixes.find((mix) => mix.jobId === dispatchFailureJobId);
    if (
      dispatchFailureJob?.status !== "completed" ||
      dispatchMix?.vocal !== BASE_VOCAL_URL ||
      dispatchMix.instrumental !== BASE_INSTRUMENTAL_URL ||
      dispatchMix.fallback !== true
    ) {
      throw new Error(`RVC dispatch fallback did not preserve the base mix: ${JSON.stringify({ dispatchFailureJob, dispatchMix })}`);
    }

    await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;

    // Replicate can deliver either terminal failure status. Both must use the
    // same base-generation continuation path.
    for (const status of ["failed", "canceled"] as const) {
      const jobId = await insertJob(baseUserId, {
        demucsVocalUrl: BASE_VOCAL_URL,
        demucsInstrumentalUrl: BASE_INSTRUMENTAL_URL,
      });
      createdJobIds.push(jobId);
      const response = await fetch(
        `${base}/api/webhooks/replicate?job=${encodeURIComponent(jobId)}&stage=rvc&token=${pipelineWebhookToken(jobId, "rvc")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, error: `simulated ${status}` }),
        },
      );
      if (response.status !== 200) {
        throw new Error(`RVC ${status} webhook was not acknowledged: ${response.status}`);
      }
      const job = await waitForJobStatus(jobId, "completed");
      const mix = observedBaseMixes.find((candidate) => candidate.jobId === jobId);
      if (
        job?.status !== "completed" ||
        mix?.vocal !== BASE_VOCAL_URL ||
        mix.instrumental !== BASE_INSTRUMENTAL_URL ||
        mix.fallback !== true
      ) {
        throw new Error(`RVC ${status} webhook did not continue with the base mix: ${JSON.stringify({ job, mix })}`);
      }
    }

    // A failure in the fallback itself is not suppressible: it must fail the
    // durable job and refund the original song spend.
    const creditReference = `song:${randomUUID()}`;
    const spent = await spendCredits(refundUserId, CREDIT_COSTS.song, "song", creditReference);
    if (!spent.ok || spent.balance !== 0) {
      throw new Error(`failed to set up spent-credit fixture: ${JSON.stringify(spent)}`);
    }
    const fallbackFailureJobId = await insertJob(refundUserId, {
      demucsVocalUrl: BASE_VOCAL_URL,
      demucsInstrumentalUrl: BASE_INSTRUMENTAL_URL,
      creditsSpent: true,
      creditReference,
    });
    createdJobIds.push(fallbackFailureJobId);

    const failingRestore = __setGenerationPipelineTestHooksForTest({
      handleRvcWebhook: async () => {
        throw new Error("simulated base-generation processing failure");
      },
    });
    try {
      const response = await fetch(
        `${base}/api/webhooks/replicate?job=${encodeURIComponent(fallbackFailureJobId)}&stage=rvc&token=${pipelineWebhookToken(fallbackFailureJobId, "rvc")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "failed", error: "simulated RVC outage" }),
        },
      );
      if (response.status !== 200) {
        throw new Error(`fallback-failure webhook was not acknowledged: ${response.status}`);
      }
      const failedJob = await waitForJobStatus(fallbackFailureJobId, "failed");
      const [refundedUser] = await db
        .select({ creditsBalance: usersTable.creditsBalance })
        .from(usersTable)
        .where(eq(usersTable.id, refundUserId));
      const refunds = await db
        .select({
          delta: creditTransactionsTable.delta,
          kind: creditTransactionsTable.kind,
          reference: creditTransactionsTable.reference,
        })
        .from(creditTransactionsTable)
        .where(
          and(
            eq(creditTransactionsTable.userId, refundUserId),
            eq(creditTransactionsTable.reference, `refund:${creditReference}`),
          ),
        );
      if (
        failedJob?.status !== "failed" ||
        failedJob.stage !== "failed" ||
        refundedUser?.creditsBalance !== CREDIT_COSTS.song ||
        refunds.length !== 1 ||
        refunds[0].delta !== CREDIT_COSTS.song ||
        refunds[0].kind !== "failed_song_refund"
      ) {
        throw new Error(`fallback processing failure did not fail/refund correctly: ${JSON.stringify({ failedJob, refundedUser, refunds })}`);
      }
    } finally {
      failingRestore();
    }

    console.log("RVC dispatch/webhook fallback and refund regressions passed");
  } finally {
    restoreHooks();
    await new Promise<void>((resolve) => appServer.close(() => resolve()));
    await db.delete(masterJobsTable).where(
      eq(masterJobsTable.userId, baseUserId),
    ).catch(() => {});
    await db.delete(masterJobsTable).where(
      eq(masterJobsTable.userId, refundUserId),
    ).catch(() => {});
    await db.delete(creditTransactionsTable).where(
      eq(creditTransactionsTable.userId, refundUserId),
    ).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, baseUserId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, refundUserId)).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});