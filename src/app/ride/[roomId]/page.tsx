"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { QRCodeSVG } from "qrcode.react";
import { usePeerConnection } from "@/hooks/usePeerConnection";

const RideMap = dynamic(() => import("@/components/RideMap"), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full rounded-xl bg-[var(--surface)] animate-pulse flex items-center justify-center text-sm text-[var(--muted)]">
      Loading map…
    </div>
  ),
});

interface Props {
  params: { roomId: string };
}

export default function RidePage({ params }: Props) {
  const router = useRouter();
  const [showShare, setShowShare] = useState(false);

  const riderName =
    typeof window !== "undefined"
      ? sessionStorage.getItem("roam_name") || "Rider"
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
  } = usePeerConnection({ roomId: params.roomId, riderName });

  const audioContainerRef = useRef<HTMLDivElement>(null);

  /* render remote audio elements */
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

  const statusLabel = (() => {
    switch (callStatus) {
      case "connecting":
        return "Connecting…";
      case "connected":
        return `${riderCount} rider${riderCount > 1 ? "s" : ""} on call`;
      case "reconnecting":
        return "Reconnecting…";
      case "disconnected":
        return "Disconnected";
    }
  })();

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/ride/${params.roomId}/join`
      : "";

  return (
    <main className="flex flex-col min-h-dvh">
      {/* status bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <span className="text-sm text-[var(--muted)] font-mono">
          {params.roomId}
        </span>
        <span
          className={`text-sm font-medium ${
            callStatus === "connected"
              ? "text-[var(--accent)]"
              : "text-[var(--muted)]"
          }`}
        >
          {statusLabel}
        </span>
      </header>

      {/* reconnecting banner */}
      {callStatus === "reconnecting" && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-yellow-900/40 border border-yellow-700 text-sm text-yellow-200 animate-pulse">
          Connection lost — reconnecting…
        </div>
      )}

      {/* permission-denial banners */}
      {micDenied && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-red-900/40 border border-red-700 text-sm text-red-200">
          Mic access denied. Other riders won&apos;t hear you. Check your
          browser permissions and refresh.
        </div>
      )}
      {locationDenied && (
        <div className="mx-6 mt-2 px-4 py-3 rounded-xl bg-yellow-900/40 border border-yellow-700 text-sm text-yellow-200">
          Location access denied. Your position won&apos;t be shared. Enable
          location services in your browser settings to share your ride
          location.
        </div>
      )}

      {/* map */}
      <div className="px-6 pt-4">
        <RideMap riders={riders} myRiderId={myRiderId} />
      </div>

      {/* main area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pt-6">
        <div className="text-center">
          <p className="text-lg font-semibold">Ride active</p>
          <p className="text-sm text-[var(--muted)] mt-1">
            Voice is live — riders can hear each other.
          </p>
        </div>

        {/* mute toggle */}
        <button
          onClick={toggleMute}
          className={`touch-target w-20 h-20 rounded-full text-3xl font-bold transition-colors ${
            isMuted
              ? "bg-red-600 text-white"
              : "bg-[var(--accent)] text-[var(--background)]"
          }`}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? "M" : "U"}
        </button>
        <span className="text-sm text-[var(--muted)]">
          {isMuted ? "Muted" : "Unmuted"}
        </span>

        {/* action buttons */}
        <div className="w-full max-w-xs flex flex-col gap-3">
          <button
            onClick={() => setShowShare(!showShare)}
            className="btn-secondary"
          >
            {showShare ? "Hide Share" : "Share Ride"}
          </button>

          <button
            onClick={() => router.push("/")}
            className="touch-target w-full rounded-xl font-semibold text-lg bg-red-600 text-white active:bg-red-700 transition-colors"
          >
            Leave Ride
          </button>
        </div>

        {/* share panel */}
        {showShare && (
          <div className="w-full max-w-xs p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
            <p className="text-sm font-medium text-[var(--foreground)]">
              Share this link with other riders:
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
                className="shrink-0 px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--background)] text-xs font-semibold active:opacity-80 transition-opacity"
              >
                Copy
              </button>
            </div>
            <div className="flex justify-center pt-2">
              <QRCodeSVG value={shareUrl} size={160} bgColor="transparent" fgColor="#fafafa" />
            </div>
            <p className="text-center text-[var(--muted)] text-xs">
              Scan to join
            </p>
          </div>
        )}
      </div>

      {/* hidden container for remote <audio> elements */}
      <div ref={audioContainerRef} style={{ display: "none" }} />
    </main>
  );
}
