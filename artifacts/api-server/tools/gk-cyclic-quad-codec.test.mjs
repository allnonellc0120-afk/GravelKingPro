import assert from "node:assert/strict";
import test from "node:test";
import {
  GKSAIL_V4,
  GkCyclicQuadCodec,
  gkCyclicQuadCodec,
  packQuad,
  unpackQuad,
} from "./gk-cyclic-quad-codec.mjs";

test("loads GKSAIL_V4 definitions in an unmounted state", () => {
  assert.deepEqual(GKSAIL_V4, {
    module: "GkCyclicQuadCodec",
    vocabularySize: 16,
    cadence: [2, 4, 6, 8],
    wordBitLength: 16,
    failClosedSymbol: 0x0000,
    status: "codec_loaded_awaiting_mount",
  });
  assert.deepEqual(gkCyclicQuadCodec.getStatus(), {
    module: "GkCyclicQuadCodec",
    status: "codec_loaded_awaiting_mount",
    mountAuthorized: false,
    cadence: [2, 4, 6, 8],
    wordBitLength: 16,
    vocabularySize: 16,
    failClosedSymbol: 0x0000,
  });
});

test("packs and unpacks four vocabulary symbols", () => {
  const codec = new GkCyclicQuadCodec();
  const symbols = [0x1, 0x2, 0xa, 0xf];
  const word = codec.packQuad(symbols);

  assert.equal(word, 0x12af);
  assert.deepEqual(codec.unpackQuad(word), symbols);
  assert.equal(packQuad(symbols), word);
  assert.deepEqual(unpackQuad(word), symbols);
});

test("supports batches without changing the transport state", () => {
  const codec = new GkCyclicQuadCodec();
  const quads = [[1, 2, 3, 4], [5, 6, 7, 8]];
  const words = codec.packQuads(quads);

  assert.deepEqual(words, [0x1234, 0x5678]);
  assert.deepEqual(codec.unpackQuads(words), quads);
  assert.equal(codec.getStatus().mountAuthorized, false);
});

test("rejects malformed input and reserves the fail-closed word", () => {
  const codec = new GkCyclicQuadCodec();

  assert.throws(() => codec.packQuad([1, 2, 3]), /exactly four symbols/);
  assert.throws(() => codec.packQuad([1, 2, 3, 16]), /range 0\.\.15/);
  assert.throws(() => codec.packQuad([0, 0, 0, 0]), /fail-closed word/);
  assert.throws(() => codec.unpackQuad(0), /fail-closed word/);
  assert.equal(codec.packQuadFailClosed([1, 2, 3]), 0x0000);
  assert.equal(codec.packQuadFailClosed([0, 0, 0, 0]), 0x0000);
});