"use client";

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
  const { user, loading, signInWithGoogle } = useAuth();

  async function handleCreate() {
    const roomId = generateRoomId();
    try {
      await createRoom(roomId);
    } catch (e) {
      console.warn("[create] room creation failed, proceeding anyway", e);
    }
    router.push(`/ride/${roomId}/join`);
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
        ) : (
          <button onClick={signInWithGoogle} className="btn-primary">
            Sign in with Google
          </button>
        )}
      </div>
    </main>
  );
}
