"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Peer, { MediaConnection } from "peerjs";
import {
  writePresence,
  removePresence,
  writeLocation,
  removeLocation,
  subscribeRiders,
} from "@/lib/room";
import type { RiderData } from "@/lib/room";
import { useWakeLock } from "@/hooks/useWakeLock";

/* ------------------------------------------------------------------ */
/*  Why no Bluetooth-specific code is needed here                      */
/* ------------------------------------------------------------------ */
/*  A Bluetooth headset or intercom is a standard audio device at the  */
/*  OS level.  getUserMedia({ audio: true }) captures from the OS's    */
/*  "Default" recording device, which routes to the intercom once it   */
/*  is paired and connected.  <audio autoplay> plays back through the  */
/*  OS's "Default" playback device, which is also the intercom after   */
/*  pairing.  The OS handles the Bluetooth transport transparently, so */
/*  no Web Bluetooth API or vendor-specific intercom code is needed.   */
/* ------------------------------------------------------------------ */

interface UsePeerConnectionOptions {
  roomId: string;
  riderName?: string;
}

export interface RemotePeer {
  peerId: string;
  stream: MediaStream;
}

export type CallStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface RiderInfo {
  riderId: string;
  peerId: string;
  name: string;
  lastSeen: number;
  location?: RiderData["location"];
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateRiderId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function usePeerConnection({
  roomId,
  riderName = "Rider",
}: UsePeerConnectionOptions) {
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [callStatus, setCallStatus] = useState<CallStatus>("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [riders, setRiders] = useState<RiderInfo[]>([]);
  const [micDenied, setMicDenied] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const connectionsRef = useRef<Map<string, MediaConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const isDestroyedRef = useRef(false);
  const riderIdRef = useRef(generateRiderId());
  const initialSetupDoneRef = useRef(false);

  const riderId = riderIdRef.current;
  const peerId = `${roomId}-${riderId}`;

  /* keep the screen awake while the ride is "connected" or "reconnecting" */
  const rideActive = callStatus === "connected" || callStatus === "reconnecting";
  useWakeLock(rideActive);

  /* hydrate remotePeers state from the ref Map */
  const syncRemotePeers = useCallback(() => {
    const entries: RemotePeer[] = [];
    remoteStreamsRef.current.forEach((stream, id) => {
      entries.push({ peerId: id, stream });
    });
    setRemotePeers(entries);
  }, []);

  /* answer an incoming call */
  const answerCall = useCallback(
    (incoming: MediaConnection) => {
      const stream = localStreamRef.current;
      if (!stream) return;

      incoming.answer(stream);
      connectionsRef.current.set(incoming.peer, incoming);

      incoming.on("stream", (remoteStream: MediaStream) => {
        remoteStreamsRef.current.set(incoming.peer, remoteStream);
        syncRemotePeers();
      });

      incoming.on("close", () => {
        connectionsRef.current.delete(incoming.peer);
        remoteStreamsRef.current.delete(incoming.peer);
        syncRemotePeers();
      });

      incoming.on("error", (err) => {
        console.error("[peer] incoming error", err);
        connectionsRef.current.delete(incoming.peer);
        remoteStreamsRef.current.delete(incoming.peer);
        syncRemotePeers();
      });
    },
    [syncRemotePeers]
  );

  /* initiate a call to a known peer */
  const callPeer = useCallback(
    (targetPeerId: string) => {
      const peer = peerRef.current;
      const stream = localStreamRef.current;
      if (!peer || !stream || targetPeerId === peerId) return;
      if (connectionsRef.current.has(targetPeerId)) return;

      const call = peer.call(targetPeerId, stream);
      connectionsRef.current.set(targetPeerId, call);

      call.on("stream", (remoteStream: MediaStream) => {
        remoteStreamsRef.current.set(targetPeerId, remoteStream);
        syncRemotePeers();
      });

      call.on("close", () => {
        connectionsRef.current.delete(targetPeerId);
        remoteStreamsRef.current.delete(targetPeerId);
        syncRemotePeers();
      });

      call.on("error", (err) => {
        console.error("[peer] call error with", targetPeerId, err);
        connectionsRef.current.delete(targetPeerId);
        remoteStreamsRef.current.delete(targetPeerId);
        syncRemotePeers();
      });
    },
    [peerId, syncRemotePeers]
  );

  /* ---- main effect: acquire mic, create Peer, join mesh ---- */
  useEffect(() => {
    let cancelled = false;
    let unsubscribeRiders: (() => void) | null = null;
    let watchPositionId: number | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    isDestroyedRef.current = false;
    initialSetupDoneRef.current = false;

    async function init() {
      /* --- mic access --- */
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        console.warn("[peer] mic access denied — running without audio");
        setMicDenied(true);
        stream = new MediaStream();
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;

      /* --- PeerJS with public cloud broker --- */
      const peer = new Peer(peerId, {
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      });
      peerRef.current = peer;

      peer.on("open", () => {
        if (cancelled) return;

        /* if this is a reconnection, just refresh presence */
        if (initialSetupDoneRef.current) {
          try {
            writePresence(roomId, riderId, { peerId, name: riderName });
          } catch {
            /* ignore */
          }
          setCallStatus("connected");
          return;
        }

        initialSetupDoneRef.current = true;

        /* --- Firebase: write presence --- */
        try {
          writePresence(roomId, riderId, { peerId, name: riderName });
        } catch (e) {
          console.warn("[firebase] writePresence failed", e);
        }

        /* --- geolocation watcher (accurate + throttled) --- */
        const LAST_WRITE_MS = 2000;
        const MOVE_THRESHOLD_M = 15;
        let lastWrite = 0;
        let lastLat = 0;
        let lastLng = 0;
        try {
          watchPositionId = navigator.geolocation.watchPosition(
            (pos) => {
              if (cancelled) return;
              const { latitude: lat, longitude: lng, heading } = pos.coords;
              const now = Date.now();

              /* throttle: skip if too soon AND less than threshold move */
              const dt = now - lastWrite;
              const moved =
                haversine(lastLat, lastLng, lat, lng) > MOVE_THRESHOLD_M;
              if (dt < LAST_WRITE_MS && !moved) return;

              lastWrite = now;
              lastLat = lat;
              lastLng = lng;

              try {
                writeLocation(roomId, riderId, { lat, lng, heading });
              } catch (e) {
                console.warn("[firebase] writeLocation failed", e);
              }
            },
            (err) => {
              console.warn("[location]", err.message);
              setLocationDenied(true);
            },
            {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0,
            }
          );
        } catch {
          setLocationDenied(true);
        }

        /* --- Firebase: subscribe to all riders --- */
        try {
          unsubscribeRiders = subscribeRiders(roomId, (data) => {
            if (cancelled) return;

            const list: RiderInfo[] = [];
            for (const [id, r] of Object.entries(data)) {
              list.push({ riderId: id, ...r });
            }
            setRiders(list);

            for (const rider of list) {
              if (rider.riderId === riderId) continue;
              if (rider.peerId) callPeer(rider.peerId);
            }

            const activePeerIds = new Set(
              list.map((r) => r.peerId).filter(Boolean)
            );
            connectionsRef.current.forEach((_conn, pid) => {
              if (!activePeerIds.has(pid)) {
                _conn.close();
                connectionsRef.current.delete(pid);
                remoteStreamsRef.current.delete(pid);
                syncRemotePeers();
              }
            });
          });
        } catch (e) {
          console.warn("[firebase] subscribeRiders failed", e);
        }

        setCallStatus("connected");
      });

      peer.on("call", (incoming) => {
        answerCall(incoming);
      });

      peer.on("disconnected", () => {
        if (cancelled || isDestroyedRef.current) return;

        setCallStatus("reconnecting");

        /* attempt graceful reconnect */
        peer.reconnect();

        /* if reconnect doesn't succeed within 15s, destroy + recreate */
        reconnectTimer = setTimeout(() => {
          if (cancelled || isDestroyedRef.current) return;
          console.warn("[peer] reconnect timed out — recreating peer");
          peer.destroy();
          /* re-initialise by calling init() again */
          localStreamRef.current?.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
          peerRef.current = null;
          connectionsRef.current.forEach((c) => c.close());
          connectionsRef.current.clear();
          remoteStreamsRef.current.clear();
          initialSetupDoneRef.current = false;
          if (!cancelled) init();
        }, 15000);
      });

      peer.on("close", () => {
        if (!cancelled && !isDestroyedRef.current) {
          setCallStatus("disconnected");
        }
      });

      peer.on("error", (err) => {
        console.error("[peer] error", err);
      });
    }

    init();

    return () => {
      cancelled = true;
      isDestroyedRef.current = true;

      if (reconnectTimer !== null) clearTimeout(reconnectTimer);

      if (watchPositionId !== null) {
        navigator.geolocation.clearWatch(watchPositionId);
      }

      if (unsubscribeRiders) {
        unsubscribeRiders();
      }

      try {
        removeLocation(roomId, riderId);
      } catch {
        /* ignore */
      }
      try {
        removePresence(roomId, riderId);
      } catch {
        /* ignore */
      }

      /* eslint-disable react-hooks/exhaustive-deps */
      connectionsRef.current.forEach((conn) => conn.close());
      connectionsRef.current.clear();
      remoteStreamsRef.current.clear();
      /* eslint-enable react-hooks/exhaustive-deps */

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }

      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
    };
  }, [roomId, peerId, callPeer, answerCall, syncRemotePeers, riderName, riderId]);

  /* ---- mute / unmute ---- */
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, []);

  const riderCount = riders.length > 0 ? riders.length : remotePeers.length + 1;

  return {
    myRiderId: riderId,
    remotePeers,
    callStatus,
    isMuted,
    riderCount,
    riders,
    micDenied,
    locationDenied,
    toggleMute,
  };
}
