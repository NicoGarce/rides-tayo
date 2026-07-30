"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { QRCodeSVG } from "qrcode.react";
import { usePeerConnection } from "@/hooks/usePeerConnection";
import { useAuth } from "@/hooks/useAuth";

const RideMap = dynamic(() => import("@/components/RideMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full rounded-xl bg-[var(--surface)] animate-pulse flex items-center justify-center text-sm text-[var(--muted)]">
      Loading map…
    </div>
  ),
});

interface Props {
  params: { roomId: string };
}

function RiderTile({
  src,
  name,
  isSelf,
  muted,
  speaking,
}: {
  src?: string;
  name: string;
  isSelf: boolean;
  muted: boolean;
  speaking: boolean;
}) {
  const initial = name.charAt(0).toUpperCase();

  const borderBase = isSelf ? "#22c55e" : (muted ? "#6b7280" : "#3b82f6");
  const borderColor = speaking ? "#22d3ee" : borderBase;
  const glow = speaking ? "0 0 18px rgba(34, 211, 238, 0.6)" : "none";

  return (
    <div className="flex flex-col items-center gap-2">
      {src ? (
        <img
          src={src}
          alt={name}
          className="rounded-full object-cover shrink-0 transition-[border-color,box-shadow] duration-150"
          style={{
            width: 88,
            height: 88,
            border: `3px solid ${borderColor}`,
            boxShadow: glow,
          }}
        />
      ) : (
        <div
          className="rounded-full shrink-0 flex items-center justify-center text-2xl font-bold text-white transition-[border-color,box-shadow] duration-150"
          style={{
            width: 88,
            height: 88,
            border: `3px solid ${borderColor}`,
            boxShadow: glow,
            background: "#1a1a2e",
          }}
        >
          {initial}
        </div>
      )}
      <span className="text-sm font-medium text-[var(--foreground)] truncate max-w-24 text-center">
        {name}{isSelf ? " (you)" : ""}
      </span>
    </div>
  );
}

export default function RidePage({ params }: Props) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [showMap, setShowMap] = useState(false);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [authLoading, user, router]);

  const riderName =
    typeof window !== "undefined"
      ? sessionStorage.getItem("roam_name") || user?.displayName || "Rider"
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
    toggleMute,
    speakingPeerIds,
  } = usePeerConnection({
    roomId: params.roomId,
    riderId: user?.uid || undefined,
    riderName,
    photoURL: user?.photoURL || undefined,
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

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/ride/${params.roomId}/join`
      : "";

  if (authLoading || !user) return null;

  return (
    <main className="flex flex-col min-h-dvh bg-[var(--background)]">
      {/* header */}
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-sm text-[var(--muted)] font-mono">
          {params.roomId}
        </span>
        <span className="text-sm font-medium text-[var(--accent)]">
          {riderCount} rider{riderCount > 1 ? "s" : ""}
        </span>
      </header>

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

      {/* main content: map or rider tiles */}
      <div className="flex-1 flex flex-col">
        {showMap ? (
          /* map view */
          <div className="flex-1 px-4 pb-2">
            <RideMap riders={riders} myRiderId={myRiderId} />
            {/* compact rider list below map */}
            {riders.length > 0 && (
              <div className="flex flex-wrap justify-center gap-4 pt-3">
                {riders.map((rider) => (
                  <div key={rider.riderId} className="flex items-center gap-2 text-sm">
                    {rider.photoURL ? (
                      <img src={rider.photoURL} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-[var(--surface)] flex items-center justify-center text-xs font-bold text-white">
                        {rider.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className={rider.riderId === myRiderId ? "text-[var(--accent)]" : "text-[var(--foreground)]"}>
                      {rider.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
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
                  src={rider.photoURL}
                  name={rider.name}
                  isSelf={rider.riderId === myRiderId}
                  muted={false}
                  speaking={speakingPeerIds.has(rider.peerId)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

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
      <div className="flex items-center justify-center gap-6 px-6 py-5 border-t border-[var(--border)]">
        {/* map toggle */}
        <button
          onClick={() => setShowMap(!showMap)}
          className={`touch-target w-12 h-12 rounded-full transition-colors ${
            showMap
              ? "bg-[var(--accent)] text-[var(--background)]"
              : "bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)]"
          }`}
          aria-label={showMap ? "Hide map" : "Show map"}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22c-2-3-6-6-6-10a6 6 0 0 1 12 0c0 4-4 7-6 10z" />
            <circle cx="12" cy="10" r="2" />
          </svg>
        </button>

        {/* mute toggle */}
        <button
          onClick={toggleMute}
          className={`touch-target w-16 h-16 rounded-full transition-colors shadow-lg ${
            isMuted
              ? "bg-red-600 text-white"
              : "bg-[var(--accent)] text-[var(--background)]"
          }`}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <svg viewBox="0 0 24 24" className="w-7 h-7 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-7 h-7 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          )}
        </button>

        {/* share */}
        <button
          onClick={() => setShowShare(true)}
          className="touch-target w-12 h-12 rounded-full bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)] transition-colors"
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

        {/* leave */}
        <button
          onClick={() => router.push("/")}
          className="touch-target w-12 h-12 rounded-full bg-red-600 text-white transition-colors"
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
