"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LeafletMouseEvent } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { writeDestination } from "@/lib/room";
import type { Destination } from "@/lib/room";
import { geocode, reverseGeocode, fetchRoute } from "@/lib/routing";

interface Props {
  roomId: string;
  riderId: string;
  riderName: string;
  onClose: () => void;
}

function flagIcon() {
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

function startIcon() {
  return L.divIcon({
    className: "",
    html: `
      <div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function ClickCatcher({ onPick }: { onPick: (e: LeafletMouseEvent) => void }) {
  useMapEvents({ click: onPick });
  return null;
}

function FlyTo({
  position,
  zoom,
}: {
  position: { lat: number; lng: number } | null;
  zoom?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo([position.lat, position.lng], zoom ?? 15, { duration: 0.5 });
    }
  }, [position, zoom, map]);
  return null;
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className="w-full flex items-center justify-between py-2 text-sm text-[var(--foreground)] active:opacity-70 transition-opacity"
    >
      <span>{label}</span>
      <span
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          checked ? "bg-[var(--accent)]" : "bg-[var(--border)]"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

export default function DestinationPicker({
  roomId,
  riderId,
  riderName,
  onClose,
}: Props) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel] = useState("");
  const [start, setStart] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { lat: number; lng: number; label: string; short: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidHighways, setAvoidHighways] = useState(false);

  useEffect(() => {
    let active = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (active)
          setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
    return () => {
      active = false;
    };
  }, []);

  /* search-as-you-type with a short debounce; stale responses are dropped */
  const searchReqRef = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      searchReqRef.current++;
      setResults([]);
      setSearching(false);
      return;
    }
    const reqId = ++searchReqRef.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await geocode(q);
        if (reqId === searchReqRef.current) {
          setResults(found.map((r) => ({ ...r, short: r.label.split(",")[0] })));
        }
      } catch {
        if (reqId === searchReqRef.current) {
          setResults([]);
        }
      } finally {
        if (reqId === searchReqRef.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  function pickResult(r: { lat: number; lng: number; label: string; short: string }) {
    setPosition({ lat: r.lat, lng: r.lng });
    setLabel(r.label);
    setResults([]);
    setQuery("");
  }

  async function handleMapClick(e: LeafletMouseEvent) {
    setError("");
    setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
    setLabel("");
    const l = await reverseGeocode(e.latlng.lat, e.latlng.lng);
    if (l) setLabel(l);
  }

  async function handleConfirm() {
    if (!position) return;
    setSaving(true);
    setError("");
    const origin = start ?? position;
    const finalLabel =
      label || `Lat ${position.lat.toFixed(4)}, Lng ${position.lng.toFixed(4)}`;
    try {
      const route = await fetchRoute(origin, position, {
        avoidTolls,
        avoidHighways,
      });
      const dest: Destination = {
        label: finalLabel,
        lat: position.lat,
        lng: position.lng,
        startLat: origin.lat,
        startLng: origin.lng,
        startLabel: "Meeting point",
        geometryStr: JSON.stringify(route.geometry),
        distanceM: route.distanceM,
        durationS: route.durationS,
        setByRiderId: riderId,
        setByName: riderName,
        updatedAt: Date.now(),
      };
      await writeDestination(roomId, dest);
      onClose();
    } catch {
      setError("Failed to save destination. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[var(--background)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="text-sm font-semibold">Pin a destination</span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] active:bg-[var(--surface)] transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="px-4 pt-3 pb-2 border-b border-[var(--border)] space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results.length > 0) pickResult(results[0]);
            }}
            placeholder="Search for a place…"
            className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
          />
          {searching && (
            <span
              className="shrink-0 w-5 h-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"
              aria-label="Searching"
            />
          )}
        </div>
        {results.length > 0 && (
          <ul className="space-y-1">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  onClick={() => pickResult(r)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] transition-colors"
                >
                  <span className="block text-sm font-medium truncate">{r.short}</span>
                  <span className="block text-xs text-[var(--muted)] truncate">{r.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 3 && results.length === 0 && !searching && (
          <p className="text-xs text-[var(--muted)]">No matching places.</p>
        )}
      </div>

      <p className="px-4 pt-2 text-xs text-[var(--muted)]">
        Tap the map to place the destination pin.
      </p>

      <div className="flex-1 min-h-0">
        <MapContainer
          center={start ? [start.lat, start.lng] : [20, 0]}
          zoom={start ? 14 : 2}
          className="h-full w-full z-0"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickCatcher onPick={handleMapClick} />
          <FlyTo position={position} zoom={15} />
          <FlyTo position={start} zoom={13} />
          {start && <Marker position={[start.lat, start.lng]} icon={startIcon()} />}
          {position && (
            <Marker position={[position.lat, position.lng]} icon={flagIcon()} />
          )}
        </MapContainer>
      </div>

      <div className="px-4 py-3 border-t border-[var(--border)] space-y-2">
        <div className="flex flex-col rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3">
          <ToggleRow label="Avoid tolls" checked={avoidTolls} onChange={setAvoidTolls} />
          <ToggleRow label="Avoid highways" checked={avoidHighways} onChange={setAvoidHighways} />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!position && (
          <p className="text-xs text-[var(--muted)] text-center">
            No destination pinned yet
          </p>
        )}
        {position && (
          <p className="text-xs text-[var(--muted)] truncate">
            {label || "Tap to confirm this location"}
          </p>
        )}
        <button
          onClick={handleConfirm}
          disabled={!position || saving}
          className="btn-primary w-full disabled:opacity-50"
        >
          {saving ? "Planning route…" : "Set destination"}
        </button>
      </div>
    </div>
  );
}