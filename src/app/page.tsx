"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/lib/room";
import { useAuth } from "@/hooks/useAuth";

function generateRoomId(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export default function Home() {
  const router = useRouter();
  const { user, loading, sendOtp } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleCreate() {
    const roomId = generateRoomId();
    try {
      await createRoom(roomId);
    } catch (e) {
      console.warn("[create] room creation failed, proceeding anyway", e);
    }
    router.push(`/ride/${roomId}/join`);
  }

  async function handleSendOtp() {
    if (!email.trim()) return;
    setSending(true);
    setError("");
    try {
      await sendOtp(email.trim());
      setSent(true);
    } catch (e: unknown) {
      setError((e as { message?: string }).message || "Failed to send OTP");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex flex-col items-center justify-between min-h-dvh p-6">
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <h1 className="text-5xl font-bold tracking-tight">Rides Tayo</h1>
        <p className="text-lg text-[var(--muted)] text-center max-w-xs">
          Ride together, hear each other.
        </p>
      </div>

      <div className="w-full flex flex-col gap-3 pb-8">
        {loading ? (
          <div className="h-[52px] flex items-center justify-center text-sm text-[var(--muted)]">
            Loading…
          </div>
        ) : user ? (
          <button onClick={handleCreate} className="btn-primary">
            Create Ride
          </button>
        ) : sent ? (
          <div className="text-center space-y-2">
            <p className="text-sm text-[var(--muted)]">
              Check your email for the sign-in link.
            </p>
            <p className="text-xs text-[var(--muted)]">
              {email}
            </p>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-2">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
              className="w-full px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] placeholder-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
            />
            <button
              onClick={handleSendOtp}
              disabled={sending || !email.trim()}
              className="btn-primary disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send OTP"}
            </button>
            {error && (
              <p className="text-xs text-red-400 text-center">{error}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
