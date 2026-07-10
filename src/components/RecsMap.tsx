import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { TYPE_PIN_COLOR } from "@/lib/coords";

export type RecPin = {
  id: string;
  lat: number;
  lng: number;
  type: string;
  name: string;
};

function pinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:2px solid #0F0F13;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function userIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#3B82F6;border:2px solid #fff;box-shadow:0 0 0 6px rgba(59,130,246,0.25);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function FitAll({ pins, user }: { pins: RecPin[]; user: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = pins.map((p) => [p.lat, p.lng]);
    if (user) pts.push([user.lat, user.lng]);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0], 13, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
  }, [pins, user, map]);
  return null;
}

export default function RecsMap({
  pins,
  userPos,
  onPinTap,
}: {
  pins: RecPin[];
  userPos: { lat: number; lng: number } | null;
  onPinTap?: (id: string) => void;
}) {
  const center: [number, number] = pins[0]
    ? [pins[0].lat, pins[0].lng]
    : userPos
    ? [userPos.lat, userPos.lng]
    : [35.6812, 139.7671];

  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom style={{ width: "100%", height: "100%", background: "#1A1A23" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pins.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={pinIcon(TYPE_PIN_COLOR[p.type] ?? "#6C63FF")}
          eventHandlers={{ click: () => onPinTap?.(p.id) }}
        />
      ))}
      {userPos && <Marker position={[userPos.lat, userPos.lng]} icon={userIcon()} />}
      <FitAll pins={pins} user={userPos} />
    </MapContainer>
  );
}
