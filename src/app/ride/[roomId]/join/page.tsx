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

  useEffect(() => {
    if (user?.displayName) {
      setName(user.displayName);
    }
  }, [user]);

  useEffect(() => {
    return subscribeDestination(params.roomId, setDestination);
  }, [params.roomId]);

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

        {/* iOS Safari warning */}
        <div className="w-full px-4 py-3 rounded-xl bg-yellow-900/40 border border-yellow-700 text-xs text-yellow-200 leading-relaxed">
          ⚠️ <strong>iOS Safari</strong> pauses mic, location, and audio
          when the app is in the background. Keep Rides Tayo in the
          foreground during a ride. Add it to your home screen for the
          best experience.
        </div>

        <div className="w-full space-y-3 text-sm">
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
            <span className="text-lg mt-0.5 shrink-0">🎤</span>
            <div>
              <p className="font-medium text-[var(--foreground)]">
                Microphone access
              </p>
              <p className="text-[var(--muted)] mt-0.5 text-xs leading-relaxed">
                Required so other riders can hear you.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
            <span className="text-lg mt-0.5 shrink-0">📍</span>
            <div>
              <p className="font-medium text-[var(--foreground)]">
                Location access
              </p>
              <p className="text-[var(--muted)] mt-0.5 text-xs leading-relaxed">
                Shares your position with other riders on the map.
              </p>
            </div>
          </div>
        </div>

        <div className="w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--foreground)]">
              Destination
            </span>
            {destination && (
              <button
                onClick={() => removeDestination(params.roomId)}
                className="text-xs text-[var(--muted)] hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
          {destination ? (
            <div className="flex items-center gap-2 px-1">
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
            </div>
          ) : (
            <p className="text-xs text-[var(--muted)] px-1">
              Optional — everyone in the ride sees the route to your pinned
              destination.
            </p>
          )}
          <button
            onClick={() => setShowDestinationPicker(true)}
            className="w-full py-2 rounded-lg bg-[var(--accent)] text-[var(--background)] text-sm font-semibold active:opacity-80 transition-opacity"
          >
            {destination ? "Change destination" : "Pin a destination"}
          </button>
        </div>

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
