import test from "node:test";
import assert from "node:assert/strict";
import {
  FLAT_MASTERING_EQ,
  getMasteringDownloadPath,
  isMasteringEqActive,
  isMasteringEqExportCancelled,
  isMasteringEqResourceError,
  MasteringEqResourceError,
  MasteringEqExportCancelledError,
} from "../src/lib/mastering-eq.ts";

test("flat EQ keeps the existing server download path", () => {
  assert.equal(isMasteringEqActive(FLAT_MASTERING_EQ, 0), false);
  assert.equal(getMasteringDownloadPath(FLAT_MASTERING_EQ, 0), "server");
});

test("any fine-tuning selects the browser-rendered EQ export", () => {
  assert.equal(getMasteringDownloadPath([0, 0, 0, 0, 0, 0, 0, 0, 0, 0.01], 0), "eq-render");
  assert.equal(getMasteringDownloadPath(FLAT_MASTERING_EQ, -0.01), "eq-render");
});

test("cancelled fine-tune exports have a distinct, non-error-toast signal", () => {
  assert.equal(isMasteringEqExportCancelled(new MasteringEqExportCancelledError()), true);
  assert.equal(isMasteringEqExportCancelled({ name: "AbortError" }), true);
  assert.equal(isMasteringEqExportCancelled(new Error("render failed")), false);
});

test("resource failures stay distinct from network failures", () => {
  const allocationFailure = new MasteringEqResourceError();
  const networkFailure = new TypeError("Failed to fetch");

  assert.equal(isMasteringEqResourceError(allocationFailure), true);
  assert.equal(allocationFailure.code, "INSUFFICIENT_RESOURCES");
  assert.equal(isMasteringEqResourceError(networkFailure), false);
});
