export interface RouteResult {
  geometry: [number, number][];
  distanceM: number | null;
  durationS: number | null;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function geocode(query: string): Promise<GeocodeResult[]> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=" +
    encodeURIComponent(query);
  const res = await fetch(url);
  if (!res.ok) throw new Error("geocode failed");
  const data = (await res.json()) as {
    lat: string;
    lon: string;
    display_name: string;
  }[];
  return data.map((r) => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    label: r.display_name,
  }));
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  const url =
    "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
    lat +
    "&lon=" +
    lng;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

export interface RouteOptions {
  avoidTolls?: boolean;
  avoidHighways?: boolean;
}

export async function fetchRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  options: RouteOptions = {}
): Promise<RouteResult> {
  const exclude: string[] = [];
  if (options.avoidTolls) exclude.push("toll");
  if (options.avoidHighways) exclude.push("motorway");

  async function request(withExclude: string[]): Promise<RouteResult> {
    const params = new URLSearchParams({ overview: "full", geometries: "geojson" });
    if (withExclude.length) params.set("exclude", withExclude.join(","));
    const url =
      "https://router.project-osrm.org/route/v1/driving/" +
      `${start.lng},${start.lat};${end.lng},${end.lat}?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("route request failed");
    const data = (await res.json()) as {
      routes?: {
        geometry?: { coordinates?: [number, number][] };
        distance?: number;
        duration?: number;
      }[];
    };
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) throw new Error("no route returned");
    const geometry = route.geometry.coordinates.map(
      (c) => [c[1], c[0]] as [number, number]
    );
    return {
      geometry,
      distanceM: typeof route.distance === "number" ? route.distance : null,
      durationS: typeof route.duration === "number" ? route.duration : null,
    };
  }

  try {
    return await request(exclude);
  } catch {
    try {
      return await request([]);
    } catch {
      return {
        geometry: [
          [start.lat, start.lng],
          [end.lat, end.lng],
        ],
        distanceM: haversineMeters(start.lat, start.lng, end.lat, end.lng),
        durationS: null,
      };
    }
  }
}

export function parseGeometry(
  geometryStr: string | undefined
): [number, number][] {
  if (!geometryStr) return [];
  try {
    const raw = JSON.parse(geometryStr) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (p): p is [number, number] =>
        Array.isArray(p) &&
        p.length >= 2 &&
        typeof p[0] === "number" &&
        typeof p[1] === "number"
    );
  } catch {
    return [];
  }
}