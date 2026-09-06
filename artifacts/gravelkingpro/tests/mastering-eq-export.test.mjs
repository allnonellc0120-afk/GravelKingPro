import test from "node:test";
import assert from "node:assert/strict";
import {
  FLAT_MASTERING_EQ,
  getMasteringDownloadPath,
  isMasteringEqActive,
} from "../src/lib/mastering-eq.ts";

test("flat EQ keeps the existing server download path", () => {
  assert.equal(isMasteringEqActive(FLAT_MASTERING_EQ, 0), false);
  assert.equal(getMasteringDownloadPath(FLAT_MASTERING_EQ, 0), "server");
});

test("any fine-tuning selects the browser-rendered EQ export", () => {
  assert.equal(getMasteringDownloadPath([0, 0, 0, 0, 0, 0, 0, 0, 0, 0.01], 0), "eq-render");
  assert.equal(getMasteringDownloadPath(FLAT_MASTERING_EQ, -0.01), "eq-render");
});