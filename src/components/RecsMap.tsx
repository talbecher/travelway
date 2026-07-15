import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { Locate } from "lucide-react";
import { MapSkeleton } from "@/components/MapSkeleton";

export type RecPin = {
  id: string;
  lat: number;
  lng: number;
  type: string;
  name: string;
  city: string | null;
  address: string | null;
  status: string;
  rating: number | null;
  google_maps_url: string | null;
  notes?: string | null;
  photo_url?: string | null;
};

const TYPE_COLOR: Record<string, { bg: string; fg: string; ring: string }> = {
  food: { bg: "#FF6B6B", fg: "#fff", ring: "#B23A3A" },
  attraction: { bg: "#6C63FF", fg: "#fff", ring: "#3E39A8" },
  hotel: { bg: "#F5B301", fg: "#1a1a1a", ring: "#8A6400" },
};

const TYPE_EMOJI: Record<string, string> = {
  food: "🍜",
  attraction: "⛩",
  hotel: "🏨",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === '"' ? "&quot;" : "&#39;",
  );
}

function truncate(s: string, n = 18): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function pinIcon(type: string, name: string, status: string): L.DivIcon {
  const c = TYPE_COLOR[type] ?? TYPE_COLOR.attraction;
  const emoji = TYPE_EMOJI[type] ?? "•";
  const label = escapeHtml(truncate(name || ""));

  const isVisited = status === "visited";
  const isSkipped = status === "skipped";
  const pinOpacity = isVisited ? 0.9 : isSkipped ? 0.5 : 1;
  const labelOpacity = isSkipped ? 0.55 : 1;
  const labelDecoration = isSkipped ? "line-through" : "none";

  const statusOverlay = isVisited
    ? `<div style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#22c55e;border:2px solid #fff;color:#fff;font-size:11px;line-height:14px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.3);font-weight:700;">✓</div>`
    : isSkipped
      ? `<div style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#6b7280;border:2px solid #fff;color:#fff;font-size:12px;line-height:14px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.3);font-weight:700;">✕</div>`
      : "";

  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="position:relative;opacity:${pinOpacity};">
        <div style="width:38px;height:38px;border-radius:50%;background:${c.bg};border:2.5px solid #fff;outline:1.5px solid ${c.ring};box-shadow:0 3px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;color:${c.fg};pointer-events:auto;">${emoji}</div>
        ${statusOverlay}
      </div>
      <div style="margin-top:3px;background:rgba(20,20,20,0.85);color:#fff;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:500;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.4);max-width:150px;overflow:hidden;text-overflow:ellipsis;opacity:${labelOpacity};text-decoration:${labelDecoration};">${label}</div>
    </div>`,
    iconSize: [150, 68],
    iconAnchor: [75, 19],
  });
}

function userIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#4A90E2;border:3px solid #fff;box-shadow:0 0 0 4px rgba(74,144,226,0.3);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function clusterIcon(cluster: { getChildCount: () => number }): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 30 ? 42 : 48;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#6C63FF,#8B7FFF);border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.4);color:#fff;font-weight:700;font-size:${count < 10 ? 13 : 14}px;display:flex;align-items:center;justify-content:center;">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitAll({ pins, user }: { pins: RecPin[]; user: { lat: number; lng: number } | null }) {
  const map = useMap();
  const key = pins.map((p) => `${p.lat},${p.lng}`).join("|");
  useEffect(() => {
    if (!map) return;
    const timer = setTimeout(() => {
      try {
        if (pins.length === 0) {
          map.setView([35.6762, 139.6503], 10, { animate: true });
          return;
        }
        if (pins.length === 1 && !user) {
          map.setView([pins[0].lat, pins[0].lng], 15, { animate: true });
          return;
        }
        const pts: [number, number][] = pins.map((p) => [p.lat, p.lng]);
        if (user) pts.push([user.lat, user.lng]);
        const bounds = L.latLngBounds(pts);
        if (bounds.isValid()) {
          const padding: [number, number] = pins.length <= 5 ? [60, 60] : [50, 50];
          map.fitBounds(bounds, { padding, maxZoom: 14, animate: true });
        }
      } catch (e) {
        console.warn("fitBounds failed", e);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [key, user, map, pins]);
  return null;
}

function LocateButton({ userPos, onNoGeo }: { userPos: { lat: number; lng: number } | null; onNoGeo: () => void }) {
  const map = useMap();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!userPos) { onNoGeo(); return; }
        map.setView([userPos.lat, userPos.lng], 15, { animate: true });
      }}
      aria-label="התמקד עלי"
      style={{
        position: "absolute", bottom: 16, right: 12, zIndex: 500,
        width: 40, height: 40, borderRadius: 999,
        background: "#fff", border: "1px solid rgba(0,0,0,0.15)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        color: userPos ? "#4A90E2" : "#9ca3af",
      }}
    >
      <Locate size={18} />
    </button>
  );
}

function LegendRow({ color, emoji, label }: { color: string; emoji: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
      <span style={{
        width: 16, height: 16, borderRadius: "50%",
        background: color, border: "1.5px solid #fff",
        outline: "1px solid rgba(0,0,0,0.2)",
        fontSize: 10, display: "inline-flex",
        alignItems: "center", justifyContent: "center",
      }}>{emoji}</span>
      <span>{label}</span>
    </div>
  );
}

function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        position: "absolute", top: 12, left: 12, zIndex: 500,
        background: "rgba(255,255,255,0.96)",
        border: "1px solid rgba(0,0,0,0.1)",
        borderRadius: 10,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        fontSize: 11, lineHeight: 1.4,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          background: "transparent", border: "none",
          padding: "6px 10px", fontSize: 11, cursor: "pointer",
          color: "#1f2937", fontWeight: 600,
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        {open ? "▾" : "▸"} מקרא
      </button>
      {open && (
        <div style={{ padding: "4px 10px 8px", color: "#1f2937", minWidth: 130 }}>
          <LegendRow color="#FF6B6B" emoji="🍜" label="אוכל" />
          <LegendRow color="#6C63FF" emoji="⛩" label="אטרקציה" />
          <LegendRow color="#F5B301" emoji="🏨" label="לינה" />
          <div style={{ height: 1, background: "rgba(0,0,0,0.08)", margin: "6px 0" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{
              width: 14, height: 14, borderRadius: "50%",
              background: "#22c55e", color: "#fff", fontSize: 9,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700,
            }}>✓</span>
            <span>ביקרנו</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 14, height: 14, borderRadius: "50%",
              background: "#6b7280", color: "#fff", fontSize: 10,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700,
            }}>✕</span>
            <span>דילגנו</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecsMap({
  pins,
  userPos,
  onAddToDay,
}: {
  pins: RecPin[];
  userPos: { lat: number; lng: number } | null;
  onAddToDay: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const validPins = useMemo(() => pins.filter(
    (p) =>
      Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
      p.lat >= -90 && p.lat <= 90 &&
      p.lng >= -180 && p.lng <= 180 &&
      !(p.lat === 0 && p.lng === 0),
  ), [pins]);

  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (validPins.length < 6) { setShowHint(false); return; }
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(t);
  }, [validPins.length]);

  const [geoError, setGeoError] = useState(false);
  useEffect(() => {
    if (!geoError) return;
    const t = setTimeout(() => setGeoError(false), 2500);
    return () => clearTimeout(t);
  }, [geoError]);

  const center: [number, number] = validPins[0]
    ? [validPins[0].lat, validPins[0].lng]
    : userPos
    ? [userPos.lat, userPos.lng]
    : [35.6762, 139.6503];

  if (!mounted) return <MapSkeleton />;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapContainer
        center={center}
        zoom={validPins.length === 1 ? 15 : 12}
        scrollWheelZoom
        zoomControl
        maxZoom={19}
        minZoom={3}
        style={{ width: "100%", height: "100%", background: "#EDEDED" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap &copy; CartoDB'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maxZoom={19}
          minZoom={3}
        />

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={45}
          disableClusteringAtZoom={15}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          iconCreateFunction={clusterIcon}
        >
          {validPins.map((p) => (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={pinIcon(p.type, p.name, p.status)}
              eventHandlers={{ click: () => onAddToDay(p.id) }}
            />
          ))}
        </MarkerClusterGroup>

        {userPos && (
          <Marker position={[userPos.lat, userPos.lng]} icon={userIcon()} zIndexOffset={1000} />
        )}
        <FitAll pins={validPins} user={userPos} />
        <LocateButton userPos={userPos} onNoGeo={() => setGeoError(true)} />
      </MapContainer>
      <Legend />
      {validPins.length === 0 && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          pointerEvents: "none", padding: 24, zIndex: 500,
        }}>
          <div style={{
            background: "var(--card)", color: "var(--foreground)",
            border: "1px solid var(--border)", borderRadius: 12,
            padding: "12px 16px", fontSize: 13, textAlign: "center",
            maxWidth: 320, boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}>
            📍 אין מיקומים שמורים — הוסף המלצות עם לינק גוגל מפות כדי שיופיעו כאן
          </div>
        </div>
      )}
      {showHint && (
        <div style={{
          position: "absolute", bottom: 16, left: "50%",
          transform: "translateX(-50%)", zIndex: 500,
          background: "rgba(0,0,0,0.75)", color: "#fff",
          padding: "6px 12px", borderRadius: 999, fontSize: 12,
          pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          🔍 לחץ על אשכול להתפזרות · לחץ על פין לפרטים
        </div>
      )}
      {geoError && (
        <div style={{
          position: "absolute", bottom: 64, right: 12, zIndex: 600,
          background: "rgba(0,0,0,0.8)", color: "#fff",
          padding: "6px 10px", borderRadius: 8, fontSize: 11,
          pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          אין הרשאת מיקום
        </div>
      )}
    </div>
  );
}
