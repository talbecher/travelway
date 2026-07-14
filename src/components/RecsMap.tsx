import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
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

function pinIcon(type: string, name: string): L.DivIcon {
  const c = TYPE_COLOR[type] ?? TYPE_COLOR.attraction;
  const emoji = TYPE_EMOJI[type] ?? "•";
  const label = escapeHtml(truncate(name || ""));
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="
        width:38px;height:38px;border-radius:50%;
        background:${c.bg};
        border:2.5px solid #fff;
        outline:1.5px solid ${c.ring};
        box-shadow:0 3px 10px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
        font-size:19px;line-height:1;color:${c.fg};
        pointer-events:auto;
      ">${emoji}</div>
      <div style="
        margin-top:3px;
        background:rgba(20,20,20,0.85);
        color:#fff;
        padding:2px 7px;
        border-radius:6px;
        font-size:11px;
        font-weight:500;
        white-space:nowrap;
        box-shadow:0 1px 3px rgba(0,0,0,0.4);
        max-width:150px;
        overflow:hidden;
        text-overflow:ellipsis;
      ">${label}</div>
    </div>`,
    iconSize: [150, 68],
    iconAnchor: [75, 19],
  });
}

function userIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:16px;height:16px;border-radius:50%;
      background:#4A90E2;
      border:3px solid #fff;
      box-shadow:0 0 0 4px rgba(74,144,226,0.3);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
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


function statusBadge(status: string) {
  if (status === "visited") {
    return {
      label: "ביקרנו",
      style: {
        background: "color-mix(in oklab, var(--accent-3) 18%, transparent)",
        color: "var(--accent-3)",
      } as React.CSSProperties,
    };
  }
  if (status === "skipped") {
    return {
      label: "דילגנו",
      style: {
        background: "var(--muted)",
        color: "var(--muted-foreground)",
        textDecoration: "line-through",
      } as React.CSSProperties,
    };
  }
  return {
    label: "רשימה",
    style: {
      background: "var(--muted)",
      color: "var(--muted-foreground)",
    } as React.CSSProperties,
  };
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

  const validPins = pins.filter(
    (p) =>
      Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
      p.lat >= -90 && p.lat <= 90 &&
      p.lng >= -180 && p.lng <= 180 &&
      !(p.lat === 0 && p.lng === 0),
  );

  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (validPins.length < 6) { setShowHint(false); return; }
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(t);
  }, [validPins.length]);

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

      {validPins.map((p) => {
        const badge = statusBadge(p.status);
        return (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(p.type, p.name)}>
            <Popup className="custom-popup" closeButton={false} minWidth={220} maxWidth={280}>
              <div style={{ minWidth: 200, maxWidth: 260, color: "#1f2937" }}>
                {p.photo_url && (
                  <img
                    src={p.photo_url}
                    alt={p.name}
                    style={{
                      width: "100%", height: 100, objectFit: "cover",
                      borderRadius: 6, marginBottom: 6, display: "block",
                    }}
                    loading="lazy"
                  />
                )}
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }} dir="ltr">{p.name}</div>
                {(p.city || p.address) && (
                  <div style={{ fontSize: 12, color: "#374151", marginTop: 2 }} dir="ltr">
                    {p.city}{p.address ? ` · ${p.address}` : ""}
                  </div>
                )}
                <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 999,
                    ...badge.style,
                  }}>{badge.label}</span>
                  {p.status === "visited" && p.rating && (
                    <span style={{ fontSize: 11, color: "#d97706" }}>
                      {"★".repeat(p.rating)}{"☆".repeat(5 - p.rating)}
                    </span>
                  )}
                </div>
                {p.notes && (
                  <div style={{
                    fontSize: 12, marginTop: 8, lineHeight: 1.4,
                    color: "#1f2937",
                    whiteSpace: "pre-line",
                    maxHeight: 120, overflowY: "auto",
                    padding: "6px 8px", background: "#f3f4f6", borderRadius: 6,
                  }}>
                    {p.notes}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {p.google_maps_url ? (
                    <a
                      href={p.google_maps_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        flex: 1, height: 32, borderRadius: 6,
                        border: "1px solid var(--border)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, textDecoration: "none", color: "inherit",
                      }}
                    >
                      🗺 ניווט
                    </a>
                  ) : (
                    <span style={{
                      flex: 1, height: 32, borderRadius: 6,
                      border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, opacity: 0.4,
                    }}>🗺 ניווט</span>
                  )}
                  <button
                    onClick={() => onAddToDay(p.id)}
                    style={{
                      flex: 1, height: 32, borderRadius: 6,
                      background: "var(--accent)", color: "#fff",
                      fontSize: 12, border: "none", cursor: "pointer",
                    }}
                  >
                    + הוסף ליום
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
      {userPos && (
        <Marker position={[userPos.lat, userPos.lng]} icon={userIcon()} zIndexOffset={1000} />
      )}
      <FitAll pins={validPins} user={userPos} />
    </MapContainer>
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
        🔍 זום פנימה לצפייה בפינים קרובים
      </div>
    )}
    </div>
  );
}
