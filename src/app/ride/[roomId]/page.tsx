"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { QRCodeSVG } from "qrcode.react";
import ChatPanel from "@/components/ChatPanel";
import { usePeerConnection } from "@/hooks/usePeerConnection";
import { useAuth } from "@/hooks/useAuth";
import type { AppUser } from "@/hooks/useAuth";
import { subscribeDestination, removeDestination } from "@/lib/room";
import type { Destination } from "@/lib/room";

const RideMap = dynamic(() => import("@/components/RideMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full rounded-xl bg-[var(--surface)] animate-pulse flex items-center justify-center text-sm text-[var(--muted)]">
      Loading map…
    </div>
  ),
});

const DestinationPicker = dynamic(
  () => import("@/components/DestinationPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 z-40 bg-[var(--background)] animate-pulse" />
    ),
  }
);

interface Props {
  params: { roomId: string };
}

function RiderTile({
  name,
  isSelf,
  muted,
  speaking,
  micLevel = 0,
}: {
  name: string;
  isSelf: boolean;
  muted: boolean;
  speaking: boolean;
  micLevel?: number;
}) {
  const safeName = name ?? "Rider";
  const initial = safeName.charAt(0).toUpperCase();

  const showLevel = isSelf && !muted && micLevel > 0.03;
  const borderBase = isSelf ? "#22c55e" : (muted ? "#6b7280" : "#3b82f6");
  const borderColor = speaking ? "#22d3ee" : borderBase;
  const glow = speaking ? "0 0 18px rgba(34, 211, 238, 0.6)" : "none";

  const ringR = 46;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - Math.min(micLevel, 1));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-center justify-center" style={{ width: 104, height: 104 }}>
        {/* circular progress ring for mic level */}
        <svg
          className="absolute inset-0 -rotate-90 pointer-events-none"
          width="104" height="104"
          viewBox="0 0 100 100"
          style={{ opacity: showLevel ? 1 : 0, transition: "opacity 0.08s" }}
        >
          {showLevel && (
            <circle
              cx="50" cy="50" r={ringR}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={ringC}
              strokeDashoffset={ringOffset}
              style={{ filter: "drop-shadow(0 0 4px rgba(34, 211, 238, 0.9))" }}
            />
          )}
        </svg>
        <div
          className="rounded-full shrink-0 w-[94px] h-[94px] flex items-center justify-center text-2xl font-bold text-white"
          style={{
            border: `3px solid ${borderColor}`,
            boxShadow: glow,
            background: "#1a1a2e",
          }}
        >
          {initial}
        </div>
        {/* muted overlay */}
        {muted && (
          <div className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-red-600 flex items-center justify-center shadow-md border-2 border-[var(--background)]">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          </div>
        )}
      </div>
      <span className="text-sm font-medium text-[var(--foreground)] truncate max-w-24 text-center">
        {safeName}{isSelf ? " (you)" : ""}
      </span>
    </div>
  );
}

export default function RidePage({ params }: Props) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [authLoading, user, router]);

  if (authLoading || !user) return null;

  return <RidePageContent roomId={params.roomId} user={user} />;
}

function RidePageContent({ roomId, user }: { roomId: string; user: AppUser }) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"tiles" | "map" | "list">("tiles");
  const [showShare, setShowShare] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);

  useEffect(() => {
    return subscribeDestination(roomId, setDestination);
  }, [roomId]);

  const riderName =
    typeof window !== "undefined"
      ? (() => { try { return sessionStorage.getItem("roam_name"); } catch { return null; } })() || user.displayName || "Rider"
      : "Rider";

  const {
    myRiderId,
    remotePeers,
    callStatus,
    isMuted,
    riderCount,
    riders,
    micDenied,
    locationDenied,
    micLevel,
    toggleMute,
    speakingPeerIds,
  } = usePeerConnection({
    roomId,
    riderId: user.uid,
    riderName,
  });

  const audioContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = audioContainerRef.current;
    if (!container) return;

    const existing = container.querySelectorAll("audio");
    const existingIds = new Set<string>();
    existing.forEach((el) => existingIds.add(el.dataset.peerId ?? ""));

    const currentIds = new Set(remotePeers.map((p) => p.peerId));

    existing.forEach((el) => {
      if (el.dataset.peerId && !currentIds.has(el.dataset.peerId)) {
        el.remove();
      }
    });

    for (const peer of remotePeers) {
      if (!existingIds.has(peer.peerId)) {
        const audio = document.createElement("audio");
        audio.srcObject = peer.stream;
        audio.autoplay = true;
        audio.setAttribute("playsinline", "");
        audio.dataset.peerId = peer.peerId;
        audio.style.display = "none";
        container.appendChild(audio);
      }
    }
  }, [remotePeers]);

  const ringR = 46;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - Math.min(micLevel, 1));

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/ride/${roomId}/join`
      : "";

  const destShortLabel = destination
    ? destination.label.split(",")[0]
    : "";
  const destDuration = destination?.durationS
    ? Math.max(1, Math.round(destination.durationS / 60))
    : null;
  const destDistance =
    destination?.distanceM != null
      ? destination.distanceM >= 1000
        ? `${(destination.distanceM / 1000).toFixed(1)} km`
        : `${Math.round(destination.distanceM)} m`
      : null;

  async function handleClearDestination() {
    try {
      await removeDestination(roomId);
    } catch {
      /* ignore */
    }
  }

  return (
    <main className="flex flex-col min-h-dvh bg-[var(--background)]">
      {/* header — tap anywhere to switch between tiles and map */}
      <button
        onClick={() => setViewMode(viewMode === "tiles" ? "map" : viewMode === "map" ? "tiles" : "map")}
        className="flex items-center justify-between w-full px-6 py-4 active:bg-[var(--surface)] transition-colors"
        aria-label={viewMode === "tiles" ? "Switch to map" : "Switch to tiles"}
      >
        <span className="text-sm text-[var(--muted)] font-mono">
          {roomId}
        </span>
        <span className="flex items-center gap-2">
          {/* current view indicator */}
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
            {viewMode === "tiles" ? "Tiles" : viewMode === "map" ? "Map" : "List"}
          </span>
          <span className="text-sm font-medium text-[var(--accent)]">
            {riderCount} rider{riderCount > 1 ? "s" : ""}
          </span>
        </span>
      </button>

      {/* reconnecting banner */}
      {callStatus === "reconnecting" && (
        <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-yellow-900/40 border border-yellow-700 text-sm text-yellow-200 animate-pulse">
          Connection lost — reconnecting…
        </div>
      )}

      {/* mic denied banner */}
      {micDenied && (
        <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-900/40 border border-red-700 text-sm text-red-200">
          Mic access denied. Other riders won&apos;t hear you.
        </div>
      )}

      {/* location denied banner */}
      {locationDenied && (
        <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-yellow-900/40 border border-yellow-700 text-sm text-yellow-200">
          Location access denied. Your position won&apos;t be shared.
        </div>
      )}

      {/* main content */}
      <div className="flex-1 flex flex-col min-h-0">
        {viewMode === "tiles" && (
          /* Google Meet-style rider tiles */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
            {riders.length === 0 && callStatus === "connecting" && (
              <div className="text-[var(--muted)] text-sm animate-pulse">Connecting…</div>
            )}
            {riders.length === 0 && callStatus === "connected" && (
              <div className="text-[var(--muted)] text-sm">No other riders yet</div>
            )}
            <div className="flex flex-wrap justify-center gap-8">
              {riders.map((rider) => (
                <RiderTile
                  key={rider.riderId}
                  name={rider.name}
                  isSelf={rider.riderId === myRiderId}
                  muted={rider.riderId === myRiderId ? isMuted : false}
                  speaking={speakingPeerIds.has(rider.peerId)}
                  micLevel={rider.riderId === myRiderId ? micLevel : 0}
                />
              ))}
            </div>
          </div>
        )}

        {viewMode === "map" && (
          /* map + rider list panel */
          <div className="flex-1 flex flex-col md:flex-row gap-4 px-4 pb-2 min-h-0">
            <div className="flex-1 relative min-h-[250px] md:min-h-0">
              <div className="absolute inset-0 rounded-xl overflow-hidden">
                <RideMap riders={riders} myRiderId={myRiderId} destination={destination} />
              </div>
              {destination ? (
                <div
                  className="absolute top-2 left-2 right-2 flex items-center gap-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 shadow-lg"
                  style={{ zIndex: 500 }}
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" style={{ color: "#f59e0b" }} fill="#f59e0b">
                    <path d="M12 2a10 10 0 0 0-4 19.2V22h8v-.8A10 10 0 0 0 12 2z" />
                    <path d="M8.5 7.5h7v5h-3l-1.2 2.4L10 12.5H8.5z" fill="#1a1a2e" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{destShortLabel}</p>
                    <p className="text-[11px] text-[var(--muted)]">
                      {destDuration ? `${destDuration} min away` : "Route planned"}
                      {destDistance ? ` · ${destDistance}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDestinationPicker(true)}
                    aria-label="Change destination"
                    className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] active:bg-[var(--border)] transition-colors"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                  </button>
                  <button
                    onClick={handleClearDestination}
                    aria-label="Clear destination"
                    className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-red-400 active:bg-[var(--border)] transition-colors"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDestinationPicker(true)}
                  className="absolute top-2 left-2 flex items-center gap-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--foreground)] shadow-lg active:bg-[var(--border)] transition-colors"
                  style={{ zIndex: 500 }}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" style={{ color: "#f59e0b" }} fill="#f59e0b">
                    <path d="M12 2a10 10 0 0 0-4 19.2V22h8v-.8A10 10 0 0 0 12 2z" />
                  </svg>
                  Pin a destination
                </button>
              )}
            </div>
            {riders.length > 0 && (
              <div className="w-full md:w-72 shrink-0 overflow-y-auto max-h-[160px] md:max-h-full space-y-1.5">
                <button
                  onClick={() => setViewMode("list")}
                  className="w-full text-left text-xs font-medium text-[var(--muted)] px-1 pb-1 hover:text-[var(--foreground)] transition-colors"
                >
                  Riders ({riders.length}) <span className="text-[10px] opacity-50">→ tap for full list</span>
                </button>
                {riders.map((rider) => (
                  <div
                    key={rider.riderId}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm ${
                      rider.riderId === myRiderId
                        ? "bg-[var(--accent)]/10"
                        : "bg-[var(--surface)]"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--background)] flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {rider.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`truncate ${rider.riderId === myRiderId ? "font-semibold" : ""}`}>
                          {rider.name}{rider.riderId === myRiderId ? " (you)" : ""}
                        </span>
                        {speakingPeerIds.has(rider.peerId) && (
                          <span className="w-2 h-2 rounded-full bg-[#22d3ee] shrink-0 animate-pulse" title="Speaking" />
                        )}
                      </div>
                      <div className="text-xs text-[var(--muted)] truncate">
                        {rider.location ? "Location shared" : "Location unavailable"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {viewMode === "list" && (
          /* full rider list view */
          <div className="flex-1 overflow-y-auto px-4 pb-2">
            <div className="max-w-lg mx-auto space-y-1.5 pt-2">
              <button
                onClick={() => setViewMode("map")}
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] px-1 pb-1 hover:text-[var(--foreground)] transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Map
                <span className="ml-auto">All riders ({riders.length})</span>
              </button>
              {riders.length === 0 && (
                <div className="text-sm text-[var(--muted)] text-center py-8">
                  {callStatus === "connecting" ? "Connecting…" : "No riders yet"}
                </div>
              )}
              {riders.map((rider) => (
                <div
                  key={rider.riderId}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    rider.riderId === myRiderId
                      ? "border-[var(--accent)]/30 bg-[var(--accent)]/10"
                      : "border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--background)] flex items-center justify-center text-sm font-bold text-white shrink-0">
                    {rider.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium truncate ${rider.riderId === myRiderId ? "text-[var(--accent)]" : ""}`}>
                        {rider.name}{rider.riderId === myRiderId ? " (you)" : ""}
                      </span>
                      {speakingPeerIds.has(rider.peerId) && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#22d3ee] shrink-0 animate-pulse" title="Speaking" />
                      )}
                    </div>
                    <div className="text-xs text-[var(--muted)] flex items-center gap-2 mt-0.5">
                      <span>{rider.location ? "📍 Location shared" : "📍 No location"}</span>
                      {rider.riderId !== myRiderId && <span>· {rider.peerId ? "Connected" : "Disconnected"}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* chat overlay */}
      {showChat && (
        <ChatPanel
          roomId={roomId}
          riderId={myRiderId}
          riderName={riderName}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* destination picker overlay */}
      {showDestinationPicker && (
        <DestinationPicker
          roomId={roomId}
          riderId={myRiderId}
          riderName={riderName}
          onClose={() => setShowDestinationPicker(false)}
        />
      )}

      {/* share panel overlay */}
      {showShare && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-xs p-5 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-4">
            <p className="text-sm font-medium text-center text-[var(--foreground)]">
              Share with other riders
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] outline-none"
                onClick={(e) => e.currentTarget.select()}
              />
              <button
                onClick={() => navigator.clipboard.writeText(shareUrl)}
                className="shrink-0 px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--background)] text-xs font-semibold active:opacity-80"
              >
                Copy
              </button>
            </div>
            <div className="flex justify-center">
              <QRCodeSVG value={shareUrl} size={140} bgColor="transparent" fgColor="#fafafa" />
            </div>
            <button
              onClick={() => setShowShare(false)}
              className="w-full py-2 rounded-lg text-sm font-medium text-[var(--muted)] border border-[var(--border)] active:bg-[var(--border)] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* bottom control bar */}
      <div className="flex items-center justify-center gap-3 sm:gap-5 px-3 sm:px-6 py-4 sm:py-5 border-t border-[var(--border)]">
        {/* view toggle: direct tiles ↔ map */}
        <button
          onClick={() => setViewMode(viewMode === "tiles" ? "map" : "tiles")}
          className={`touch-target w-12 sm:w-14 h-12 sm:h-14 rounded-xl sm:rounded-2xl transition-colors shrink-0 ${
            viewMode !== "tiles"
              ? "bg-[var(--accent)] text-[var(--background)]"
              : "bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)]"
          }`}
          aria-label={viewMode === "tiles" ? "Show map" : "Show tiles"}
        >
          {viewMode === "tiles" ? (
            <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22c-2-3-6-6-6-10a6 6 0 0 1 12 0c0 4-4 7-6 10z" />
              <circle cx="12" cy="10" r="2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          )}
        </button>

        {/* mute toggle */}
        <div className="relative flex items-center justify-center w-[68px] h-[68px] sm:w-[76px] sm:h-[76px] shrink-0">
          <svg
            className="absolute inset-0 -rotate-90 pointer-events-none"
            width="100%" height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid meet"
            style={{ opacity: !isMuted && micLevel > 0.03 ? 1 : 0, transition: "opacity 0.08s" }}
          >
            {!isMuted && micLevel > 0.03 && (
              <circle
                cx="50" cy="50" r="46"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={ringC}
                strokeDashoffset={ringOffset}
                style={{ filter: "drop-shadow(0 0 4px rgba(34, 211, 238, 0.9))" }}
              />
            )}
          </svg>
          <button
            onClick={toggleMute}
            className={`touch-target w-14 sm:w-16 h-14 sm:h-16 rounded-full transition-colors ${
              isMuted
                ? "bg-red-600 text-white"
                : "bg-[var(--accent)] text-[var(--background)]"
            }`}
            style={{
              boxShadow: isMuted
                ? "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)"
                : `0 0 ${6 + micLevel * 24}px rgba(34, 211, 238, ${0.2 + micLevel * 0.5}), 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)`,
            }}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <svg viewBox="0 0 24 24" className="w-6 sm:w-7 h-6 sm:h-7 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-6 sm:w-7 h-6 sm:h-7 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            )}
          </button>
        </div>

        {/* share */}
        <button
          onClick={() => setShowShare(true)}
          className="touch-target w-12 h-12 rounded-full bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)] transition-colors shrink-0"
          aria-label="Share ride"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>

        {/* chat */}
        <button
          onClick={() => setShowChat(true)}
          className="touch-target w-12 h-12 rounded-full bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)] transition-colors shrink-0"
          aria-label="Open chat"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        {/* leave */}
        <button
          onClick={() => router.push("/")}
          className="touch-target w-12 h-12 rounded-full bg-red-600 text-white transition-colors shrink-0"
          aria-label="Leave ride"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      </div>

      <div ref={audioContainerRef} style={{ display: "none" }} />
    </main>
  );
}
