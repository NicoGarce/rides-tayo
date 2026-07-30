import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rides Tayo",
  description: "Ride together, hear each other.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rides Tayo",
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
      <body className="antialiased min-h-dvh flex flex-col">
        <Script id="sw" strategy="afterInteractive">
          {`
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    regs.forEach(function(r) { r.unregister(); });
  });
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js');
    });
  }
}
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
