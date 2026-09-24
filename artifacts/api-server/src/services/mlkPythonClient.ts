/**
 * Internal client for the standalone Morris Law Kernel Python service.
 *
 * The Python engine remains the preferred local path. When it is unavailable,
 * the API server may use the owner's live Vertex text model; it never returns
 * a canned response.
 */

import { generateVertexText, isVertexConfigured } from "../geminiVertex";
import { logger } from "../lib/logger";

export interface MlkPythonGeneration {
  generated_lyrics?: string;
  output?: string;
  [key: string]: unknown;
}

const DEFAULT_MLK_GENERATE_URL = "http://127.0.0.1:5000/api/jax/generate";

export async function generateWithMlkPython(prompt: string): Promise<MlkPythonGeneration> {
  const url = process.env.MLK_GENERATE_URL?.trim() || DEFAULT_MLK_GENERATE_URL;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(120_000),
    });
    const bodyText = await response.text();
    let body: MlkPythonGeneration;
    try {
      body = JSON.parse(bodyText) as MlkPythonGeneration;
    } catch {
      throw new Error(`Morris Law Kernel returned non-JSON (${response.status}).`);
    }
    if (!response.ok) {
      const detail = typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
      throw new Error(`Morris Law Kernel generation failed: ${detail}`);
    }
    if (
      typeof body.generated_lyrics !== "string" &&
      typeof body.output !== "string"
    ) {
      throw new Error("Morris Law Kernel returned no generated text.");
    }
    return body;
  } catch (error) {
    if (!isVertexConfigured()) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    logger.warn(
      { detail },
      "Morris Law Kernel text service unavailable; using live Vertex text generation",
    );
    const generated = (await generateVertexText(prompt, {
      maxOutputTokens: 2048,
      temperature: 0.7,
      thinkingConfig: { thinkingBudget: 0 },
    })).trim();
    if (!generated) throw new Error("Vertex AI returned no generated text.");
    return { generated_lyrics: generated, provider: "vertex_fallback" };
  }
}