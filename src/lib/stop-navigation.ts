/** Fields the Live Now navigation link reads. */
export type NavigationTarget = {
  title: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  google_maps_url?: string | null;
};

/** Live Now navigation link: coordinates first, then the saved Maps link, then a name search. */
export function navigationHref(entry: NavigationTarget) {
  if (entry.latitude != null && entry.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${entry.latitude},${entry.longitude}`;
  }
  if (entry.google_maps_url) return entry.google_maps_url;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.title)}`;
}

export function canNavigate(entry: NavigationTarget) {
  return (entry.latitude != null && entry.longitude != null) || !!entry.google_maps_url;
}
