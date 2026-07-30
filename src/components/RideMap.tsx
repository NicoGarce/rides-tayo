"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RiderInfo } from "@/hooks/usePeerConnection";

/* marker icon — a coloured circle with a white border and heading arrow */
function riderIcon(color: string, heading: number | null) {
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
        width:20px;height:20px;border-radius:50%;
        background:${color};border:3px solid #fff;
        box-shadow:0 1px 4px rgba(0,0,0,.35);
      "></div>
    </div>`,
    iconSize: [26, 32],
    iconAnchor: [13, 16],
    popupAnchor: [0, -18],
  });
}

/* fits the map viewport once to encompass all riders with locations */
function FitBoundsOnce({ riders }: { riders: RiderInfo[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) return;
    const located = riders.filter((r) => r.location);
    if (located.length === 0) return;

    const bounds = L.latLngBounds(
      located.map((r) => [r.location!.lat, r.location!.lng] as [number, number])
    );
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      fitted.current = true;
    }
  }, [riders, map]);

  return null;
}

interface Props {
  riders: RiderInfo[];
  myRiderId: string;
}

export default function RideMap({ riders, myRiderId }: Props) {
  const withLocation = riders.filter((r) => r.location);
  const withoutLocation = riders.filter((r) => !r.location);

  return (
    <div className="w-full">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        className="h-64 w-full rounded-xl z-0"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBoundsOnce riders={riders} />
        {withLocation.map((rider) => (
          <Marker
            key={rider.riderId}
            position={[rider.location!.lat, rider.location!.lng]}
            icon={riderIcon(
              rider.riderId === myRiderId ? "#22c55e" : "#3b82f6",
              rider.location!.heading
            )}
          >
            <Popup>
              <span className="text-sm font-medium">{rider.name}</span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
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
