---
name: RVC base-generation fallback
description: Reliability rule for generated songs when Replicate voice conversion is unavailable.
---

RVC voice conversion is an enhancement, not a prerequisite for a valid generated song. Retry transient prediction-creation failures, but continue with the original generated vocal when dispatch, execution, or webhook delivery reports an RVC failure.

**Why:** Replicate model startup, throttling, signed-input, and runtime errors are outside the generation request's control; surfacing them as unhandled failures loses an otherwise valid base generation.

**How to apply:** Apply the fallback in both the synchronous orchestrator and durable webhook pipeline. Only fail/refund when the base mix or later storage/mastering work also fails.