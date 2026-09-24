import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeTemplate, parseRecipients, redactDiagnostics, validatedAgentUrl } from "../lib/adminIntelligenceSafety";

test("CSV parsing handles quoted names, duplicate addresses and limits", () => {
  const rows = parseRecipients('email,name,phone,link,artist_id\nartist@example.com,"A, B",555,https://example.com/a,42');
  assert.equal(rows[0]?.name, "A, B");
  assert.equal(mergeTemplate("Hello {name} ({artist_id}) {link}", rows[0]!), "Hello A, B (42) https://example.com/a");
  assert.throws(() => parseRecipients("x@example.com\nx@example.com"), /Duplicate/);
  assert.throws(() => parseRecipients(Array(102).fill("a@example.com").join("\n")), /Maximum 100/);
  assert.throws(() => mergeTemplate("{secret}", rows[0]!), /Unsupported/);
});

test("agent target rejects private/credentialed or non-HTTPS URLs", () => {
  assert.equal(validatedAgentUrl("https://agent.example.com/hook").hostname, "agent.example.com");
  for (const value of ["http://example.com", "https://127.0.0.1/", "https://localhost/", "https://user:pass@example.com/", "https://example.com:8443/"]) {
    assert.throws(() => validatedAgentUrl(value));
  }
});

test("diagnostics redact credentials, emails and URLs", () => {
  assert.equal(redactDiagnostics("token=abc123 owner@example.com https://example.com/private"), "[REDACTED] [EMAIL] [URL]");
});