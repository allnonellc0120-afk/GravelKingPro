/**
 * POST /api/webhooks/replicate — Replicate prediction-completion receiver for
 * the webhook-chained generation pipeline.
 *
 * Every transition acknowledges within milliseconds; heavy work (next
 * dispatch, download + mix + Python MLK master) continues in the background:
 *
 *   stage=demucs  succeeded → store stem URLs, dispatch RVC (webhook)
 *   stage=rvc     succeeded → mix + Python MLK V3.5 master → vault → completed
 *   any           failed/canceled → mark job failed, refund credits
 *
 * The per-job HMAC token in the query string prevents forged stage advances.
 */
import { Router, type Request, type Response } from "express";
import {
  failPipelineJob,
  handleDemucsWebhook,
  handleRvcWebhook,
  pipelineWebhookToken,
  type PipelineStage,
} from "../services/generationPipeline";

const replicateWebhookRouter = Router();

interface ReplicateWebhookPayload {
  id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
}

replicateWebhookRouter.post(
  "/webhooks/replicate",
  async (req: Request, res: Response) => {
    const jobId = String(req.query["job"] ?? "");
    const stage = String(req.query["stage"] ?? "") as PipelineStage;
    const token = String(req.query["token"] ?? "");

    if (!jobId || (stage !== "demucs" && stage !== "rvc") || !token) {
      res.status(400).json({ error: "Malformed pipeline webhook." });
      return;
    }
    if (token !== pipelineWebhookToken(jobId, stage)) {
      res.status(403).json({ error: "Invalid pipeline webhook token." });
      return;
    }

    const payload = req.body as ReplicateWebhookPayload;
    const status = payload.status ?? "unknown";

    // Acknowledge immediately — Replicate must never wait on our pipeline.
    res.status(200).json({ received: true });

    void (async () => {
      try {
        if (status === "failed" || status === "canceled") {
          const detail =
            typeof payload.error === "string"
              ? payload.error
              : JSON.stringify(payload.error ?? "unknown error");
          await failPipelineJob(jobId, `Replicate ${stage} ${status}: ${detail}`);
          return;
        }
        if (status !== "succeeded") return; // webhook_events_filter=completed only, but be safe

        if (stage === "demucs") {
          await handleDemucsWebhook(jobId, payload.output);
        } else {
          await handleRvcWebhook(jobId, payload.output);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        req.log.error({ err, jobId, stage }, "[pipeline] webhook stage failed");
        await failPipelineJob(jobId, message).catch(() => {});
      }
    })();
  },
);

export default replicateWebhookRouter;
