"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RiderInfo } from "@/hooks/usePeerConnection";
import type { Destination } from "@/lib/room";
import { parseGeometry } from "@/lib/routing";

/* marker icon — a circle with the rider's initial, white border, and heading arrow */
function riderIcon(color: string, heading: number | null, initial: string) {
  const arrow =
    heading !== null
      ? `<div style="
          position:absolute;top:-10px;left:50%;margin-left:-4px;
          width:0;height:0;
          border-left:5px solid transparent;
          border-right:5px solid transparent;
          border-bottom:8px solid ${color};
          transform:rotate(${heading}deg);
        "></div>`
      : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
      ${arrow}
      <div style="
        width:24px;height:24px;border-radius:50%;
        background:${color};border:3px solid #fff;
        box-shadow:0 1px 4px rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:700;color:#fff;line-height:1;
      ">${initial}</div>
    </div>`,
    iconSize: [30, 36],
    iconAnchor: [15, 18],
    popupAnchor: [0, -20],
  });
}

/* shared destination flag marker */
function destinationIcon() {
  return L.divIcon({
    className: "",
    html: `
      <div style="width:36px;height:36px;">
        <svg viewBox="0 0 24 24" width="36" height="36" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.45))">
          <path d="M12 2a10 10 0 0 0-4 19.2V22h8v-.8A10 10 0 0 0 12 2z" fill="#f59e0b" stroke="#fff" stroke-width="1.5"/>
          <path d="M8.5 7.5h7v5h-3l-1.2 2.4L10 12.5H8.5z" fill="#1a1a2e"/>
        </svg>
      </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 34],
  });
}

/* small green dot marking the route origin / meeting point */
function originIcon() {
  return L.divIcon({
    className: "",
    html: `
      <div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/* fits the map viewport to encompass all riders, the route, and
   the destination.  Only runs while follow mode is OFF. */
function FitBoundsOnce({
  points,
  active,
}: {
  points: [number, number][];
  active: boolean;
}) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (!active || fitted.current || points.length === 0) return;

    const bounds = L.latLngBounds(points);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      fitted.current = true;
    }
  }, [active, points, map]);

  return null;
}

/* moves the zoom buttons to the bottom-left so the destination bar in the
   top-left corner is never covered */
function ZoomControlBottom() {
  const map = useMap();
  useEffect(() => {
    L.control.zoom({ position: "bottomleft" }).addTo(map);
  }, [map]);
  return null;
}

/* Google Maps-style navigation: keeps the rider's marker pinned near
   the bottom of the screen and recenters the map as they move.  Any
   manual drag disables follow mode. */
function FollowMe({
  target,
  active,
  onStop,
}: {
  target: { lat: number; lng: number } | null;
  active: boolean;
  onStop: () => void;
}) {
  const map = useMap();
  const lastKey = useRef<string | null>(null);

  useMapEvents({
    dragstart: () => {
      if (active) onStop();
    },
  });

  useEffect(() => {
    if (!active) return;
    if (!target) return;

    const key = `${target.lat.toFixed(5)},${target.lng.toFixed(5)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    const zoom = Math.max(map.getZoom(), 16);
    const world = map.project([target.lat, target.lng], zoom);
    const size = map.getSize();
    const screen = L.point(size.x / 2, size.y * 0.78);
    const center = map.unproject(world.subtract(screen), zoom);
    map.flyTo(center, zoom, { duration: 0.5 });
  }, [target, active, map]);

  useEffect(() => {
    if (!active || !target) {
      lastKey.current = null;
    }
  }, [active, target]);

  return null;
}

interface Props {
  riders: RiderInfo[];
  myRiderId: string;
  destination?: Destination | null;
}

export default function RideMap({ riders, myRiderId, destination }: Props) {
  const [follow, setFollow] = useState(true);
  const withLocation = riders.filter((r) => r.location);
  const withoutLocation = riders.filter((r) => !r.location);

  const me = riders.find((r) => r.riderId === myRiderId);
  const myLocation = me?.location;

  const routePoints = destination ? parseGeometry(destination.geometryStr) : [];

  const boundsPoints: [number, number][] = [
    ...withLocation.map(
      (r) => [r.location!.lat, r.location!.lng] as [number, number]
    ),
    ...routePoints,
    ...(destination
      ? ([[destination.lat, destination.lng]] as [number, number][])
      : []),
  ];

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        zoomControl={false}
        className="h-full w-full rounded-xl z-0"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControlBottom />
        <FitBoundsOnce
          points={boundsPoints}
          active={!follow && boundsPoints.length > 0}
        />
        <FollowMe
          target={myLocation ? { lat: myLocation.lat, lng: myLocation.lng } : null}
          active={follow}
          onStop={() => setFollow(false)}
        />
        {routePoints.length > 1 && (
          <Polyline
            positions={routePoints}
            pathOptions={{ color: "#f59e0b", weight: 5, opacity: 0.85 }}
          />
        )}
        {destination && (
          <Marker
            position={[destination.startLat, destination.startLng]}
            icon={originIcon()}
          />
        )}
        {destination && (
          <Marker
            position={[destination.lat, destination.lng]}
            icon={destinationIcon()}
          >
            <Popup>
              <span className="text-sm font-medium">{destination.label}</span>
            </Popup>
          </Marker>
        )}
        {withLocation.map((rider) => (
          <Marker
            key={rider.riderId}
            position={[rider.location!.lat, rider.location!.lng]}
            icon={riderIcon(
              rider.riderId === myRiderId ? "#22c55e" : "#3b82f6",
              rider.location!.heading,
              rider.name.charAt(0).toUpperCase()
            )}
          >
            <Popup>
              <span className="text-sm font-medium">{rider.name}</span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* follow / recenter toggle */}
      <button
        onClick={() => setFollow((f) => !f)}
        aria-label={follow ? "Stop following my location" : "Follow my location"}
        title={follow ? "Following your location" : "Follow your location"}
        className={`absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border transition-colors ${
          follow
            ? "bg-[var(--accent)] text-[var(--background)] border-[var(--accent)]"
            : "bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)]"
        }`}
        style={{ zIndex: 500 }}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </button>

      {withoutLocation.length > 0 && (
        <ul className="mt-2 space-y-1">
          {withoutLocation.map((r) => (
            <li
              key={r.riderId}
              className="text-sm text-[var(--muted)] flex items-center gap-2"
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: r.riderId === myRiderId ? "#22c55e" : "#3b82f6",
                }}
              />
              {r.name} — location unavailable
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
