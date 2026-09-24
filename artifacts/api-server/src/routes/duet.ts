import { Router, type Request, type Response } from "express";
import {
  db,
  artistProfilesTable,
  purchasedTracksTable,
  tracksTable,
  duetRoomsTable,
  duetPeersTable,
  duetEventsTable,
} from "@workspace/db";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { saveObjectWithFallback } from "../lib/objectStorage";
import { storage } from "../storage";

type SignalType = "offer" | "answer" | "ice";

const ROOM_IDLE_TIMEOUT_MS = 15 * 60_000;
const EXPIRED_ROOM_RETENTION_MS = 24 * 60 * 60_000;

interface PeerState {
  peerId: string;
  role: "host" | "partner";
  profile: {
    artistName: string;
    hometown: string;
    avatarUrl: string | null;
  } | null;
  response: Response | null;
}

interface DuetQueueItem {
  id: string;
  trackId: string;
  title: string;
  durationSeconds: number | null;
  hasSyncedLyrics: boolean;
  queuedByPeerId: string;
  queuedByRole: "host" | "partner";
  serverTimestamp: number;
}

interface DuetRoom {
  roomId: string;
  peers: Map<string, PeerState>;
  nowPlaying: DuetQueueItem | null;
  upNext: DuetQueueItem[];
  lastQueueTimestamp: number;
  lastActivityAt: number;
}

const duetRooms = new Map<string, DuetRoom>();
const expiredRoomIds = new Map<string, number>();
const duetRouter = Router();
const reviewUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

// Credentials are server-only. The browser receives only the ICE server
// configuration needed for this session; no unrelated environment variables
// are exposed to Vite.
duetRouter.get("/duet/ice-config", (_req: Request, res: Response) => {
  const urls = process.env.TURN_URL?.trim();
  const username = process.env.TURN_USERNAME?.trim();
  const credential = process.env.TURN_CREDENTIAL?.trim();
  const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: "stun:stun.l.google.com:19302" },
  ];
  if (urls && username && credential) {
    iceServers.push({ urls, username, credential });
  }
  res.json({ iceServers, turnConfigured: iceServers.length > 1 });
});

function cleanRoomId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function cleanPeerId(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120)
    : "";
}

function getRoom(roomId: string): DuetRoom {
  let room = duetRooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      peers: new Map(),
      nowPlaying: null,
      upNext: [],
      lastQueueTimestamp: 0,
      lastActivityAt: Date.now(),
    };
    duetRooms.set(roomId, room);
  }
  return room;
}

async function loadRoom(roomId: string): Promise<DuetRoom | null> {
  const inMemory = duetRooms.get(roomId);
  if (inMemory) return inMemory;
  const [saved] = await db.select().from(duetRoomsTable)
    .where(eq(duetRoomsTable.roomId, roomId)).limit(1);
  if (!saved || saved.expiredAt) return null;
  const room: DuetRoom = {
    roomId,
    peers: new Map(),
    nowPlaying: (saved.nowPlaying as DuetQueueItem | null) ?? null,
    upNext: (saved.upNext as DuetQueueItem[]) ?? [],
    lastQueueTimestamp: saved.lastQueueTimestamp,
    lastActivityAt: saved.lastActivityAt.getTime(),
  };
  const peers = await db.select().from(duetPeersTable)
    .where(eq(duetPeersTable.roomId, roomId));
  for (const peer of peers) {
    room.peers.set(peer.peerId, {
      peerId: peer.peerId,
      role: peer.role === "partner" ? "partner" : "host",
      profile: (peer.profile as PeerState["profile"]) ?? null,
      response: null,
    });
  }
  duetRooms.set(roomId, room);
  return room;
}

function persistRoom(room: DuetRoom): void {
  void db.insert(duetRoomsTable).values({
    roomId: room.roomId,
    nowPlaying: room.nowPlaying,
    upNext: room.upNext,
    lastQueueTimestamp: room.lastQueueTimestamp,
    lastActivityAt: new Date(room.lastActivityAt),
  }).onConflictDoUpdate({
    target: duetRoomsTable.roomId,
    set: {
      nowPlaying: room.nowPlaying,
      upNext: room.upNext,
      lastQueueTimestamp: room.lastQueueTimestamp,
      lastActivityAt: new Date(room.lastActivityAt),
    },
  }).catch(() => {});
  for (const peer of room.peers.values()) {
    void db.insert(duetPeersTable).values({
      roomId: room.roomId,
      peerId: peer.peerId,
      role: peer.role,
      profile: peer.profile,
      lastSeenAt: new Date(),
    }).onConflictDoUpdate({
      target: [duetPeersTable.roomId, duetPeersTable.peerId],
      set: { role: peer.role, profile: peer.profile, lastSeenAt: new Date() },
    }).catch(() => {});
  }
}

function appendRoomEvent(roomId: string, eventType: string, payload: unknown): void {
  void db.insert(duetEventsTable).values({ roomId, eventType, payload }).catch(() => {});
}

function touchRoom(room: DuetRoom): void {
  room.lastActivityAt = Date.now();
  persistRoom(room);
}

function roomExpiredPayload(): { code: string; error: string } {
  return {
    code: "ROOM_EXPIRED",
    error: "This room session has expired. Start a new session.",
  };
}

function isExpiredRoom(roomId: string): boolean {
  return expiredRoomIds.has(roomId);
}

function markRoomExpired(room: DuetRoom): void {
  expiredRoomIds.set(room.roomId, Date.now());
  for (const peer of room.peers.values()) {
    if (peer.response && !peer.response.writableEnded && !peer.response.destroyed) {
      sendEvent(peer.response, "room-expired", roomExpiredPayload());
      peer.response.end();
    }
  }
  room.peers.clear();
  duetRooms.delete(room.roomId);
}

function pruneExpiredRooms(): void {
  const now = Date.now();
  for (const [roomId, expiredAt] of expiredRoomIds) {
    if (now - expiredAt > EXPIRED_ROOM_RETENTION_MS) expiredRoomIds.delete(roomId);
  }
  for (const room of duetRooms.values()) {
    if (now - room.lastActivityAt > ROOM_IDLE_TIMEOUT_MS) markRoomExpired(room);
  }
}

const roomExpiryTimer = setInterval(pruneExpiredRooms, 60_000);
roomExpiryTimer.unref?.();

function queueSnapshot(room: DuetRoom) {
  return {
    nowPlaying: room.nowPlaying,
    upNext: room.upNext,
  };
}

function broadcastQueue(room: DuetRoom): void {
  const snapshot = queueSnapshot(room);
  persistRoom(room);
  appendRoomEvent(room.roomId, "queue-updated", snapshot);
  for (const peer of room.peers.values()) {
    if (peer.response) sendEvent(peer.response, "queue-updated", snapshot);
  }
}

function nextServerTimestamp(room: DuetRoom): number {
  // Date.now() can repeat for simultaneous packets. This remains wall-clock
  // comparable while guaranteeing a strict, monotonic order inside the room.
  room.lastQueueTimestamp = Math.max(Date.now(), room.lastQueueTimestamp + 1);
  return room.lastQueueTimestamp;
}

function sendEvent(response: Response, event: string, payload: unknown): void {
  if (response.writableEnded || response.destroyed) return;
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function getPeer(req: Request, room: DuetRoom): PeerState | null {
  const peerId = cleanPeerId(req.query.peerId);
  return peerId ? room.peers.get(peerId) ?? null : null;
}

function closeEmptyRoom(room: DuetRoom): void {
  if (room.peers.size === 0) duetRooms.delete(room.roomId);
}

async function getPeerProfile(req: Request): Promise<PeerState["profile"]> {
  if (!req.dbUser) return null;
  const [profile] = await db
    .select({
      artistName: artistProfilesTable.artistName,
      hometown: artistProfilesTable.hometown,
      avatarUrl: artistProfilesTable.avatarUrl,
    })
    .from(artistProfilesTable)
    .where(eq(artistProfilesTable.userId, req.dbUser.id))
    .limit(1);
  return {
    artistName: profile?.artistName?.trim()
      || [req.dbUser.firstName, req.dbUser.lastName].filter(Boolean).join(" ").trim()
      || "GravelKing Artist",
    hometown: profile?.hometown ?? "",
    avatarUrl: profile?.avatarUrl ?? req.dbUser.profileImageUrl ?? null,
  };
}

/**
 * Lightweight, in-memory SDP/ICE relay. Audio never passes through this API:
 * the room only carries signaling messages and is hard-capped at two peers.
 */
duetRouter.post("/duet/room/:roomId/join", async (req: Request, res: Response) => {
  pruneExpiredRooms();
  const roomId = cleanRoomId(routeParam(req.params.roomId));
  const peerId = cleanPeerId(req.body?.peerId);
  if (!roomId || !peerId) {
    res.status(400).json({ error: "A valid roomId and peerId are required." });
    return;
  }

  if (isExpiredRoom(roomId)) {
    res.status(410).json(roomExpiredPayload());
    return;
  }

  const room = (await loadRoom(roomId)) ?? getRoom(roomId);
  const existing = room.peers.get(peerId);
  if (existing) {
    touchRoom(room);
    res.json({
      roomId,
      peerId,
      role: existing.role,
      otherPeerId: [...room.peers.keys()].find((id) => id !== peerId) ?? null,
      otherPeerProfile: [...room.peers.values()].find((peer) => peer.peerId !== peerId)?.profile ?? null,
      profile: existing.profile,
      capacity: 2,
      queue: queueSnapshot(room),
    });
    return;
  }

  if (room.peers.size >= 2) {
    res.status(409).json({ error: "This duet room already has a Host and Partner." });
    return;
  }

  const role = room.peers.size === 0 ? "host" : "partner";
  const profile = await getPeerProfile(req);
  room.peers.set(peerId, { peerId, role, profile, response: null });
  touchRoom(room);
  const otherPeerId = [...room.peers.keys()].find((id) => id !== peerId) ?? null;
  if (otherPeerId) {
    const other = room.peers.get(otherPeerId);
    if (other?.response) sendEvent(other.response, "peer-joined", { peerId, role, profile });
    appendRoomEvent(roomId, "peer-joined", { peerId, role, profile });
  }

  res.json({
    roomId,
    peerId,
    role,
    otherPeerId,
    otherPeerProfile: room.peers.get(otherPeerId ?? "")?.profile ?? null,
    profile,
    capacity: 2,
    queue: queueSnapshot(room),
  });
});

duetRouter.get("/duet/room/:roomId/events", async (req: Request, res: Response) => {
  pruneExpiredRooms();
  const roomId = cleanRoomId(routeParam(req.params.roomId));
  if (isExpiredRoom(roomId)) {
    res.status(410).json(roomExpiredPayload());
    return;
  }
  const room = await loadRoom(roomId);
  const peer = room ? getPeer(req, room) : null;
  if (!room || !peer) {
    res.status(404).json({ error: "Join the duet room before opening its signal stream." });
    return;
  }

  touchRoom(room);
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  peer.response = res;
  sendEvent(res, "connected", { roomId, peerId: peer.peerId, role: peer.role });
  sendEvent(res, "queue-updated", queueSnapshot(room));
  const [latestEvent] = await db.select({ id: duetEventsTable.id })
    .from(duetEventsTable)
    .where(eq(duetEventsTable.roomId, roomId))
    .orderBy(desc(duetEventsTable.id))
    .limit(1);
  let lastEventId = latestEvent?.id ?? 0;

  const keepAlive = setInterval(() => {
    if (res.writableEnded || res.destroyed) return;
    res.write(": keep-alive\n\n");
  }, 15_000);
  const eventPoll = setInterval(() => {
    void db.select().from(duetEventsTable)
      .where(and(eq(duetEventsTable.roomId, roomId), gt(duetEventsTable.id, lastEventId)))
      .orderBy(asc(duetEventsTable.id))
      .limit(100)
      .then((events) => {
        for (const event of events) {
          lastEventId = Math.max(lastEventId, event.id);
          const payload = event.payload as { toPeerId?: string } | null;
          if (event.eventType === "signal" && payload?.toPeerId !== peer.peerId) continue;
          if (event.eventType !== "queue-updated") {
            sendEvent(res, event.eventType, event.payload);
          }
        }
      })
      .catch(() => {});
  }, 1_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    clearInterval(eventPoll);
    if (peer.response === res) peer.response = null;
  });
});

duetRouter.post("/duet/room/:roomId/signal", async (req: Request, res: Response) => {
  pruneExpiredRooms();
  const roomId = cleanRoomId(routeParam(req.params.roomId));
  const room = await loadRoom(roomId);
  const fromPeerId = cleanPeerId(req.body?.fromPeerId);
  const toPeerId = cleanPeerId(req.body?.toPeerId);
  const type = req.body?.type as SignalType;
  if (!room || !fromPeerId || !room.peers.has(fromPeerId)) {
    if (isExpiredRoom(roomId)) {
      res.status(410).json(roomExpiredPayload());
      return;
    }
    res.status(404).json({ error: "Sender is not connected to this duet room." });
    return;
  }
  if (!toPeerId || !room.peers.has(toPeerId) || fromPeerId === toPeerId) {
    res.status(400).json({ error: "A connected recipient is required." });
    return;
  }
  if (type !== "offer" && type !== "answer" && type !== "ice") {
    res.status(400).json({ error: "Only SDP offer, answer, and ICE messages are allowed." });
    return;
  }

  touchRoom(room);
  const recipient = room.peers.get(toPeerId);
  if (recipient?.response) {
    sendEvent(recipient.response, "signal", {
      fromPeerId,
      type,
      payload: req.body?.payload ?? null,
    });
  }
  appendRoomEvent(roomId, "signal", { fromPeerId, toPeerId, type, payload: req.body?.payload ?? null });
  res.status(202).json({ delivered: Boolean(recipient?.response) });
});

/**
 * Server-arbitrated stage queue. Node handles each request serially, and the
 * monotonic timestamp removes Date.now() ties: earliest accepted packet owns
 * Now Playing; every later packet is appended to Up Next.
 */
duetRouter.post("/duet/room/:roomId/queue", async (req: Request, res: Response) => {
  pruneExpiredRooms();
  const roomId = cleanRoomId(routeParam(req.params.roomId));
  const room = await loadRoom(roomId);
  const peerId = cleanPeerId(req.body?.peerId);
  const peer = room?.peers.get(peerId);
  const trackId = typeof req.body?.trackId === "string"
    ? req.body.trackId.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 160)
    : "";
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 255) : "";
  if (!room || !peer) {
    if (isExpiredRoom(roomId)) {
      res.status(410).json(roomExpiredPayload());
      return;
    }
    res.status(404).json({ error: "Join the duet room before queueing a song." });
    return;
  }
  if (!trackId || !title) {
    res.status(400).json({ error: "A valid trackId and title are required." });
    return;
  }

  touchRoom(room);
  const item: DuetQueueItem = {
    id: randomUUID(),
    trackId,
    title,
    durationSeconds: Number.isFinite(req.body?.durationSeconds)
      ? Math.max(0, Number(req.body.durationSeconds))
      : null,
    hasSyncedLyrics: req.body?.hasSyncedLyrics === true,
    queuedByPeerId: peer.peerId,
    queuedByRole: peer.role,
    serverTimestamp: nextServerTimestamp(room),
  };
  const placement = room.nowPlaying ? "up-next" : "now-playing";
  if (room.nowPlaying) room.upNext.push(item);
  else room.nowPlaying = item;
  broadcastQueue(room);
  res.status(201).json({ placement, item, queue: queueSnapshot(room) });
});

duetRouter.post("/duet/room/:roomId/queue/advance", async (req: Request, res: Response) => {
  pruneExpiredRooms();
  const roomId = cleanRoomId(routeParam(req.params.roomId));
  const room = await loadRoom(roomId);
  const peerId = cleanPeerId(req.body?.peerId);
  const peer = room?.peers.get(peerId);
  if (!room || !peer) {
    if (isExpiredRoom(roomId)) {
      res.status(410).json(roomExpiredPayload());
      return;
    }
    res.status(404).json({ error: "Join the duet room before advancing the queue." });
    return;
  }
  if (peer.role !== "host") {
    res.status(403).json({ error: "Only the Host can advance the stage queue." });
    return;
  }
  touchRoom(room);
  room.nowPlaying = room.upNext.shift() ?? null;
  broadcastQueue(room);
  res.json({ queue: queueSnapshot(room) });
});

duetRouter.post("/duet/room/:roomId/leave", async (req: Request, res: Response) => {
  pruneExpiredRooms();
  const roomId = cleanRoomId(routeParam(req.params.roomId));
  const room = await loadRoom(roomId);
  const peerId = cleanPeerId(req.body?.peerId);
  if (!room || !peerId || !room.peers.has(peerId)) {
    res.status(204).end();
    return;
  }

  touchRoom(room);
  room.peers.delete(peerId);
  void db.delete(duetPeersTable).where(and(
    eq(duetPeersTable.roomId, roomId),
    eq(duetPeersTable.peerId, peerId),
  )).catch(() => {});
  appendRoomEvent(roomId, "peer-left", { peerId });
  for (const remaining of room.peers.values()) {
    if (remaining.response) sendEvent(remaining.response, "peer-left", { peerId });
  }
  closeEmptyRoom(room);
  res.status(204).end();
});

/**
 * Store a completed local duet review as a private Vault track.
 * The browser sends the already-combined backing + vocal bounce; this route
 * only owns the private object and the user/library rows. It never publishes
 * duet audio to the public label.
 */
duetRouter.post("/duet/review", reviewUpload.single("audio"), async (req: Request, res: Response) => {
  const file = req.file;
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 255) : "";
  if (!file || !file.buffer.length || !title) {
    res.status(400).json({ error: "A title and mixed duet audio are required." });
    return;
  }

  let ownerId = req.dbUser?.id ?? null;
  if (!ownerId) {
    const sessionId = (req.cookies as Record<string, string> | undefined)?.gk_session;
    if (sessionId) {
      const user = await storage.getUserBySession(sessionId);
      ownerId = user?.id ?? null;
    }
  }
  if (!ownerId) {
    res.status(401).json({ error: "Sign in to save a duet to Vault." });
    return;
  }

  const id = randomUUID();
  const key = `private/duets/${ownerId}/${id}/performance.wav`;
  try {
    await saveObjectWithFallback(process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "", key, file.buffer, {
      contentType: file.mimetype || "audio/wav",
    });
    const [track] = await db.insert(tracksTable).values({
      id,
      title,
      artistName: "GravelKing Duet",
      audioFullKey: key,
      // Private tracks are played through the ownership-gated stream route.
      audioPreviewKey: key,
      coverArtKey: "",
      status: "private",
      submittedByUserId: ownerId,
      price: 0,
    }).returning();
    await db.insert(purchasedTracksTable).values({
      userId: ownerId,
      trackId: id,
      stripeCheckoutSessionId: `duet-review-${id}`,
    }).onConflictDoNothing();
    res.json({ ok: true, track: { id: track.id, title: track.title } });
  } catch (error) {
    req.log?.error?.({ error }, "duet review vault save failed");
    res.status(500).json({ error: "Could not save the duet to Vault." });
  }
});

export default duetRouter;