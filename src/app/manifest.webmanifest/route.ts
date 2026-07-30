import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      name: "Roam",
      short_name: "Roam",
      description: "Real-time voice chat for motorcycle rides.",
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
