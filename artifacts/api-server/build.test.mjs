import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

// Bundles the integration test the same way build.mjs bundles the server: workspace
// deps (@workspace/db, etc.) are bundled, only true native modules are external, and
// the pino plugin handles pino's worker transport. Output goes to dist-test/ —
// deliberately OUTSIDE dist/, because build.mjs rm -rf's dist/ on every dev
// rebuild and would delete test bundles mid-run when the dev workflow rebuilds
// concurrently with the test suite.
async function buildTest() {
  const outDir = path.resolve(artifactDir, "dist-test");
  await rm(outDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [
      path.resolve(artifactDir, "src/__tests__/studio-audio.test.ts"),
      path.resolve(artifactDir, "src/__tests__/master-kernel.test.ts"),
      path.resolve(artifactDir, "src/__tests__/whitepaper.test.ts"),
      path.resolve(artifactDir, "src/__tests__/price-parity.test.ts"),
      path.resolve(artifactDir, "src/__tests__/download-gate.test.ts"),
      path.resolve(artifactDir, "src/__tests__/webhook-track-purchase.test.ts"),
      path.resolve(artifactDir, "src/__tests__/referral-commission.test.ts"),
      path.resolve(artifactDir, "src/__tests__/benchmark.test.ts"),
      path.resolve(artifactDir, "src/__tests__/clerk-jit-provision.test.ts"),
      path.resolve(artifactDir, "src/__tests__/generation-pipeline.test.ts"),
    ],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: outDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      esbuildPluginPino({ transports: ["pino-pretty"] }),
    ],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

buildTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
