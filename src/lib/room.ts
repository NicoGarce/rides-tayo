import {
  ref as dbRef,
  set,
  remove,
  get,
  push,
  onValue,
  off,
  onDisconnect,
  query,
  limitToLast,
  orderByChild,
} from "firebase/database";
import { db } from "./firebase";

export function createRoom(roomId: string): Promise<void> {
  const roomRef = dbRef(db, `rooms/${roomId}`);
  return set(roomRef, { createdAt: Date.now() });
}

export async function roomExists(roomId: string): Promise<boolean> {
  const snap = await get(dbRef(db, `rooms/${roomId}/createdAt`));
  return snap.exists();
}

/* ------------------------------------------------------------------ */
/*  Firebase Realtime Database layout:                                 */
/*    rooms/{roomId}/riders/{riderId}/                                 */
/*      peerId: string                                                 */
/*      name: string                                                   */
/*      lastSeen: number (epoch ms)                                    */
/*      location/  (optional)                                          */
/*        lat: number                                                  */
/*        lng: number                                                  */
/*        heading: number | null                                       */
/*        updatedAt: number (epoch ms)                                 */
/* ------------------------------------------------------------------ */

export interface RiderLocation {
  lat: number;
  lng: number;
  heading: number | null;
  updatedAt: number;
}

export interface RiderData {
  peerId: string;
  name: string;
  lastSeen: number;
  location?: RiderLocation;
}

/* writes the rider's presence and sets onDisconnect() so the node is
   auto-removed when the tab closes or network drops */
export async function writePresence(
  roomId: string,
  riderId: string,
  data: { peerId: string; name: string }
): Promise<void> {
  const riderRef = dbRef(db, `rooms/${roomId}/riders/${riderId}`);
  await set(riderRef, { ...data, lastSeen: Date.now() });
  onDisconnect(riderRef).remove();
}

/* explicit removal (used during intentional leave) */
export function removePresence(roomId: string, riderId: string): void {
  const riderRef = dbRef(db, `rooms/${roomId}/riders/${riderId}`);
  remove(riderRef);
}

export function writeLocation(
  roomId: string,
  riderId: string,
  coords: { lat: number; lng: number; heading: number | null }
): void {
  const locRef = dbRef(db, `rooms/${roomId}/riders/${riderId}/location`);
  set(locRef, { ...coords, updatedAt: Date.now() });
}

export function removeLocation(roomId: string, riderId: string): void {
  const locRef = dbRef(db, `rooms/${roomId}/riders/${riderId}/location`);
  remove(locRef);
}

/* ------------------------------------------------------------------ */
/*  Destination (shared route target)                                  */
/*    rooms/{roomId}/destination/                                      */
/*      label: string (human-readable place name)                     */
/*      lat/lng: number (pinned destination)                          */
/*      startLat/startLng: number (route origin)                      */
/*      startLabel: string                                            */
/*      geometryStr: string (JSON [[lat,lng],...] polyline)           */
/*      distanceM/durationS: number|null (route totals)               */
/*      setByRiderId/setByName: string                                */
/*      updatedAt: number (epoch ms)                                  */
/* ------------------------------------------------------------------ */

export interface Destination {
  label: string;
  lat: number;
  lng: number;
  startLat: number;
  startLng: number;
  startLabel: string;
  geometryStr: string;
  distanceM: number | null;
  durationS: number | null;
  setByRiderId: string;
  setByName: string;
  updatedAt: number;
}

export function writeDestination(
  roomId: string,
  dest: Destination
): Promise<void> {
  const destRef = dbRef(db, `rooms/${roomId}/destination`);
  return set(destRef, dest);
}

export function removeDestination(roomId: string): Promise<void> {
  const destRef = dbRef(db, `rooms/${roomId}/destination`);
  return remove(destRef);
}

export function subscribeDestination(
  roomId: string,
  onData: (dest: Destination | null) => void
): () => void {
  const destRef = dbRef(db, `rooms/${roomId}/destination`);
  const handler = (snapshot: { val: () => unknown }) => {
    onData((snapshot.val() as Destination) ?? null);
  };
  onValue(destRef, handler);
  return () => off(destRef, "value", handler);
}

/* subscribes to all riders in the room; calls onData whenever the
   list changes (including the initial snapshot).  Returns an
   unsubscribe function. */
/* ------------------------------------------------------------------ */
/*  Chat messages                                                      */
/*    rooms/{roomId}/messages/{pushId}/                                */
/*      riderId: string                                                */
/*      riderName: string                                              */
/*      text: string                                                   */
/*      timestamp: number                                              */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  riderId: string;
  riderName: string;
  text: string;
  timestamp: number;
}

export function writeMessage(
  roomId: string,
  msg: Omit<ChatMessage, "timestamp">
): void {
  const msgsRef = dbRef(db, `rooms/${roomId}/messages`);
  push(msgsRef, { ...msg, timestamp: Date.now() });
}

/* subscribes to the latest 50 messages; calls onData with newest-first
   array whenever messages change. Returns unsubscribe function. */
export function subscribeMessages(
  roomId: string,
  onData: (messages: ChatMessage[]) => void
): () => void {
  const msgsRef = dbRef(db, `rooms/${roomId}/messages`);
  const msgsQuery = query(msgsRef, orderByChild("timestamp"), limitToLast(100));
  const handler = (snapshot: { val: () => unknown }) => {
    const raw = snapshot.val() as Record<string, ChatMessage> | null;
    if (!raw) { onData([]); return; }
    const list = Object.values(raw);
    list.sort((a, b) => a.timestamp - b.timestamp);
    onData(list);
  };
  onValue(msgsQuery, handler);
  return () => off(msgsQuery, "value", handler);
}

/* ------------------------------------------------------------------ */
/*  Music sharing                                                      */
/*    rooms/{roomId}/music/state/   (singleton "now playing")          */
/*      kind: "video" | "playlist"                                     */
/*      videoId?: string (YouTube video id, when kind = "video")       */
/*      listId?: string  (YouTube playlist id, when kind = "playlist") */
/*      title: string                                                  */
/*      isPlaying: boolean                                             */
/*      positionSec: number (playback position at updatedAt)           */
/*      updatedAt: number (epoch ms)                                   */
/*      controllerId/controllerName: rider driving sync                */
/*    rooms/{roomId}/music/queue/{pushId}/                             */
/*      id: string (pushId)                                            */
/*      kind: "video" | "playlist"                                     */
/*      videoId?/listId?: string                                       */
/*      title: string                                                  */
/*      addedBy/addedByName: string                                    */
/*      timestamp: number (epoch ms)                                   */
/* ------------------------------------------------------------------ */

export type MusicKind = "video" | "playlist";

/* Firebase RTDB rejects `undefined` values; drop any optional keys
   (e.g. listId on a video, videoId on a playlist) before writing. */
function stripUndefined<T extends object>(obj: T): T {
  const clean = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(clean)) {
    if (clean[key] === undefined) delete clean[key];
  }
  return clean as T;
}

export interface MusicState {
  kind: MusicKind;
  videoId?: string;
  listId?: string;
  title: string;
  isPlaying: boolean;
  positionSec: number;
  updatedAt: number;
  controllerId: string;
  controllerName: string;
}

export interface MusicQueueItem {
  id: string;
  kind: MusicKind;
  videoId?: string;
  listId?: string;
  title: string;
  addedBy: string;
  addedByName: string;
  timestamp: number;
}

export function writeMusicState(
  roomId: string,
  state: MusicState
): Promise<void> {
  const stateRef = dbRef(db, `rooms/${roomId}/music/state`);
  return set(stateRef, stripUndefined(state));
}

export function removeMusicState(roomId: string): Promise<void> {
  const stateRef = dbRef(db, `rooms/${roomId}/music/state`);
  return remove(stateRef);
}

export function subscribeMusicState(
  roomId: string,
  onData: (state: MusicState | null) => void
): () => void {
  const stateRef = dbRef(db, `rooms/${roomId}/music/state`);
  const handler = (snapshot: { val: () => unknown }) => {
    onData((snapshot.val() as MusicState) ?? null);
  };
  onValue(stateRef, handler);
  return () => off(stateRef, "value", handler);
}

export function pushMusicQueue(
  roomId: string,
  item: Omit<MusicQueueItem, "id" | "timestamp">
): Promise<void> {
  const queueRef = dbRef(db, `rooms/${roomId}/music/queue`);
  const itemRef = push(queueRef);
  /* store the generated key inside the value so readers get the id */
  return set(itemRef, {
    ...stripUndefined(item),
    id: itemRef.key,
    timestamp: Date.now(),
  });
}

export function removeMusicQueueItem(roomId: string, id: string): void {
  const itemRef = dbRef(db, `rooms/${roomId}/music/queue/${id}`);
  remove(itemRef);
}

/* subscribes to the queue ordered oldest-first (next to play is first).
   Returns unsubscribe function. */
export function subscribeMusicQueue(
  roomId: string,
  onData: (items: MusicQueueItem[]) => void
): () => void {
  const queueRef = dbRef(db, `rooms/${roomId}/music/queue`);
  const queueQuery = query(queueRef, orderByChild("timestamp"));
  const handler = (snapshot: { val: () => unknown }) => {
    const raw = snapshot.val() as Record<string, MusicQueueItem> | null;
    if (!raw) { onData([]); return; }
    const list = Object.values(raw);
    list.sort((a, b) => a.timestamp - b.timestamp);
    onData(list);
  };
  onValue(queueQuery, handler);
  return () => off(queueRef, "value", handler);
}

export function subscribeRiders(
  roomId: string,
  onData: (riders: Record<string, RiderData>) => void
): () => void {
  const ridersRef = dbRef(db, `rooms/${roomId}/riders`);
  const handler = (snapshot: { val: () => unknown }) => {
    onData((snapshot.val() as Record<string, RiderData>) ?? {});
  };
  onValue(ridersRef, handler);
  return () => off(ridersRef, "value", handler);
}
