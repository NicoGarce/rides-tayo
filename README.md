# Roam

Real-time voice chat for motorcycle rides.

## Overview

Roam is a mobile-first web app designed for motorcycle and bike riders to stay
connected on the road. The interface is optimized for small screens mounted on
handlebars: large touch targets, high contrast, and minimal UI.

## Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page — create or join a ride |
| `/ride/[roomId]` | Main in-call screen (placeholder) |
| `/ride/[roomId]/join` | Join screen if the user isn't in the call yet |

## HTTPS Requirement

> **This app requires HTTPS.**

The Web APIs this project will use — `MediaDevices.getUserMedia` (microphone)
and `Geolocation.getCurrentPosition` (location) — are only available in
**secure contexts** (HTTPS). `localhost` is also treated as secure for local
development, but any production deployment must serve over HTTPS.

[Vercel](https://vercel.com) provides automatic HTTPS on every deployment,
including the free tier, so no additional configuration is needed when
deploying there.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

Deploy to Vercel with the free tier:

1. Push to a Git repository (GitHub, GitLab, or Bitbucket).
2. Import the project in [Vercel](https://vercel.com/new).
3. Vercel auto-detects Next.js, builds, and deploys with HTTPS.

## Tech Stack

- [Next.js 14](https://nextjs.org) App Router
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
