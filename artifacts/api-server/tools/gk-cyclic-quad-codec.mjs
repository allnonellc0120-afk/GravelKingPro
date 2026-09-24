/**
 * Local GKSAIL_V4 codec definitions.
 *
 * This module is deliberately transport-agnostic. It does not open sockets,
 * contact the Vertex proxy, or authorize an egress mount.
 *
 * A quad contains four vocabulary symbols. With a vocabulary of 16 symbols,
 * each symbol occupies one nibble and the quad occupies one 16-bit word:
 *
 *   [symbol0][symbol1][symbol2][symbol3]
 *       4 bits  4 bits  4 bits  4 bits
 */

export const GKSAIL_V4 = Object.freeze({
  module: "GkCyclicQuadCodec",
  vocabularySize: 16,
  cadence: Object.freeze([2, 4, 6, 8]),
  wordBitLength: 16,
  failClosedSymbol: 0x0000,
  status: "codec_loaded_awaiting_mount",
});

export class GkCyclicQuadCodecError extends Error {
  constructor(message) {
    super(message);
    this.name = "GkCyclicQuadCodecError";
  }
}

function isValidSymbol(symbol) {
  return Number.isInteger(symbol) && symbol >= 0 && symbol < GKSAIL_V4.vocabularySize;
}

function assertWord(word) {
  if (!Number.isInteger(word) || word < 0 || word > 0xffff) {
    throw new GkCyclicQuadCodecError("Quad word must be an unsigned 16-bit integer");
  }
}

export class GkCyclicQuadCodec {
  #mountAuthorized = false;

  constructor() {
    this.module = GKSAIL_V4.module;
    this.vocabularySize = GKSAIL_V4.vocabularySize;
    this.cadence = [...GKSAIL_V4.cadence];
    this.wordBitLength = GKSAIL_V4.wordBitLength;
    this.failClosedSymbol = GKSAIL_V4.failClosedSymbol;
  }

  /**
   * Pack four vocabulary symbols into one 16-bit word.
   *
   * The fail-closed word is reserved and cannot be emitted as a valid quad.
   * This prevents malformed input from becoming indistinguishable from a
   * valid all-zero payload.
   */
  packQuad(symbols) {
    if (!Array.isArray(symbols) || symbols.length !== 4 || !symbols.every(isValidSymbol)) {
      throw new GkCyclicQuadCodecError("packQuad requires exactly four symbols in the range 0..15");
    }

    const word = (
      (symbols[0] << 12)
      | (symbols[1] << 8)
      | (symbols[2] << 4)
      | symbols[3]
    ) >>> 0;

    if (word === this.failClosedSymbol) {
      throw new GkCyclicQuadCodecError("The fail-closed word 0x0000 is reserved");
    }

    return word;
  }

  /**
   * Return the configured fail-closed word for callers that need a sentinel
   * instead of an exception. This helper never authorizes transmission.
   */
  packQuadFailClosed(symbols) {
    try {
      return this.packQuad(symbols);
    } catch {
      return this.failClosedSymbol;
    }
  }

  unpackQuad(word) {
    assertWord(word);
    if (word === this.failClosedSymbol) {
      throw new GkCyclicQuadCodecError("The fail-closed word 0x0000 cannot be decoded as payload");
    }

    return [
      (word >>> 12) & 0x0f,
      (word >>> 8) & 0x0f,
      (word >>> 4) & 0x0f,
      word & 0x0f,
    ];
  }

  packQuads(quads) {
    if (!Array.isArray(quads)) {
      throw new GkCyclicQuadCodecError("packQuads requires an array of quads");
    }
    return quads.map((quad) => this.packQuad(quad));
  }

  unpackQuads(words) {
    if (!Array.isArray(words)) {
      throw new GkCyclicQuadCodecError("unpackQuads requires an array of words");
    }
    return words.map((word) => this.unpackQuad(word));
  }

  /**
   * Authorization is intentionally not inferred locally. A future transport
   * integration must call this only after validating a server response.
   */
  getStatus() {
    return {
      module: this.module,
      status: GKSAIL_V4.status,
      mountAuthorized: this.#mountAuthorized,
      cadence: [...this.cadence],
      wordBitLength: this.wordBitLength,
      vocabularySize: this.vocabularySize,
      failClosedSymbol: this.failClosedSymbol,
    };
  }
}

export const gkCyclicQuadCodec = new GkCyclicQuadCodec();

export function packQuad(symbols) {
  return gkCyclicQuadCodec.packQuad(symbols);
}

export function unpackQuad(word) {
  return gkCyclicQuadCodec.unpackQuad(word);
}