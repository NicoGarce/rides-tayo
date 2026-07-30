import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roam",
  description: "Real-time voice chat for motorcycle rides.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Roam",
  },
  icons: [
    { rel: "icon", url: "/icon.svg", type: "image/svg+xml" },
    { rel: "apple-touch-icon", url: "/icon.svg" },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* service worker registration (production only) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
if ('serviceWorker' in navigator) {
  /* unregister any stale SW from previous sessions */
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    regs.forEach(function(r) { r.unregister(); });
  });
  /* only register for production — dev server has its own HMR */
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js');
    });
  }
}
            `.trim(),
          }}
        />
      </head>
      <body className="antialiased min-h-dvh flex flex-col">
        {children}
      </body>
    </html>
  );
}
