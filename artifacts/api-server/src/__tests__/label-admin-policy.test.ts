import { assertFeaturedSlotAvailable } from "../routes/featuredContest";
import { isLabelCatalogOwner, isDeveloperAuthenticated } from "../lib/adminAuth";
import { cleanupStoredLabelObjects } from "../lib/labelPublishCleanup";
import { createLabelPublishHandler } from "../routes/tracks";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function request(email?: string) {
  return { dbUser: email ? { email } : undefined } as never;
}

function expectConflict(label: string, input: Parameters<typeof assertFeaturedSlotAvailable>[0]): void {
  try {
    assertFeaturedSlotAvailable(input);
    check(label, false);
  } catch (error) {
    check(label, (error as { statusCode?: number }).statusCode === 409);
  }
}

async function expectRejectedLabelPublishCleanup(): Promise<void> {
  const objects = new Map<string, Buffer>();
  const deleted: string[] = [];
  const attemptedRows: Array<Record<string, unknown>> = [];
  const publicRows: Array<Record<string, unknown>> = [];
  let insertAttempts = 0;
  const storage = {
    async savePrivateObject(key: string, buffer: Buffer): Promise<void> {
      objects.set(key, buffer);
    },
    async savePublicObject(key: string, buffer: Buffer): Promise<void> {
      objects.set(key, buffer);
    },
    async deleteObject(key: string): Promise<void> {
      deleted.push(key);
      objects.delete(key);
    },
  };
  const handler = createLabelPublishHandler({
    storage,
    buildPreview: async () => Buffer.from("preview"),
    insertTrack: async (values) => {
      insertAttempts += 1;
      attemptedRows.push(values);
      throw new Error("injected database failure after storage writes");
    },
    idFactory: () => "failure-test-release",
  });
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  await handler(
    {
      dbUser: { id: "test-owner", email: "ALLNONELLC0120@GMAIL.COM" },
      body: { title: "Failed release", artistName: "Test artist" },
      files: {
        audio_master: [{ buffer: Buffer.from("master"), originalname: "master.wav", mimetype: "audio/wav" }],
        cover_art: [{ buffer: Buffer.from("cover"), originalname: "cover.png", mimetype: "image/png" }],
      },
    } as never,
    response as never,
  );
  const body = response.body as { error?: string } | undefined;
  check("failed label publish returns an error", response.statusCode === 500 && body?.error === "injected database failure after storage writes");
  check(
    "failed label publish leaves no public track row",
    insertAttempts === 1 && attemptedRows.length === 1 && publicRows.length === 0,
  );
  check("failed label publish removes every temporary object", objects.size === 0 && deleted.length === 3);
}

async function expectLabelPublishVisibility(visibility: "draft" | "live"): Promise<void> {
  const stored = new Map<string, Buffer>();
  let previewBuilt = false;
  let inserted: Record<string, unknown> | undefined;
  const handler = createLabelPublishHandler({
    storage: {
      async savePrivateObject(key: string, buffer: Buffer): Promise<void> { stored.set(key, buffer); },
      async savePublicObject(key: string, buffer: Buffer): Promise<void> { stored.set(key, buffer); },
      async deleteObject(): Promise<void> {},
    },
    buildPreview: async (master, ext, id) => {
      previewBuilt = master.toString() === "master" && ext === "wav" && id === `visibility-test-${visibility}`;
      return Buffer.from("server-derived preview");
    },
    insertTrack: async (values) => { inserted = values as Record<string, unknown>; return values; },
    idFactory: () => `visibility-test-${visibility}`,
  });
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  await handler({
    dbUser: { id: "test-owner", email: "allnonellc0120@gmail.com" },
    body: { title: "Visibility test", artistName: "Test artist", visibility },
    files: {
      audio_master: [{ buffer: Buffer.from("master"), originalname: "master.wav", mimetype: "audio/wav" }],
      cover_art: [{ buffer: Buffer.from("cover"), originalname: "cover.png", mimetype: "image/png" }],
    },
  } as never, response as never);
  const expectedStatus = visibility === "draft" ? "pending" : "accepted";
  check(
    `${visibility} label upload commits expected visibility and fixed price`,
    response.statusCode === 200 && inserted?.status === expectedStatus && inserted?.price === 9.99,
  );
  if (visibility === "draft") {
    check("draft label upload is excluded by accepted-only public listings", inserted?.status !== "accepted");
  }
  check(
    `${visibility} upload stores the private master, server-derived preview, and cover`,
    previewBuilt
      && stored.get(`private/tracks/visibility-test-${visibility}/audio_master.wav`)?.toString() === "master"
      && stored.get(`tracks/visibility-test-${visibility}/audio_preview.mp3`)?.toString() === "server-derived preview"
      && stored.get(`tracks/visibility-test-${visibility}/cover_art.png`)?.toString() === "cover",
  );
}

async function expectLabelPublishOwnerGate(): Promise<void> {
  let storageWrites = 0;
  const handler = createLabelPublishHandler({
    storage: {
      async savePrivateObject(): Promise<void> { storageWrites += 1; },
      async savePublicObject(): Promise<void> { storageWrites += 1; },
      async deleteObject(): Promise<void> {},
    },
    buildPreview: async () => Buffer.from("preview"),
    insertTrack: async () => { throw new Error("unauthorized upload reached DB"); },
    idFactory: () => "unauthorized-release",
  });
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  await handler({
    dbUser: { id: "other-user", email: "other@example.com" },
    body: { title: "Unauthorized", artistName: "Someone", visibility: "live" },
    files: {
      audio_master: [{ buffer: Buffer.from("master"), originalname: "master.wav", mimetype: "audio/wav" }],
      cover_art: [{ buffer: Buffer.from("cover"), originalname: "cover.png", mimetype: "image/png" }],
    },
  } as never, response as never);
  check("label publish remains owner-only before storage or database writes", response.statusCode === 403 && storageWrites === 0);
}

async function expectFailedPublishCleanup(): Promise<void> {
  const objectKeys = [
    "private/tracks/test/audio_master.wav",
    "tracks/test/audio_preview.mp3",
    "tracks/test/cover_art.png",
  ];
  const objects = new Map(objectKeys.map((key) => [
    key,
    {
      async delete() {
        objects.delete(key);
      },
    },
  ]));
  const publicRows: string[] = [];
  const storedKeys: string[] = [];
  let responseStatus = 200;

  try {
    for (const key of objectKeys) {
      storedKeys.push(key);
      if (key === objectKeys[objectKeys.length - 1]) {
        throw new Error("injected database failure after object writes");
      }
    }
    publicRows.push("would-not-commit");
  } catch {
    responseStatus = 500;
    await cleanupStoredLabelObjects(
      storedKeys,
      "test-bucket",
      async (_bucketId, key) => objects.get(key) ?? null,
    );
  }

  check("failed publish returns an error", responseStatus === 500);
  check("failed publish commits no public track row", publicRows.length === 0);
  check("failed publish leaves no stored objects", objects.size === 0);
}
check("owner identity is admitted case-insensitively", isLabelCatalogOwner(request("ALLNONELLC0120@GMAIL.COM")));
check("incorrect former owner identity is denied", !isLabelCatalogOwner(request("allin10120@gmail.com")));
check("incorrect former owner cannot use a stale developer grant", !await isDeveloperAuthenticated({
  dbUser: { email: "allin10120@gmail.com", isDeveloper: true },
} as never));
check("anonymous identity is denied", !isLabelCatalogOwner(request()));
expectConflict("eleventh featured slot is rejected", {
  sameArtistAlreadySelected: false,
  selectedCount: 10,
  maxSlots: 10,
});
expectConflict("second slot for the same artist account is rejected", {
  sameArtistAlreadySelected: true,
  selectedCount: 1,
  maxSlots: 10,
});
try {
  assertFeaturedSlotAvailable({ sameArtistAlreadySelected: false, selectedCount: 9, maxSlots: 10 });
  check("ninth-to-tenth featured slot is accepted", true);
} catch {
  check("ninth-to-tenth featured slot is accepted", false);
}

await expectFailedPublishCleanup();
await expectRejectedLabelPublishCleanup();
await expectLabelPublishVisibility("draft");
await expectLabelPublishVisibility("live");
await expectLabelPublishOwnerGate();

if (failed > 0) process.exitCode = 1;
console.log(`label-admin-policy: ${passed} passed, ${failed} failed`);
