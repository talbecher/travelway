import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
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

function FitBounds({ stops }: { stops: MapStop[] }) {
  const map = useMap();
  useEffect(() => {
    if (stops.length === 0) return;
    if (stops.length === 1) {
      map.setView([stops[0].lat, stops[0].lng], 14, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [stops, map]);
  return null;
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
  const center: [number, number] = stops[0]
    ? [stops[0].lat, stops[0].lng]
    : [35.6812, 139.7671];

  console.log("[DayMap] stops", stops.length, stops);
  const path = stops.map((s) => [s.lat, s.lng] as [number, number]);

  return (
    <>
      <style>{POPUP_STYLE}</style>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom
        style={{ width: "100%", height: "100%", background: "#EDEDED" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap &copy; CartoDB'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {path.length >= 2 && (
          <Polyline
            positions={path}
            pathOptions={{ color: "#6C63FF", weight: 3, opacity: 0.7, dashArray: "8, 6" }}
          />
        )}
        {stops.map((s) => {
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
        <FitBounds stops={stops} />
      </MapContainer>
    </>
  );
}
