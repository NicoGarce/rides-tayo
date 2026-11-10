"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  subscribeMusicState,
  subscribeMusicQueue,
  writeMusicState,
  removeMusicState,
  pushMusicQueue,
  removeMusicQueueItem,
} from "@/lib/room";
import type { MusicState, MusicQueueItem, MusicKind } from "@/lib/room";

/* ------------------------------------------------------------------ */
/*  Shared music player                                                */
/*                                                                     */
/*  Every rider runs the same YouTube IFrame player (kept mounted &    */
/*  hidden even when the panel is closed, so playback never stops).    */
/*  One rider is the "controller": their player's position is          */
/*  heartbeat-published to RTDB every few seconds, and everyone else   */
/*  seeks to (positionSec + elapsed since updatedAt) to stay in sync.  */
/* ------------------------------------------------------------------ */

interface Props {
  roomId: string;
  riderId: string;
  riderName: string;
  open: boolean;
  onClose: () => void;
  /* true while someone is talking on the intercom — ducks the music */
  duck?: boolean;
}

/* fraction of the user's volume to duck to while someone speaks */
const DUCK_FACTOR = 0.25;

/* minimal typing for the YouTube IFrame API */
interface YTPlayer {
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  loadPlaylist(opts: { list: string; listType: string; index?: number }): void;
  cuePlaylist(opts: { list: string; listType: string; index?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  getVideoData(): { video_id?: string; title?: string };
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(volume: number): void;
  getVolume(): number;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: Record<string, unknown>
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const RESYNC_THRESHOLD_SEC = 3;
const HEARTBEAT_MS = 5000;
const CONTROLLER_STALE_MS = 12000;

/* load the IFrame API script once; resolves with the YT namespace */
function loadYTApi(): Promise<NonNullable<Window["YT"]>> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    if (!document.getElementById("yt-iframe-api")) {
      const script = document.createElement("script");
      script.id = "yt-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });
}

/* extract a YouTube video id or playlist id from a pasted link */
export function parseYouTubeUrl(
  input: string
): { kind: MusicKind; videoId?: string; listId?: string } | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (
    host !== "youtube.com" &&
    host !== "youtu.be" &&
    host !== "youtube-nocookie.com" &&
    host !== "music.youtube.com"
  ) {
    return null;
  }

  const listId = url.searchParams.get("list");
  let videoId: string | null = null;

  if (host === "youtu.be") {
    videoId = url.pathname.slice(1).split("/")[0] || null;
  } else if (url.pathname === "/watch") {
    videoId = url.searchParams.get("v");
  } else if (url.pathname.startsWith("/shorts/")) {
    videoId = url.pathname.split("/")[2] || null;
  } else if (url.pathname.startsWith("/embed/")) {
    videoId = url.pathname.split("/")[2] || null;
  }

  /* a playlist link wins over a bare video (watch?v=…&list=…) */
  if (listId) return { kind: "playlist", listId };
  if (videoId && /^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
    return { kind: "video", videoId };
  }
  return null;
}

/* fetch a human-readable title via YouTube's oEmbed endpoint */
async function fetchTitle(item: { kind: MusicKind; videoId?: string; listId?: string }) {
  const watchUrl =
    item.kind === "video"
      ? `https://www.youtube.com/watch?v=${item.videoId}`
      : `https://www.youtube.com/playlist?list=${item.listId}`;
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
    { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined }
  );
  if (!res.ok) throw new Error("oembed failed");
  const data = (await res.json()) as { title?: string };
  if (!data.title) throw new Error("no title");
  return data.title;
}

function formatTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function MusicPanel({
  roomId,
  riderId,
  riderName,
  open,
  onClose,
  duck = false,
}: Props) {
  const [musicState, setMusicState] = useState<MusicState | null>(null);
  const [queue, setQueue] = useState<MusicQueueItem[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [localMuted, setLocalMuted] = useState(false);
  const [clockSec, setClockSec] = useState(0);
  /* per-user local volume (0–100), persisted per rider on this device */
  const [volume, setVolumeState] = useState<number>(() => {
    if (typeof window === "undefined") return 70;
    try {
      const raw = window.localStorage.getItem(`roam_music_volume_${riderId}`);
      const parsed = raw != null ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 70;
    } catch {
      return 70;
    }
  });

  const playerRef = useRef<YTPlayer | null>(null);
  const playerStateRef = useRef<number>(-1);
  const lastPubRef = useRef<number | null>(null); /* updatedAt of our own writes */
  const pendingSeekRef = useRef<number | null>(null);

  /* keep latest state/queue reachable from player event handlers */
  const stateRef = useRef<MusicState | null>(null);
  const queueRef = useRef<MusicQueueItem[]>([]);
  stateRef.current = musicState;
  queueRef.current = queue;

  const isController =
    !!musicState && musicState.controllerId === riderId;
  const controllerRef = useRef(isController);
  controllerRef.current = isController;

  useEffect(() => subscribeMusicState(roomId, setMusicState), [roomId]);
  useEffect(() => subscribeMusicQueue(roomId, setQueue), [roomId]);

  /* ---------------- publishing ---------------- */

  const publish = useCallback(
    (partial: Partial<MusicState>) => {
      const prev = stateRef.current;
      if (!prev) return;
      const next: MusicState = {
        ...prev,
        ...partial,
        controllerId: riderId,
        controllerName: riderName,
        updatedAt: Date.now(),
      };
      lastPubRef.current = next.updatedAt;
      writeMusicState(roomId, next);
    },
    [roomId, riderId, riderName]
  );

  /* pop the first queued item into "now playing" (controller only) */
  const advance = useCallback(() => {
    const next = queueRef.current[0];
    if (next) {
      if (next.id) removeMusicQueueItem(roomId, next.id);
      lastPubRef.current = Date.now();
      writeMusicState(roomId, {
        kind: next.kind,
        videoId: next.videoId,
        listId: next.listId,
        title: next.title,
        isPlaying: true,
        positionSec: 0,
        updatedAt: lastPubRef.current,
        controllerId: riderId,
        controllerName: riderName,
      });
    } else {
      lastPubRef.current = null;
      removeMusicState(roomId);
    }
  }, [roomId, riderId, riderName]);

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  /* ---------------- YouTube player ---------------- */

  useEffect(() => {
    let destroyed = false;
    let player: YTPlayer | null = null;

    loadYTApi()
      .then((YT) => {
        if (destroyed) return;
        const mount = document.getElementById("music-yt-mount");
        if (!mount) return;
        player = new YT.Player(mount, {
          width: "200",
          height: "112",
          playerVars: {
            playsinline: 1,
            controls: 0,
            disablekb: 1,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
          },
          events: {
            onReady: () => {
              playerRef.current = player;
              setPlayerReady(true);
              if (player) playerStateRef.current = player.getPlayerState();
            },
            onStateChange: (event: { data: number }) => {
              playerStateRef.current = event.data;
              /* YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering */
              if (event.data === 0 && controllerRef.current) {
                advanceRef.current();
              }
              /* controller just pressed play inside the player: re-publish */
              if (event.data === 1 && controllerRef.current) {
                const p = playerRef.current;
                if (p && stateRef.current) {
                  publish({ isPlaying: true, positionSec: p.getCurrentTime() });
                }
              }
              /* apply a seek queued up while the video was loading */
              if (event.data === 1 && pendingSeekRef.current != null) {
                playerRef.current?.seekTo(pendingSeekRef.current, true);
                pendingSeekRef.current = null;
              }
            },
          },
        });
      })
      .catch(() => {
        /* script failed to load; panel still shows queue management */
      });

    return () => {
      destroyed = true;
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* keep the local player in sync with the shared state.
     Echoes of our own writes still enforce play/pause and video loads
     (buttons act optimistically, so this is a no-op then) — they only
     skip the redundant position seek. */
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !playerReady) return;

    const s = musicState;
    const isEcho =
      lastPubRef.current != null && s?.updatedAt === lastPubRef.current;

    if (!s || (!s.videoId && !s.listId)) {
      if (!isEcho) p.stopVideo();
      return;
    }

    const elapsed = s.isPlaying ? (Date.now() - s.updatedAt) / 1000 : 0;
    const target = (s.positionSec ?? 0) + elapsed;

    const data = p.getVideoData() ?? {};
    const currentId = data.video_id;
    if (s.kind === "video" && s.videoId && currentId !== s.videoId) {
      pendingSeekRef.current = target;
      if (s.isPlaying) p.loadVideoById(s.videoId);
      else p.cueVideoById(s.videoId);
      return;
    }
    if (s.kind === "playlist" && s.listId) {
      /* best-effort: reload playlist if the player has nothing loaded */
      if (!currentId) {
        pendingSeekRef.current = target;
        if (s.isPlaying) p.loadPlaylist({ list: s.listId, listType: "playlist" });
        else p.cuePlaylist({ list: s.listId, listType: "playlist" });
        return;
      }
    }

    /* match play/pause to the shared state (checks the live player
       state so optimistic local actions aren't fought back) */
    const playerState = p.getPlayerState();
    if (s.isPlaying) {
      if (playerState !== 1 && playerState !== 3) p.playVideo();
    } else {
      if (playerState === 1 || playerState === 3) p.pauseVideo();
    }

    if (isEcho) return; /* position came from our own player */

    const cur = p.getCurrentTime() ?? 0;
    if (Number.isFinite(cur) && Math.abs(cur - target) > RESYNC_THRESHOLD_SEC) {
      p.seekTo(target, true);
    }
  }, [musicState, playerReady]);

  /* controller heartbeat: publish our position every few seconds */
  useEffect(() => {
    if (!isController || !musicState?.isPlaying || !playerReady) return;
    const iv = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const pos = p.getCurrentTime() ?? musicState.positionSec;
      if (Number.isFinite(pos)) publish({ positionSec: pos });
    }, HEARTBEAT_MS);
    return () => clearInterval(iv);
  }, [isController, musicState, playerReady, publish]);

  /* controller takeover: if the controller vanished mid-play, the first
     (alphabetically smallest) rider id claims it */
  useEffect(() => {
    if (
      musicState?.isPlaying &&
      musicState.controllerId !== riderId &&
      Date.now() - musicState.updatedAt > CONTROLLER_STALE_MS &&
      riderId < musicState.controllerId
    ) {
      publish({ positionSec: musicState.positionSec });
    }
  }, [musicState, riderId, publish]);

  /* local clock for the progress readout */
  useEffect(() => {
    if (!open) return;
    const iv = setInterval(() => {
      const s = musicState;
      const p = playerRef.current;
      if (!s) { setClockSec(0); return; }
      if (isController && p) setClockSec(p.getCurrentTime() ?? 0);
      else {
        const elapsed = s.isPlaying ? (Date.now() - s.updatedAt) / 1000 : 0;
        setClockSec((s.positionSec ?? 0) + elapsed);
      }
    }, 500);
    return () => clearInterval(iv);
  }, [open, musicState, isController]);

  /* ---------------- actions ---------------- */

  async function handleAdd() {
    const parsed = parseYouTubeUrl(input);
    if (!parsed) {
      setError("That doesn't look like a YouTube link");
      return;
    }
    setError(null);
    setAdding(true);
    /* title lookup is best-effort; oEmbed doesn't cover mix playlists
       (RD…) or some other items, so fall back to a readable label */
    let title =
      parsed.kind === "video"
        ? `YouTube video ${parsed.videoId}`
        : /^RD/.test(parsed.listId ?? "")
          ? "YouTube mix"
          : `YouTube playlist ${parsed.listId}`;
    try {
      title = await fetchTitle(parsed);
    } catch {
      /* keep fallback title */
    }
    const base = {
      kind: parsed.kind,
      videoId: parsed.videoId,
      listId: parsed.listId,
      title,
      addedBy: riderId,
      addedByName: riderName,
    };
    try {
      if (!musicState || (!musicState.videoId && !musicState.listId)) {
        /* nothing playing — start it immediately */
        const now = Date.now();
        lastPubRef.current = now;
        await writeMusicState(roomId, {
          ...base,
          isPlaying: true,
          positionSec: 0,
          updatedAt: now,
          controllerId: riderId,
          controllerName: riderName,
        });
      } else {
        await pushMusicQueue(roomId, base);
      }
      setInput("");
    } catch (err) {
      console.error("Music write failed:", err);
      lastPubRef.current = null;
      setError("Couldn't save to the room — check your connection and try again");
    } finally {
      setAdding(false);
    }
  }

  function handlePlayPause() {
    const p = playerRef.current;
    if (!musicState) return;
    if (musicState.isPlaying) {
      /* pause locally first — the sync effect skips echoes of our own
         writes, so the player must act on the tap itself */
      p?.pauseVideo();
      publish({
        isPlaying: false,
        positionSec: p?.getCurrentTime?.() ?? musicState.positionSec,
      });
    } else {
      p?.playVideo();
      publish({ isPlaying: true });
    }
  }

  function handleSkip() {
    if (!musicState) return;
    advance();
  }

  function handleStop() {
    if (!musicState) return;
    lastPubRef.current = null;
    removeMusicState(roomId);
  }

  /* apply the rider's local volume to the player, ramping smoothly and
     ducking to DUCK_FACTOR of the set level while someone is talking */
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !playerReady) return;
    const target = localMuted
      ? 0
      : Math.round(volume * (duck ? DUCK_FACTOR : 1));

    let timer: number;
    const step = () => {
      const cur = p.getVolume?.() ?? 0;
      const diff = target - cur;
      if (Math.abs(diff) <= 5) {
        try {
          p.setVolume(target);
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        p.setVolume(Math.round(cur + Math.sign(diff) * 7));
      } catch {
        /* ignore */
      }
      timer = window.setTimeout(step, 70);
    };
    step();
    return () => clearTimeout(timer);
  }, [volume, duck, localMuted, playerReady]);

  function setVolume(v: number) {
    const clamped = Math.min(100, Math.max(0, Math.round(v)));
    setVolumeState(clamped);
    try {
      window.localStorage.setItem(`roam_music_volume_${riderId}`, String(clamped));
    } catch {
      /* storage unavailable */
    }
    /* dragging the volume up from mute is a natural unmute gesture */
    if (clamped > 0 && localMuted) {
      playerRef.current?.unMute();
      setLocalMuted(false);
    }
  }

  function handleToggleMute() {
    const p = playerRef.current;
    if (!p) return;
    if (localMuted) {
      p.unMute();
      setLocalMuted(false);
    } else {
      p.mute();
      setLocalMuted(true);
    }
  }

  /* the controller's player is paused while the room expects playback
     (autoplay blocked by the browser) — offer a one-tap nudge */
  const needsJoinTap =
    playerReady &&
    !!musicState?.isPlaying &&
    (playerStateRef.current === -1 || playerStateRef.current === 2);

  const isPlaylistTrack = musicState?.kind === "playlist";

  return (
    <>
      {/* permanent hidden player mount — lives outside the overlay so
          playback continues when the panel is closed */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: -9999,
          bottom: 0,
          width: 200,
          height: 112,
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        <div id="music-yt-mount" />
      </div>

      {open && (
        <div className="absolute inset-0 z-30 flex flex-col bg-[var(--background)]">
          {/* header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <span className="text-sm font-semibold">Music</span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] active:bg-[var(--surface)] transition-colors"
              aria-label="Close music"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* now playing */}
          <div className="px-4 py-4 border-b border-[var(--border)]">
            {musicState ? (
              <div className="flex gap-3 items-center">
                <div className="w-12 h-12 rounded-lg shrink-0 bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center">
                  {isPlaylistTrack ? (
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-[var(--muted)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="15" y2="18" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-[var(--muted)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{musicState.title}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5 truncate">
                    {isPlaylistTrack ? "Playlist · " : ""}
                    {formatTime(clockSec)}
                    {" · "}
                    {musicState.isPlaying ? "Playing" : "Paused"}
                    {isController ? " · you control" : ` · ${musicState.controllerName} controls`}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)] text-center py-2">
                Nothing playing — add a YouTube link below
              </p>
            )}

            {needsJoinTap && (
              <button
                onClick={() => playerRef.current?.playVideo()}
                className="w-full mt-3 py-2 rounded-lg text-xs font-medium bg-yellow-900/40 border border-yellow-700 text-yellow-200 active:opacity-80 transition-opacity"
              >
                Tap to join playback (browser blocked autoplay)
              </button>
            )}

            {/* controls */}
            <div className="flex items-center justify-center gap-3 mt-3">
              <button
                onClick={handleToggleMute}
                disabled={!musicState || !playerReady}
                className="w-11 h-11 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center disabled:opacity-40 active:bg-[var(--border)] transition-colors"
                aria-label={localMuted ? "Unmute for me" : "Mute for me"}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  {localMuted ? (
                    <>
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </>
                  ) : (
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  )}
                </svg>
              </button>
              <button
                onClick={handlePlayPause}
                disabled={!musicState || !playerReady}
                className="w-14 h-14 rounded-full bg-[var(--accent)] text-[var(--background)] flex items-center justify-center disabled:opacity-40 active:opacity-80 transition-opacity"
                aria-label={musicState?.isPlaying ? "Pause" : "Play"}
              >
                {musicState?.isPlaying ? (
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                    <polygon points="6 3 21 12 6 21" />
                  </svg>
                )}
              </button>
              <button
                onClick={handleSkip}
                disabled={!musicState || !playerReady}
                className="w-11 h-11 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center disabled:opacity-40 active:bg-[var(--border)] transition-colors"
                aria-label="Skip to next"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
                  <line x1="19" y1="5" x2="19" y2="19" />
                </svg>
              </button>
            </div>
            {/* per-user volume */}
            <div className="flex items-center gap-2 mt-3 px-1" title="Volume only affects your device; auto-ducked while someone talks">
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-[var(--muted)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                {volume > 0 && !localMuted ? (
                  <>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    {volume > 60 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
                  </>
                ) : (
                  <>
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </>
                )}
              </svg>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={volume}
                onChange={(e) => setVolume(Number(e.currentTarget.value))}
                className="flex-1 accent-[var(--accent)]"
                aria-label="Music volume (only affects your device)"
              />
              <span className="text-[11px] text-[var(--muted)] w-9 text-right shrink-0">
                {volume}%
              </span>
            </div>
            {duck && musicState?.isPlaying && !localMuted && (
              <p className="text-[11px] text-[var(--muted)] text-center mt-1">
                Ducking while someone talks…
              </p>
            )}

            {musicState && (
              <button
                onClick={handleStop}
                className="w-full mt-3 py-1.5 rounded-lg text-xs text-[var(--muted)] border border-[var(--border)] active:bg-[var(--border)] transition-colors"
              >
                Stop music
              </button>
            )}
          </div>

          {/* add link */}
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="Paste a YouTube video or playlist link…"
                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
              />
              <button
                onClick={handleAdd}
                disabled={adding || !input.trim()}
                className="shrink-0 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--background)] text-sm font-semibold disabled:opacity-40 active:opacity-80 transition-opacity"
              >
                {adding ? "…" : "Add"}
              </button>
            </div>
            {error && <p className="text-xs text-red-400 mt-1.5 px-1">{error}</p>}
          </div>

          {/* queue */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)] px-1 pb-2">
              Up next ({queue.length})
            </p>
            {queue.length === 0 ? (
              <p className="text-sm text-[var(--muted)] text-center pt-4">
                Queue is empty
              </p>
            ) : (
              <div className="space-y-1.5">
                {queue.map((item, i) => (
                  <div
                    key={item.id ?? `${item.videoId ?? item.listId ?? "item"}-${i}`}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]"
                  >
                    <span className="w-5 text-xs text-[var(--muted)] shrink-0 text-center">
                      {i + 1}
                    </span>
                    <span
                      className="w-5 h-5 shrink-0 flex items-center justify-center text-[var(--muted)]"
                      title={item.kind === "video" ? "Video" : "Playlist"}
                    >
                      {item.kind === "video" ? (
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                          <rect x="2" y="5" width="14" height="14" rx="2" />
                          <polygon points="16 10 22 7 22 17 16 14" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="3" y1="6" x2="21" y2="6" />
                          <line x1="3" y1="12" x2="21" y2="12" />
                          <line x1="3" y1="18" x2="15" y2="18" />
                        </svg>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.title}</p>
                      <p className="text-[11px] text-[var(--muted)] truncate">
                        {item.kind === "video" ? "Video" : "Playlist"} · added by {item.addedByName}
                      </p>
                    </div>
                    <button
                      onClick={() => item.id && removeMusicQueueItem(roomId, item.id)}
                      className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-red-400 active:bg-[var(--border)] transition-colors"
                      aria-label="Remove from queue"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
