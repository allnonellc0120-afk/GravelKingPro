import { PluginDef, Region } from "./types";

const DB_NAME = "gravelking-daw";
const STORE   = "projects";
const DB_VER  = 1;

export interface SavedTrack {
  id: string;
  name: string;
  wavBase64: string;
  peaks: number[];
  duration: number;
  startOffset: number;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  plugins: PluginDef[];
  region: Region | null;
  color: string;
  edited: boolean;
}

export interface SavedProject {
  id: string;
  name: string;
  savedAt: number;
  bpm: number;
  masterVolume: number;
  loop: boolean;
  masterPlugins: PluginDef[];
  tracks: SavedTrack[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  savedAt: number;
  trackCount: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all = (req.result as SavedProject[]).map(p => ({
        id: p.id,
        name: p.name,
        savedAt: p.savedAt,
        trackCount: p.tracks.length,
      }));
      all.sort((a, b) => b.savedAt - a.savedAt);
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(project: SavedProject): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(project);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function loadProject(id: string): Promise<SavedProject | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as SavedProject | undefined);
    req.onerror   = () => reject(req.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function audioBufferToBase64(buffer: AudioBuffer): Promise<string> {
  const numChannels = buffer.numberOfChannels;
  const sampleRate  = buffer.sampleRate;
  const numSamples  = buffer.length;
  const bytesPerSample = 2;
  const blockAlign  = numChannels * bytesPerSample;
  const byteRate    = sampleRate * blockAlign;
  const dataSize    = numSamples * blockAlign;
  const bufSize     = 44 + dataSize;
  const ab          = new ArrayBuffer(bufSize);
  const view        = new DataView(ab);

  const ws = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  ws(0, "RIFF"); view.setUint32(4, 36 + dataSize, true);
  ws(8, "WAVE"); ws(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  ws(36, "data"); view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  const bytes = new Uint8Array(ab);
  let binary  = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function base64ToAudioBuffer(ctx: AudioContext, b64: string): Promise<AudioBuffer> {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return ctx.decodeAudioData(bytes.buffer.slice(0));
}
