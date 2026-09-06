import { useEffect, useState } from "react";
import { MapSkeleton } from "@/components/MapSkeleton";
import { MapContainer, TileLayer, Marker, Polyline, Popup, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { Maximize2 } from "lucide-react";
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

const TYPE_EMOJI: Record<string, string> = {
  food: "🍜",
  attraction: "⛩",
  transport: "🚆",
  hotel: "🏨",
  hotel_checkin: "🏨",
  flight: "✈️",
  note: "📝",
};

function pinIcon(color: string, index: number, highlighted: boolean): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="day-pin${highlighted ? " is-highlighted" : ""}" style="
      width:32px;height:32px;border-radius:50%;
      background:${color};color:#fff;
      border:2px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;
      font-size:13px;font-weight:600;
      ${highlighted ? `outline:2px solid ${color};outline-offset:2px;` : ""}
    ">${index}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
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

function FitBounds({ stops }: { stops: MapStop[] }) {
  const map = useMap();
  const key = stops.map((s) => `${s.lat},${s.lng}`).join("|");
  useEffect(() => {
    if (!map) return;
    const timer = setTimeout(() => {
      try {
        if (stops.length === 0) return;
        if (stops.length === 1) {
          map.setView([stops[0].lat, stops[0].lng], 14, { animate: true });
          return;
        }
        const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number]));
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true });
        }
      } catch (e) {
        console.warn("fitBounds failed", e);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [key, map, stops]);
  return null;
}


function FocusRouteButton({ stops }: { stops: MapStop[] }) {
  const map = useMap();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (stops.length === 0) return;
        if (stops.length === 1) {
          map.setView([stops[0].lat, stops[0].lng], 15, { animate: true });
          return;
        }
        const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number]));
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
      }}
      aria-label="התמקד למסלול"
      style={{
        position: "absolute", bottom: 16, right: 12, zIndex: 500,
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

function clusterIcon(cluster: { getChildCount: () => number }): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : 40;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#6C63FF,#8B7FFF);border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.4);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const POPUP_STYLE = `
.day-pin { transition: transform .2s ease; }
.day-pin.is-highlighted { transform: scale(1.3); z-index: 1000; }
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
}: {
  stops: MapStop[];
  highlightId?: string | null;
  onPinTap?: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const validStops = stops.filter(
    (s) =>
      Number.isFinite(s.lat) && Number.isFinite(s.lng) &&
      s.lat >= -90 && s.lat <= 90 &&
      s.lng >= -180 && s.lng <= 180 &&
      !(s.lat === 0 && s.lng === 0),
  );

  const center: [number, number] = validStops[0]
    ? [validStops[0].lat, validStops[0].lng]
    : [35.6812, 139.7671];

  console.log("[DayMap] stops", validStops.length, validStops);
  const path = validStops.map((s) => [s.lat, s.lng] as [number, number]);

  if (!mounted) return <MapSkeleton />;


  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <style>{POPUP_STYLE}</style>
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
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maxZoom={19}
          minZoom={3}
        />

        {path.length >= 2 && (
          <Polyline
            positions={path}
            pathOptions={{
              color: "#6C63FF",
              weight: 4,
              opacity: 0.85,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        )}
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={40}
          disableClusteringAtZoom={14}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          iconCreateFunction={clusterIcon}
        >
          {validStops.map((s) => {
            const color = TYPE_PIN_COLOR[s.type] ?? "#6C63FF";
            const emoji = TYPE_EMOJI[s.type] ?? "•";
            return (
              <Marker
                key={s.id}
                position={[s.lat, s.lng]}
                icon={pinIcon(color, s.index, highlightId === s.id)}
                eventHandlers={{ click: () => onPinTap?.(s.id) }}
              >
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
                      <div style={{ fontWeight: 600 }}>
                        <span style={{ marginInlineEnd: 4 }}>{emoji}</span>
                        {s.title}
                      </div>
                      {s.time && (
                        <div style={{ fontSize: 11, opacity: 0.7, direction: "ltr" }}>{s.time}</div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
        <FitBounds stops={validStops} />
        <FocusRouteButton stops={validStops} />
      </MapContainer>
    </div>
  );
}
