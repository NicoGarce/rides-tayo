"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  params: { roomId: string };
}

export default function JoinPage({ params }: Props) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user?.displayName) {
      setName(user.displayName);
    }
  }, [user]);

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

  if (authLoading || !user) return null;

  return (
    <main className="flex flex-col min-h-dvh">
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

        <button
          onClick={handleJoin}
          disabled={joining}
          className="btn-primary w-full disabled:opacity-50"
        >
          {joining ? "Requesting permissions…" : "Join"}
        </button>
      </div>
    </main>
  );
}
