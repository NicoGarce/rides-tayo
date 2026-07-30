"use client";

import { useRouter } from "next/navigation";
import { createRoom } from "@/lib/room";

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
        <h1 className="text-5xl font-bold tracking-tight">Roam</h1>
        <p className="text-lg text-[var(--muted)] text-center max-w-xs">
          Real-time voice for the open road.
        </p>
      </div>

      <div className="w-full flex flex-col gap-3 pb-8">
        <button onClick={handleCreate} className="btn-primary">
          Create Ride
        </button>
      </div>
    </main>
  );
}
