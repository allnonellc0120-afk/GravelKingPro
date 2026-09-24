import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const songwriting = await readFile(
  new URL("../src/pages/songwriting.tsx", import.meta.url),
  "utf8",
);

function functionBody(name, nextName) {
  const start = songwriting.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `${name} was removed from the songwriting studio`);
  const end = nextName ? songwriting.indexOf(nextName, start) : songwriting.length;
  assert.notEqual(end, -1, `${nextName} was removed from the songwriting studio`);
  return songwriting.slice(start, end);
}

test("the three JAX writing paths use the Clerk bearer helper", () => {
  for (const [name, nextName] of [
    ["regenerateSelectedLines", "const deleteSession ="],
    ["generate", "const generateSong ="],
    ["askJax", "const smartFill ="],
  ]) {
    const body = functionBody(name, nextName);
    assert.match(body, /fetch\("\/api\/chat\/jax"/, `${name} lost its JAX request`);
    assert.match(
      body,
      /headers:\s*await getJaxRequestHeaders(?:\("text\/event-stream"\))?/,
      `${name} no longer sends Clerk request headers`,
    );
  }
});

test("the browser harness is wired to the authenticated JAX helper", async () => {
  const harness = await readFile(
    new URL("./jax-auth-harness.html", import.meta.url),
    "utf8",
  );
  assert.match(harness, /getJaxRequestHeaders/);
  assert.match(harness, /jax-browser-test-session/);
  assert.match(harness, /generatorLyrics/);
});
