import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      name: "Rides Tayo",
      short_name: "Rides Tayo",
      description: "Ride together, hear each other.",
      start_url: "/",
      display: "standalone",
      background_color: "#0a0a0a",
      theme_color: "#0a0a0a",
      categories: ["social", "communication"],
      icons: [
        {
          src: "/icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
      ],
    },
    {
      headers: { "Content-Type": "application/manifest+json" },
    }
  );
}
