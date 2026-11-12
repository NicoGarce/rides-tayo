import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      name: "Rides Tayo",
      short_name: "Rides Tayo",
      description: "Ride together, hear each other.",
      id: "/",
      start_url: "/",
      display: "standalone",
      background_color: "#0a0a0a",
      theme_color: "#0a0a0a",
      categories: ["social", "communication"],
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      ],
    },
    {
      headers: { "Content-Type": "application/manifest+json" },
    }
  );
}
