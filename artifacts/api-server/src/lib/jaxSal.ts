const DROP_LEADING = /^(?:(?:sure|okay|ok|certainly|absolutely|of course|great|hello|hi|thanks|thank you|understood|as an ai|jax)\b|here(?:'s| is)(?:\s+(?:the\s+)?(?:answer|response|fix))?)\s*[\s,:;—-]*/i;
const DROP_LABEL = /^(?:answer|response|summary|recommendation|action|directive|jax)\s*:\s*/i;
const DROP_TRAILER = /\s+(?:sources?|references?|metadata|confidence|risk|verification|files?)\s*:[\s\S]*$/i;

/**
 * Deterministic short-form speech text. This is intentionally rule-based:
 * audio preprocessing must not add another model call or invent a conclusion.
 */
export function compressJaxSal(input: string, maxLength = 120): string {
  const limit = Math.max(1, Math.floor(maxLength) - 1);
  const normalized = input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(DROP_LEADING, "")
    .replace(DROP_LEADING, "")
    .replace(DROP_LABEL, "")
    .replace(DROP_TRAILER, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "JAX standing by.";

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const actionable = sentences.filter(sentence =>
    !/^(?:i can|i will|let me|please note|for context|in summary|that said)\b/i.test(sentence),
  );
  const candidate = (actionable[0] ?? sentences[0] ?? normalized)
    .replace(/^[-*•]\s*/, "")
    .trim();
  if (candidate.length <= limit) return candidate;

  const words = candidate.split(/\s+/);
  let compact = "";
  for (const word of words) {
    const next = compact ? `${compact} ${word}` : word;
    if (next.length > limit) break;
    compact = next;
  }
  const trimmed = compact.replace(/[,:;—-]+$/, "");
  return trimmed.length < limit ? `${trimmed}.` : trimmed.slice(0, limit).trimEnd();
}