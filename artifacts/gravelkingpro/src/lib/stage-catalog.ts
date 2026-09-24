import type { LyricTiming } from "@/components/prompter/LyricTimer";

export type SerializedAudioBuffer = {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  channels: Float32Array[];
};

export type StageCatalogAudio = Blob | SerializedAudioBuffer;

export type StageCatalogLine = LyricTiming & { text: string };

export type StageCatalogMixer = {
  instrumentalLevel: number;
  guideLevel: number;
  instrumentalMute: boolean;
  guideMute: boolean;
  instrumentalSolo: boolean;
  guideSolo: boolean;
};

export type StageCatalogEntry = {
  id: string;
  createdAt: string;
  title: string;
  instrumental: StageCatalogAudio;
  guideVocal: StageCatalogAudio | null;
  lines: StageCatalogLine[];
  /** Explicit JSON timing payload for clients that need the LRC-style array. */
  syncedLyrics?: StageCatalogLine[];
  /** Guide-vocal alignment relative to the backing track, in seconds. */
  guideOffsetSeconds?: number;
  /** Decoded instrumental length in seconds, captured at save time for library metadata. */
  durationSeconds?: number;
  mixer?: StageCatalogMixer;
};

const DB_NAME = "gkp-stage-catalog";
const DB_VERSION = 1;
const STORE_NAME = "workshops";

function openStageCatalogOnce(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Stage Vault storage is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open Stage Vault."));
  });
}

function isRecoverableIndexedDbError(cause: unknown): boolean {
  if (!(cause instanceof DOMException)) return false;
  return ["AbortError", "InvalidStateError", "NotFoundError", "TransactionInactiveError", "UnknownError"]
    .includes(cause.name);
}

async function withStageCatalog<T>(
  operation: (database: IDBDatabase) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let database: IDBDatabase | null = null;
    try {
      database = await openStageCatalogOnce();
      return await operation(database);
    } catch (cause) {
      lastError = cause;
      if (attempt > 0 || !isRecoverableIndexedDbError(cause)) throw cause;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      database?.close();
    }
  }
  throw lastError;
}

function deserializeLegacyAudioBuffer(context: BaseAudioContext, serialized: SerializedAudioBuffer): AudioBuffer {
  const buffer = context.createBuffer(
    Math.max(1, serialized.numberOfChannels),
    serialized.length,
    serialized.sampleRate,
  );
  serialized.channels.forEach((channel, index) => {
    if (index < buffer.numberOfChannels) buffer.getChannelData(index).set(channel);
  });
  return buffer;
}

function isLegacyAudioBuffer(audio: StageCatalogAudio): audio is SerializedAudioBuffer {
  return "channels" in audio && Array.isArray(audio.channels);
}

export async function decodeStageCatalogAudio(
  context: BaseAudioContext,
  audio: StageCatalogAudio,
): Promise<AudioBuffer> {
  if (isLegacyAudioBuffer(audio)) return deserializeLegacyAudioBuffer(context, audio);
  return context.decodeAudioData(await audio.arrayBuffer());
}

export async function saveStageCatalogEntry(entry: StageCatalogEntry): Promise<void> {
  await withStageCatalog((database) => new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the Stage Vault entry."));
    transaction.onabort = () => reject(transaction.error ?? new DOMException("Stage Vault save was interrupted.", "AbortError"));
  }));
}

export async function listStageCatalogEntries(): Promise<StageCatalogEntry[]> {
  return withStageCatalog((database) => new Promise<StageCatalogEntry[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const entries = (request.result as StageCatalogEntry[]).sort((left, right) => (
        right.createdAt.localeCompare(left.createdAt)
      ));
      resolve(entries);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not read Stage Vault."));
    transaction.onabort = () => reject(transaction.error ?? new DOMException("Stage Vault read was interrupted.", "AbortError"));
  }));
}

export function stageCatalogLinesToPrompterLines(lines: StageCatalogLine[]) {
  return lines
    .slice()
    .sort((left, right) => left.timeSeconds - right.timeSeconds)
    .map((line, index, all) => ({
      id: `stage-${line.lineIndex}-${index}`,
      text: line.text,
      startTimeMs: Math.max(0, line.timeSeconds * 1000),
      endTimeMs: (all[index + 1]?.timeSeconds ?? line.timeSeconds + 3.5) * 1000,
    }));
}
