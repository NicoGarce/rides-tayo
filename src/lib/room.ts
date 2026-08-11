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
