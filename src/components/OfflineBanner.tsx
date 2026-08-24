import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/use-online";
import { getCacheTimestamp } from "@/lib/offline-persist";

function agoLabel(ts: number | null): string | null {
  if (!ts) return null;
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "עודכן ממש עכשיו";
  if (mins < 60) return `עודכן לפני ${mins} דק׳`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `עודכן לפני ${hours} שעות`;
  return `עודכן לפני ${Math.round(hours / 24)} ימים`;
}

export function OfflineBanner() {
  const online = useOnline();
  const [ts, setTs] = useState<number | null>(null);

  useEffect(() => {
    if (online) return;
    let alive = true;
    void getCacheTimestamp().then((v) => alive && setTs(v));
    return () => {
      alive = false;
    };
  }, [online]);

  if (online) return null;
  const ago = agoLabel(ts);

  return (
    <div
      dir="rtl"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 px-4 py-1.5 text-[12px] font-medium bg-[color:var(--terracotta)] text-white"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>אין חיבור · מוצגים נתונים שנשמרו{ago ? ` · ${ago}` : ""}</span>
    </div>
  );
}
