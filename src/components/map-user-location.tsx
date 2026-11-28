import { useMap } from "react-leaflet";
import L from "leaflet";
import { Locate } from "lucide-react";

/**
 * "My location" pieces shared by the Leaflet maps (RecsMap, DayMap). Imports Leaflet, so it
 * must only be imported from modules that are themselves loaded dynamically behind ClientOnly.
 */

export type UserPos = { lat: number; lng: number };

export function userLocationIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#4A90E2;border:3px solid #fff;box-shadow:0 0 0 4px rgba(74,144,226,0.3);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export function radiusBounds(user: UserPos, radiusM: number) {
  return L.latLng(user.lat, user.lng).toBounds(radiusM * 2);
}

export function LocateButton({
  userPos,
  onNoGeo,
  radiusM,
  bottom = 16,
}: {
  userPos: UserPos | null;
  onNoGeo: () => void;
  radiusM?: number;
  bottom?: number;
}) {
  const map = useMap();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!userPos) { onNoGeo(); return; }
        if (radiusM) map.fitBounds(radiusBounds(userPos, radiusM), { padding: [24, 24], animate: true });
        else map.setView([userPos.lat, userPos.lng], 15, { animate: true });
      }}
      aria-label={radiusM ? "למיקום שלי" : "התמקד עלי"}
      style={{
        position: "absolute", bottom, right: 12, zIndex: 500,
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

/** Short-lived bubble next to the locate button when there is no position (no permission / no GPS). */
export function GeoErrorBubble({ bottom = 64 }: { bottom?: number }) {
  return (
    <div style={{
      position: "absolute", bottom, right: 12, zIndex: 600,
      background: "rgba(0,0,0,0.8)", color: "#fff",
      padding: "6px 10px", borderRadius: 8, fontSize: 11,
      pointerEvents: "none", whiteSpace: "nowrap",
    }}>
      אין הרשאת מיקום
    </div>
  );
}
