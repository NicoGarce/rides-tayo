"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/useAuth";
import { subscribeDestination, removeDestination } from "@/lib/room";
import type { Destination } from "@/lib/room";

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

export default function JoinPage({ params }: Props) {
  const router = useRouter();
  const { user, loading: authLoading, signInWithEmail } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [joining, setJoining] = useState(false);
  const [authError, setAuthError] = useState("");
  const [destination, setDestination] = useState<Destination | null>(null);
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [showRideInfo, setShowRideInfo] = useState(false);

  useEffect(() => {
    if (user?.displayName) {
      setName(user.displayName);
    }
  }, [user]);

  useEffect(() => {
    return subscribeDestination(params.roomId, setDestination);
  }, [params.roomId]);

  useEffect(() => {
    if (!showRideInfo) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowRideInfo(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showRideInfo]);

  async function handleSignIn() {
    if (!email.trim()) return;
    setAuthError("");
    try {
      await signInWithEmail(email.trim());
    } catch (e: unknown) {
      setAuthError((e as { message?: string }).message || "Failed to sign in");
    }
  }

  async function handleJoin() {
    const displayName = name.trim() || user?.displayName || "Rider";
    setJoining(true);

    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      /* user will see the denied banner on the ride page */
    }

    try {
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(),
          (err) => reject(err),
          { timeout: 3000 }
        );
      });
    } catch {
      /* user will see the denied banner on the ride page */
    }

    sessionStorage.setItem("roam_name", displayName);
    router.push(`/ride/${params.roomId}`);
  }

  if (authLoading) return null;

  if (!user) {
    return (
      <main className="flex flex-col min-h-dvh">
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 max-w-sm mx-auto w-full">
          <h1 className="text-2xl font-semibold">Join Ride</h1>
          <p className="text-sm text-[var(--muted)] text-center">
            Sign in with your email to join <span className="font-mono">{params.roomId}</span>
          </p>
          <div className="w-full flex flex-col gap-2">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
              className="w-full px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] placeholder-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
            />
            <button onClick={handleSignIn} className="btn-primary w-full">
              Sign In
            </button>
            {authError && (
              <p className="text-xs text-red-400 text-center">{authError}</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex flex-col min-h-dvh">
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 max-w-sm mx-auto w-full">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Join Ride</h1>
          <p className="text-sm text-[var(--muted)] mt-2 font-mono">
            {params.roomId}
          </p>
        </div>

        <div className="w-full space-y-2">
          <label className="text-sm font-medium text-[var(--muted)]">
            Your name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter a display name"
            maxLength={24}
            className="w-full px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors text-sm"
          />
        </div>

        <div className="w-full flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => setShowRideInfo(true)}
            aria-haspopup="dialog"
            className="flex-1 min-w-0 flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm font-medium text-[var(--foreground)]"
          >
            <span>Ride access &amp; tips</span>
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4 text-[var(--muted)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setShowDestinationPicker(true)}
            aria-label={destination ? "Change destination" : "Pin a destination"}
            title={destination ? "Change destination" : "Pin a destination"}
            className="w-12 h-12 shrink-0 rounded-xl bg-[var(--accent)] text-[var(--background)] flex items-center justify-center active:opacity-80 transition-opacity"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          </button>
        </div>

        {showRideInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <button
              type="button"
              onClick={() => setShowRideInfo(false)}
              className="absolute inset-0 bg-black/70"
              aria-label="Close ride access and tips"
            />
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="ride-access-title"
              className="relative z-10 w-full max-w-sm max-h-[85dvh] overflow-y-auto rounded-2xl bg-[var(--background)] border border-[var(--border)] p-4 shadow-xl space-y-3"
            >
              <div className="flex items-center justify-between">
                <h2 id="ride-access-title" className="text-sm font-semibold">
                  Ride access &amp; tips
                </h2>
                <button
                  type="button"
                  onClick={() => setShowRideInfo(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)]"
                  aria-label="Close ride access and tips"
                  autoFocus
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="w-full px-3 py-2 rounded-xl bg-yellow-900/40 border border-yellow-700 text-[11px] text-yellow-200 leading-snug">
                ⚠️ <strong>iOS Safari</strong> pauses mic, location, and audio
                when the app is in the background. Keep Rides Tayo in the
                foreground during a ride. Add it to your home screen for the
                best experience.
              </div>
              <div className="w-full space-y-2 text-xs">
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                  <span className="text-base mt-0.5 shrink-0">🎤</span>
                  <div>
                    <p className="font-medium text-[var(--foreground)]">
                      Microphone access
                    </p>
                    <p className="text-[var(--muted)] mt-0.5 text-[11px] leading-snug">
                      Required so other riders can hear you.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                  <span className="text-base mt-0.5 shrink-0">📍</span>
                  <div>
                    <p className="font-medium text-[var(--foreground)]">
                      Location access
                    </p>
                    <p className="text-[var(--muted)] mt-0.5 text-[11px] leading-snug">
                      Shares your position with other riders on the map.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {destination && (
          <div className="w-full flex items-center gap-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] p-3">
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" style={{ color: "#f59e0b" }} fill="#f59e0b">
              <path d="M12 2a10 10 0 0 0-4 19.2V22h8v-.8A10 10 0 0 0 12 2z" />
              <path d="M8.5 7.5h7v5h-3l-1.2 2.4L10 12.5H8.5z" fill="#1a1a2e" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {destination.label.split(",")[0]}
              </p>
              <p className="text-xs text-[var(--muted)] truncate">
                {destination.label}
              </p>
            </div>
            <button
              onClick={() => removeDestination(params.roomId)}
              className="shrink-0 px-2 py-1 text-xs text-[var(--muted)] hover:text-red-400 transition-colors"
            >
              Remove
            </button>
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={joining}
          className="btn-primary w-full disabled:opacity-50"
        >
          {joining ? "Requesting permissions…" : "Join"}
        </button>
      </div>

      {showDestinationPicker && (
        <DestinationPicker
          roomId={params.roomId}
          riderId={user.uid}
          riderName={name.trim() || user.displayName || "Rider"}
          onClose={() => setShowDestinationPicker(false)}
        />
      )}
    </main>
  );
}
