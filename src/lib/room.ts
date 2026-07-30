import {
  ref,
  set,
  remove,
  get,
  onValue,
  off,
  onDisconnect,
} from "firebase/database";
import { db } from "./firebase";

export function createRoom(roomId: string): Promise<void> {
  const roomRef = ref(db, `rooms/${roomId}`);
  return set(roomRef, { createdAt: Date.now() });
}

export async function roomExists(roomId: string): Promise<boolean> {
  const snap = await get(ref(db, `rooms/${roomId}/createdAt`));
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
  photoURL?: string;
  lastSeen: number;
  location?: RiderLocation;
}

/* writes the rider's presence and sets onDisconnect() so the node is
   auto-removed when the tab closes or network drops */
export function writePresence(
  roomId: string,
  riderId: string,
  data: { peerId: string; name: string; photoURL?: string }
): void {
  const riderRef = ref(db, `rooms/${roomId}/riders/${riderId}`);
  set(riderRef, { ...data, lastSeen: Date.now() });
  onDisconnect(riderRef).remove();
}

/* explicit removal (used during intentional leave) */
export function removePresence(roomId: string, riderId: string): void {
  const riderRef = ref(db, `rooms/${roomId}/riders/${riderId}`);
  remove(riderRef);
}

export function writeLocation(
  roomId: string,
  riderId: string,
  coords: { lat: number; lng: number; heading: number | null }
): void {
  const locRef = ref(db, `rooms/${roomId}/riders/${riderId}/location`);
  set(locRef, { ...coords, updatedAt: Date.now() });
}

export function removeLocation(roomId: string, riderId: string): void {
  const locRef = ref(db, `rooms/${roomId}/riders/${riderId}/location`);
  remove(locRef);
}

/* subscribes to all riders in the room; calls onData whenever the
   list changes (including the initial snapshot).  Returns an
   unsubscribe function. */
export function subscribeRiders(
  roomId: string,
  onData: (riders: Record<string, RiderData>) => void
): () => void {
  const ridersRef = ref(db, `rooms/${roomId}/riders`);
  const handler = (snapshot: { val: () => unknown }) => {
    onData((snapshot.val() as Record<string, RiderData>) ?? {});
  };
  onValue(ridersRef, handler);
  return () => off(ridersRef, "value", handler);
}
