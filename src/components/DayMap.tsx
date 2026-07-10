import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { TYPE_PIN_COLOR } from "@/lib/coords";

export type MapStop = {
  id: string;
  lat: number;
  lng: number;
  type: string;
  index: number;
  title: string;
};

function pinIcon(color: string, index: number, highlighted: boolean): L.DivIcon {
  const ring = highlighted
    ? `box-shadow:0 0 0 3px ${color}55, 0 0 0 6px ${color}22;`
    : "box-shadow:0 2px 6px rgba(0,0,0,0.35);";
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};color:#0F0F13;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;border:2px solid #0F0F13;${ring}">${index}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
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
    : [35.6812, 139.7671]; // Tokyo fallback

  const path = stops.map((s) => [s.lat, s.lng] as [number, number]);

  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom
      style={{ width: "100%", height: "100%", background: "#1A1A23" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {path.length >= 2 && (
        <Polyline
          positions={path}
          pathOptions={{ color: "#6C63FF", weight: 3, opacity: 0.6, dashArray: "6 8" }}
        />
      )}
      {stops.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lng]}
          icon={pinIcon(TYPE_PIN_COLOR[s.type] ?? "#6C63FF", s.index, highlightId === s.id)}
          eventHandlers={{ click: () => onPinTap?.(s.id) }}
        />
      ))}
      <FitBounds stops={stops} />
    </MapContainer>
  );
}
