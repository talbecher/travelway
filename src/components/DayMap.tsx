import { useEffect, useMemo, useRef, useState } from "react";
import { MapSkeleton } from "@/components/MapSkeleton";
import { MapContainer, TileLayer, Marker, Polyline, Popup, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { Maximize2, X } from "lucide-react";
import { TYPE_PIN_COLOR } from "@/lib/coords";

export type MapStop = {
  id: string;
  lat: number;
  lng: number;
  type: string;
  index: number;
  title: string;
  time?: string | null;
};

/**
 * Static, trusted SVG geometry (lucide icon paths, ISC). Kept as constants so
 * nothing user-supplied is ever interpolated into marker markup as HTML.
 */
const ICON_SHAPES: Record<string, string[]> = {
  food: [
    '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>',
    '<path d="M7 2v20"/>',
    '<path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  ],
  attraction: [
    '<path d="M10 18v-7"/>',
    '<path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/>',
    '<path d="M14 18v-7"/>',
    '<path d="M18 18v-7"/>',
    '<path d="M3 22h18"/>',
    '<path d="M6 18v-7"/>',
  ],
  transport: [
    '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/>',
    '<path d="m9 15-1-1"/>',
    '<path d="m15 15 1-1"/>',
    '<path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/>',
    '<path d="m8 19-2 3"/>',
    '<path d="m16 19 2 3"/>',
  ],
  hotel: [
    '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/>',
    '<path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/>',
    '<path d="M12 4v6"/>',
    '<path d="M2 18h20"/>',
  ],
  flight: [
    '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  ],
  note: [
    '<path d="M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/>',
    '<path d="M15 3v5a1 1 0 0 0 1 1h5"/>',
  ],
  place: [
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>',
    '<circle cx="12" cy="10" r="3"/>',
  ],
};

function shapesFor(type: string): string[] {
  if (type === "hotel_checkin") return ICON_SHAPES.hotel;
  return ICON_SHAPES[type] ?? ICON_SHAPES.place;
}

function iconSvg(type: string, size: number, color: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    shapesFor(type).join("") +
    `</svg>`
  );
}

/** Escapes user-supplied text before it enters a divIcon HTML string. */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SELECT_RING = "#FF7A5C"; // coral — selection only, never a type/status color

type PinState = "normal" | "dim" | "selected" | "from" | "to";

function pinIcon(stop: MapStop, state: PinState): L.DivIcon {
  const color = TYPE_PIN_COLOR[stop.type] ?? "#6C63FF";
  const selected = state === "selected" || state === "from" || state === "to";
  const size = selected ? 40 : 32;
  const half = size / 2;
  const roleLabel = state === "from" ? "מוצא" : state === "to" ? "יעד" : "";
  const label = selected ? `${roleLabel ? roleLabel + " · " : ""}${stop.title}` : "";

  const circle =
    `<div class="day-pin-circle" style="` +
    `position:absolute;left:${-half}px;top:${-half}px;width:${size}px;height:${size}px;` +
    `border-radius:50%;background:${color};color:#fff;` +
    `border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);` +
    `display:flex;align-items:center;justify-content:center;` +
    `font-size:${selected ? 16 : 14}px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;` +
    (selected ? `outline:3px solid ${SELECT_RING};outline-offset:2px;` : "") +
    (state === "dim" ? `opacity:.6;` : "") +
    `">${stop.index}</div>`;

  const badgeSize = 18;
  const badge =
    `<div style="position:absolute;left:${half - badgeSize + 4}px;top:${-half - 6}px;` +
    `width:${badgeSize}px;height:${badgeSize}px;border-radius:50%;background:#fff;` +
    `border:1.5px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,0.25);` +
    `display:flex;align-items:center;justify-content:center;` +
    (state === "dim" ? `opacity:.6;` : "") +
    `">${iconSvg(stop.type, 10, color)}</div>`;

  const labelHtml = label
    ? `<div style="position:absolute;left:50%;transform:translateX(-50%);top:${half + 6}px;` +
      `max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;` +
      `background:#fff;color:#1a1a23;border:1px solid rgba(0,0,0,0.12);border-radius:999px;` +
      `padding:2px 8px;font-size:11px;font-weight:600;box-shadow:0 2px 6px rgba(0,0,0,0.2);` +
      `">${esc(label)}</div>`
    : "";

  return L.divIcon({
    className: "day-pin-wrap",
    html:
      `<div role="img" aria-label="${esc(`תחנה ${stop.index}: ${stop.title}${roleLabel ? ` (${roleLabel})` : ""}`)}" ` +
      `style="position:relative;width:0;height:0;">${circle}${badge}${labelHtml}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function RoadRoute({ stops }: { stops: MapStop[] }) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(false);
  const coordsKey = stops.map((s) => `${s.lat},${s.lng}`).join("|");

  useEffect(() => {
    if (stops.length < 2) {
      setRouteCoords([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const coords = stops.map((s) => `${s.lng},${s.lat}`).join(";");
    fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const geometry = data.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(geometry) && geometry.length >= 2) {
          // OSRM returns [lng,lat], Leaflet needs [lat,lng]
          setRouteCoords(geometry.map(([lng, lat]: number[]) => [lat, lng] as [number, number]));
        } else {
          setRouteCoords(stops.map((s) => [s.lat, s.lng] as [number, number]));
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback: straight lines between stops
        setRouteCoords(stops.map((s) => [s.lat, s.lng] as [number, number]));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordsKey]);

  if (loading || routeCoords.length < 2) {
    // Placeholder: dashed straight lines while the road route loads
    return (
      <Polyline
        positions={stops.map((s) => [s.lat, s.lng] as [number, number])}
        pathOptions={{ color: "#6C63FF", weight: 2, opacity: 0.4, dashArray: "6,6" }}
      />
    );
  }

  return (
    <Polyline
      positions={routeCoords}
      pathOptions={{
        color: "#6C63FF",
        weight: 4,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
      }}
    />
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function FitBounds({ stops, bottomPadding = 50, paused }: { stops: MapStop[]; bottomPadding?: number; paused?: boolean }) {
  const map = useMap();
  const key = stops.map((s) => `${s.lat},${s.lng}`).join("|");
  const userMoved = useRef(false);
  useEffect(() => {
    if (!map) return;
    const mark = () => { userMoved.current = true; };
    map.on("dragstart", mark);
    map.on("zoomstart", mark);
    return () => {
      map.off("dragstart", mark);
      map.off("zoomstart", mark);
    };
  }, [map]);
  useEffect(() => {
    if (!map || paused) return;
    const animate = !prefersReducedMotion();
    const timer = setTimeout(() => {
      try {
        // Never re-frame after the user has panned/zoomed the map themselves.
        if (userMoved.current) return;
        if (stops.length === 0) return;
        if (stops.length === 1) {
          map.setView([stops[0].lat, stops[0].lng], 14, { animate });
          return;
        }
        const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number]));
        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            paddingTopLeft: [40, 40],
            paddingBottomRight: [40, bottomPadding],
            maxZoom: 14,
            animate,
          });
        }
      } catch (e) {
        console.warn("fitBounds failed", e);
      }
    }, 150);
    return () => clearTimeout(timer);
    // Intentionally keyed on the coordinates only: a data refresh that returns
    // identical coordinates must not reset the user's zoom/position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map, bottomPadding, paused]);
  return null;
}

/**
 * Frames the current selection: for a segment, exactly its two endpoints;
 * for a single stop, keeps the zoom and only pans it clear of the bottom card.
 */
function FocusSelection({
  stops,
  highlightId,
  segmentIds,
  bottomPadding,
}: {
  stops: MapStop[];
  highlightId?: string | null;
  segmentIds?: { fromId: string; toId: string } | null;
  bottomPadding: number;
}) {
  const map = useMap();
  const key = segmentIds ? `seg:${segmentIds.fromId}|${segmentIds.toId}` : highlightId ? `stop:${highlightId}` : "";
  useEffect(() => {
    if (!map || !key) return;
    const animate = !prefersReducedMotion();
    const timer = setTimeout(() => {
      try {
        if (segmentIds) {
          const a = stops.find((s) => s.id === segmentIds.fromId);
          const b = stops.find((s) => s.id === segmentIds.toId);
          if (!a || !b) return;
          // Same coordinate: framing a zero-size box would zoom to street level
          // for two stops that sit on top of each other — use a usable zoom.
          if (a.lat === b.lat && a.lng === b.lng) {
            map.setView([a.lat, a.lng], Math.min(17, map.getMaxZoom()), { animate });
            return;
          }
          const bounds = L.latLngBounds([
            [a.lat, a.lng],
            [b.lat, b.lng],
          ]);
          if (bounds.isValid()) {
            map.fitBounds(bounds, {
              paddingTopLeft: [56, 56],
              paddingBottomRight: [56, bottomPadding],
              maxZoom: 16,
              animate,
            });
          }
          return;
        }
        const s = stops.find((x) => x.id === highlightId);
        if (!s) return;
        const zoom = map.getZoom();
        const pt = map.project([s.lat, s.lng], zoom);
        map.panTo(map.unproject([pt.x, pt.y + bottomPadding / 2], zoom), { animate });
      } catch (e) {
        console.warn("focus selection failed", e);
      }
    }, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}



function FocusRouteButton({ stops, bottomOffset = 16 }: { stops: MapStop[]; bottomOffset?: number }) {
  const map = useMap();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (stops.length === 0) return;
        const animate = !prefersReducedMotion();
        if (stops.length === 1) {
          map.setView([stops[0].lat, stops[0].lng], 15, { animate });
          return;
        }
        const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number]));
        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            paddingTopLeft: [50, 50],
            paddingBottomRight: [50, Math.max(50, bottomOffset)],
            maxZoom: 15,
            animate,
          });
        }
      }}
      aria-label="התמקד לכל המסלול"
      style={{
        position: "absolute", bottom: Math.max(16, bottomOffset + 8), right: 12, zIndex: 500,
        width: 40, height: 40, borderRadius: 999,
        background: "#fff", border: "1px solid rgba(0,0,0,0.15)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: "#6C63FF",
      }}
    >
      <Maximize2 size={16} />
    </button>
  );
}

/** Cluster badge — deliberately unlike a stop pin: a pill that says "N תחנות". */
function clusterIcon(cluster: { getChildCount: () => number }): L.DivIcon {
  const count = cluster.getChildCount();
  return L.divIcon({
    className: "",
    html:
      `<div style="height:30px;padding:0 12px;border-radius:8px;` +
      `background:linear-gradient(135deg,#3B3663,#565090);border:2px solid #fff;` +
      `box-shadow:0 3px 10px rgba(0,0,0,0.35);color:#fff;font-weight:700;font-size:12px;` +
      `display:flex;align-items:center;justify-content:center;white-space:nowrap;">${count} תחנות</div>`,
    iconSize: [76, 30],
    iconAnchor: [38, 15],
  });
}

/** Opens the compact "which stop?" list instead of zooming or spiderfying. */
type ClusterGroupLike = {
  on: (ev: string, fn: (e: unknown) => void) => void;
  off: (ev: string, fn: (e: unknown) => void) => void;
};

function ClusterPicker({
  groupRef,
  stops,
  onCluster,
}: {
  groupRef: React.MutableRefObject<ClusterGroupLike | null>;
  stops: MapStop[];
  onCluster: (ids: string[]) => void;
}) {
  const map = useMap();
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const handler = (e: unknown) => {
      const layer = (e as { layer?: { getAllChildMarkers?: () => L.Marker[] } }).layer;
      const markers = layer?.getAllChildMarkers?.() ?? [];
      const ids: string[] = [];
      for (const m of markers) {
        const ll = m.getLatLng();
        const hit = stops.find((s) => s.lat === ll.lat && s.lng === ll.lng && !ids.includes(s.id));
        if (hit) ids.push(hit.id);
      }
      if (ids.length > 0) onCluster(ids);
    };
    group.on("clusterclick", handler);
    return () => {
      group.off("clusterclick", handler);
    };
  }, [groupRef, stops, onCluster, map]);
  return null;
}

const MAP_STYLE = `
.day-pin-wrap { background: none; border: 0; }
.day-pin-circle { transition: transform .18s ease, outline-color .18s ease; }
@media (prefers-reduced-motion: reduce) {
  .day-pin-circle { transition: none; }
}
.custom-popup .leaflet-popup-content-wrapper {
  background: var(--surface, #1A1A23);
  color: inherit;
  border: 1px solid var(--border, #2A2A35);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}
.custom-popup .leaflet-popup-content {
  margin: 8px 12px;
  font-family: Inter, system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.35;
}
.custom-popup .leaflet-popup-tip {
  background: var(--surface, #1A1A23);
  border: 1px solid var(--border, #2A2A35);
}
.custom-popup a.leaflet-popup-close-button { color: var(--muted-foreground, #9CA3AF); }
`;

export default function DayMap({
  stops,
  highlightId,
  onPinTap,
  bottomPadding = 50,
  segmentIds = null,
}: {
  stops: MapStop[];
  highlightId?: string | null;
  onPinTap?: (id: string) => void;
  /** Space (px) reserved at the bottom of the map for an overlay card. */
  bottomPadding?: number;
  /** Endpoint ids of a selected segment — both endpoints get highlighted. */
  segmentIds?: { fromId: string; toId: string } | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [clusterIds, setClusterIds] = useState<string[] | null>(null);
  const groupRef = useRef<ClusterGroupLike | null>(null);

  // Filter to valid coords and keep the numbering supplied by the list —
  // filtering out stops without coordinates must never renumber the rest.
  const validStops = useMemo(
    () =>
      stops
        .filter(
          (s) =>
            Number.isFinite(s.lat) && Number.isFinite(s.lng) &&
            s.lat >= -90 && s.lat <= 90 &&
            s.lng >= -180 && s.lng <= 180 &&
            !(s.lat === 0 && s.lng === 0),
        )
        .sort((a, b) => a.index - b.index),
    [stops],
  );

  const center: [number, number] = validStops[0]
    ? [validStops[0].lat, validStops[0].lng]
    : [35.6812, 139.7671];

  const path = validStops.map((s) => [s.lat, s.lng] as [number, number]);

  const stateOf = (s: MapStop): PinState => {
    if (segmentIds?.fromId === s.id) return "from";
    if (segmentIds?.toId === s.id) return "to";
    if (highlightId === s.id) return "selected";
    return highlightId || segmentIds ? "dim" : "normal";
  };

  // Selected stop / segment endpoints are rendered outside the cluster group so
  // they are always visible and tappable — and never duplicated inside it.
  const selectedIds = new Set<string>(
    [segmentIds?.fromId, segmentIds?.toId, highlightId].filter((v): v is string => !!v),
  );
  const clustered = validStops.filter((s) => !selectedIds.has(s.id));
  const pinned = validStops.filter((s) => selectedIds.has(s.id));

  useEffect(() => {
    setClusterIds(null);
  }, [highlightId, segmentIds]);

  const renderMarker = (s: MapStop) => {
    const state = stateOf(s);
    const color = TYPE_PIN_COLOR[s.type] ?? "#6C63FF";
    return (
      <Marker
        key={s.id}
        position={[s.lat, s.lng]}
        icon={pinIcon(s, state)}
        zIndexOffset={state === "normal" || state === "dim" ? 0 : 1000}
        eventHandlers={{ click: () => onPinTap?.(s.id) }}
      >
        {!onPinTap && (
          <Popup className="custom-popup" closeButton={false}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: color, color: "#fff",
                  fontSize: 11, fontWeight: 600,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {s.index}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{s.title}</div>
                {s.time && <div style={{ fontSize: 11, opacity: 0.7, direction: "ltr" }}>{s.time}</div>}
              </div>
            </div>
          </Popup>
        )}
      </Marker>
    );
  };

  if (!mounted) return <MapSkeleton />;

  const clusterStops = clusterIds
    ? (clusterIds.map((id) => validStops.find((s) => s.id === id)).filter(Boolean) as MapStop[])
    : [];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <style>{MAP_STYLE}</style>
      <MapContainer
        center={center}
        zoom={validStops.length === 1 ? 15 : 13}
        scrollWheelZoom
        zoomControl={false}
        maxZoom={19}
        minZoom={3}
        style={{ width: "100%", height: "100%", background: "#EDEDED" }}
      >
        <ZoomControl position="topright" />


        <TileLayer
          attribution='&copy; OpenStreetMap &copy; CartoDB'
          url={`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${import.meta.env.VITE_CARTO_API_KEY}`}
          maxZoom={19}
          minZoom={3}
        />

        {path.length >= 2 && <RoadRoute stops={validStops} />}
        <MarkerClusterGroup
          ref={groupRef}
          chunkedLoading
          maxClusterRadius={40}
          disableClusteringAtZoom={16}
          spiderfyOnMaxZoom={false}
          zoomToBoundsOnClick={false}
          showCoverageOnHover={false}
          iconCreateFunction={clusterIcon}
        >
          {clustered.map(renderMarker)}
        </MarkerClusterGroup>
        {pinned.map(renderMarker)}
        <ClusterPicker groupRef={groupRef} stops={validStops} onCluster={setClusterIds} />
        <FitBounds stops={validStops} bottomPadding={bottomPadding} paused={!!highlightId || !!segmentIds} />
        <FocusSelection stops={validStops} highlightId={highlightId} segmentIds={segmentIds} bottomPadding={bottomPadding} />
        <FocusRouteButton stops={validStops} bottomOffset={bottomPadding} />

      </MapContainer>

      {/* Overlapping stops — pick one instead of guessing */}
      {clusterStops.length > 0 && (
        <div
          dir="rtl"
          className="absolute inset-x-3 top-3 z-[700] bg-card border border-border rounded-2xl shadow-lg overflow-hidden"
          style={{ maxHeight: "55%" }}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
            <div className="text-[13px] font-semibold">{clusterStops.length} תחנות באזור הזה</div>
            <button
              type="button"
              onClick={() => setClusterIds(null)}
              aria-label="סגור רשימת תחנות"
              className="w-9 h-9 rounded-full inline-flex items-center justify-center text-muted-foreground"
            >
              <X size={16} />
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: 220 }}>
            {clusterStops.map((s) => {
              const color = TYPE_PIN_COLOR[s.type] ?? "#6C63FF";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setClusterIds(null); onPinTap?.(s.id); }}
                  className="w-full min-h-11 px-3 py-2 flex items-center gap-2.5 text-right border-b border-border/60 last:border-b-0"
                >
                  <span
                    className="w-6 h-6 rounded-full text-[11px] font-bold text-white inline-flex items-center justify-center shrink-0 tabular-nums"
                    style={{ background: color }}
                  >
                    {s.index}
                  </span>
                  <span
                    className="w-5 h-5 shrink-0"
                    aria-hidden
                    dangerouslySetInnerHTML={{ __html: iconSvg(s.type, 16, color) }}
                  />
                  <span className="flex-1 min-w-0 text-[13px] truncate">{s.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
