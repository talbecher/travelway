import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Image as ImageIcon, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/BottomSheet';
import { toast } from 'sonner';
import { businessMapsLink } from '@/lib/place-identity';
import { recommendationBusinessMedia, reviewRecommendationIdentities, applyRecommendationIdentity } from '@/lib/place-identity.functions';

export function RecommendationBusiness({ id, placeId, name, tripId, onPhoto }: { id: string; placeId?: string | null; name: string; tripId: string; onPhoto: (url: string | null) => void }) {
  const fetchMedia = useServerFn(recommendationBusinessMedia);
  const [media, setMedia] = useState<Awaited<ReturnType<typeof fetchMedia>> | null>(null);
  const [busy, setBusy] = useState(false);
  const link = businessMapsLink(placeId, name);
  if (!link) return null;
  return <div className="mt-2 space-y-1" onClick={event => event.stopPropagation()}>
    <div className="flex flex-wrap gap-1">
      <Button variant="link" size="sm" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink /> כרטיס העסק ב־Google Maps</a></Button>
      {!media && <Button variant="ghost" size="sm" disabled={busy} onClick={async () => {
        if (busy) return;
        setBusy(true);
        try { const result = await fetchMedia({ data: { tripId, id } }); setMedia(result); onPhoto(result.photo); }
        catch { toast.error('פרטי Google לא זמינים כרגע'); }
        finally { setBusy(false); }
      }}><ImageIcon />{busy ? 'טוען…' : 'תמונה ודירוג'}</Button>}
    </div>
    {media && <div className="text-xs text-muted-foreground">
      {media.rating != null && <span dir="ltr">★ {media.rating} ({media.count ?? 0}) · Google Maps</span>}
      {media.error && <span role="status">{media.error}</span>}
      {!media.error && media.rating == null && !media.photo && <span>אין תמונה או דירוג זמינים · Google Maps</span>}
      {media.photo && <div>Google Maps · {media.authors.map((author: { name: string; uri: string | null }, index: number) => author.uri?.startsWith('https://') ? <a className="underline" key={index} href={author.uri} target="_blank" rel="noreferrer">{author.name} </a> : <span key={index}>{author.name} </span>)}</div>}
    </div>}
  </div>;
}

type Report = Awaited<ReturnType<typeof reviewRecommendationIdentities>>;
const labels: Record<string, string> = { existing: 'מזהה קיים — ללא חיפוש', confident: 'התאמה חזקה', ambiguous: 'לא חד־משמעי — ללא שיוך', no_match: 'לא נמצא', pin_only: 'אין נקודה מפורשת — ללא חיפוש', api_failure: 'חיפוש נכשל — ללא שיוך' };
export function RecommendationIdentityReview({ tripId }: { tripId: string }) {
  const review = useServerFn(reviewRecommendationIdentities);
  const apply = useServerFn(applyRecommendationIdentity);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);
  const last = reports.at(-1);
  const rows = reports.flatMap(report => report.results);
  const counts = rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});
  async function run() {
    if (busy) return;
    setBusy(true);
    try { const result = await review({ data: { tripId, after: last?.next } }); setReports(previous => [...previous, result]); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'הבדיקה נכשלה'); }
    finally { setBusy(false); }
  }
  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Search />בדיקת שיוך לעסקים</Button>
    <BottomSheet open={open} onOpenChange={setOpen} title="בדיקת שיוך ל־Google">
      <div dir="rtl" className="space-y-3">
        <p className="text-xs text-muted-foreground">חיפוש Google עשוי להיות בתשלום. עד 5 המלצות בסבב; אין שמירה עד לאישור כל התאמה. הדוח נשמר רק כל עוד העמוד פתוח.</p>
        {rows.length > 0 && <p className="text-xs">נבדקו {rows.length} · בקשות חיפוש {reports.reduce((sum, report) => sum + report.requests, 0)} · מזהים קיימים {counts.existing ?? 0} · חזקות {counts.confident ?? 0} · בספק {counts.ambiguous ?? 0} · לא נמצאו {counts.no_match ?? 0} · תמונה חסרה/לא קבועה {rows.filter(row => row.missingPhoto).length}</p>}
        {rows.map(row => <div key={row.id} className="border-b border-border py-2 text-sm">
          <bdi className="font-semibold break-words">{row.name}</bdi>
          <div className="text-xs text-muted-foreground">{labels[row.status]}</div>
          {row.candidates.map(candidate => <div key={candidate.id} className="mt-1 text-xs break-words"><bdi>{candidate.name}</bdi> · <bdi>{candidate.address}</bdi> · {candidate.distance} מ׳</div>)}
          {row.error && <div className="text-xs text-destructive">{row.error}</div>}
          {row.review && <Button variant="outline" size="sm" disabled={busy || applied.includes(row.id)} onClick={async () => {
            if (!row.review || !confirm(`לשייך את ${row.name} ל־${row.proposed?.name}? רק מזהה העסק ישתנה; הנקודה והקישור יישארו.`)) return;
            setBusy(true);
            try { await apply({ data: row.review }); setApplied(previous => [...previous, row.id]); qc.invalidateQueries({ queryKey: ['recs'] }); toast.success('זהות העסק שויכה'); }
            catch (error) { toast.error(error instanceof Error ? error.message : 'השיוך לא נשמר'); }
            finally { setBusy(false); }
          }}>{applied.includes(row.id) ? 'שויך' : 'אישור שיוך זהות בלבד'}</Button>}
        </div>)}
        {(!last || last.next) && <Button variant="outline" disabled={busy} onClick={run}>{busy ? 'בודק…' : last ? 'המשך — עד 5 נוספות' : 'בדיקה בלבד — עד 5 המלצות'}</Button>}
      </div>
    </BottomSheet>
  </>;
}