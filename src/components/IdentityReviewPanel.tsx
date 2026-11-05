import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { reviewRecommendationIdentities, applyRecommendationIdentities } from '@/lib/place-identity.functions';
import { BATCH_SIZE, SCAN_CAP, emptyIdentityProgress, persistIdentityProgress, type IdentityProgress } from '@/lib/identity-progress';

type Row = Awaited<ReturnType<typeof reviewRecommendationIdentities>>['results'][number];
const labels: Record<string,string> = { confident: 'התאמה חזקה', ambiguous: 'לא חד־משמעי', no_match: 'לא נמצא', pin_only: 'ללא נקודה', existing: 'כבר משויך', api_failure: 'החיפוש נכשל' };
export function IdentityReviewPanel({ tripId, imported = false }: { tripId: string; imported?: boolean }) {
  const scan = useServerFn(reviewRecommendationIdentities);
  const apply = useServerFn(applyRecommendationIdentities);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<IdentityProgress>(emptyIdentityProgress);
  const [rows, setRows] = useState<Row[]>([]);
  const [cap, setCap] = useState(100);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState(imported ? 'import' : 'all');
  const key = useRef<string | null>(null);
  const stop = useRef(false);
  useEffect(() => {
    let active = true;
    setReady(false); setRows([]); setProgress(emptyIdentityProgress());
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      key.current = `identity-progress:${data.user.id}:${tripId}:${mode}`;
      try { const saved = localStorage.getItem(key.current); if (saved) setProgress(JSON.parse(saved)); } catch { /* unavailable storage */ }
      setReady(true);
    });
    return () => { active = false; stop.current = true; };
  }, [tripId, mode]);
  function save(next: IdentityProgress) {
    setProgress(next);
    try { if (key.current) localStorage.setItem(key.current, persistIdentityProgress(next)); } catch { toast.error('לא ניתן לשמור התקדמות לאחר רענון'); }
  }
  async function run(retry = false) {
    if (busy || !ready) return;
    setBusy(true); stop.current = false;
    let current = { ...progress };
    // After reload, re-create expiring signed receipts by an explicitly approved bounded scan.
    const queue = retry ? [...new Set([...current.pending, ...current.deferred])] : [...current.pending.filter(id => !rows.some(row => row.id === id))];
    let remaining = Math.max(1, Math.min(SCAN_CAP, Math.floor(cap)));
    try {
      while (remaining > 0 && !stop.current) {
        const ids = queue.length ? queue.slice(0, Math.min(BATCH_SIZE, remaining)) : current.scope?.slice(0, Math.min(BATCH_SIZE, remaining));
        if (!ids?.length && (retry || current.done || current.scope)) break;
        const report = await scan({ data: { tripId, limit: Math.min(BATCH_SIZE, remaining), ...(ids?.length ? { ids } : { after: current.after }) } });
        setRows(previous => [...previous.filter(row => !report.results.some(result => result.id === row.id)), ...report.results]);
        const processed = report.results.map(row => row.id);
        const confident = report.results.filter(row => row.review).map(row => row.id);
        const deferred = report.results.filter(row => !row.review).map(row => row.id);
        current = { ...current, pending: [...new Set([...current.pending.filter(id => !processed.includes(id)), ...confident])], deferred: [...new Set([...current.deferred.filter(id => !processed.includes(id)), ...deferred])], scanned: current.scanned + processed.length, requests: current.requests + report.requests };
        if (queue.length) for (const id of processed) { const index = queue.indexOf(id); if (index >= 0) queue.splice(index, 1); }
        else if (current.scope) current.scope = current.scope.filter(id => !processed.includes(id));
        else { current.after = report.next; current.done = !report.next && !report.stopped; }
        if (report.deferred) current.deferred = [...new Set([...current.deferred, report.deferred])];
        save(current); remaining -= ids?.length ?? Math.min(remaining, Math.max(processed.length, BATCH_SIZE));
        if (report.stopped) { toast.error('החיפוש נעצר; ההמלצות שנותרו ממתינות להמשך'); break; }
        // Scoped IDs already assigned/deleted are absent from the missing-identity query.
        if (ids && !report.stopped) {
          if (queue.length) for (const id of ids) { const index = queue.indexOf(id); if (index >= 0) queue.splice(index, 1); }
          if (current.scope) current.scope = current.scope.filter(id => !ids.includes(id));
          current.pending = current.pending.filter(id => !ids.includes(id) || processed.includes(id));
          save(current);
        }
      }
    } catch { toast.error('הבדיקה נעצרה; אפשר להמשיך ללא ייבוא חוזר'); }
    finally { setBusy(false); }
  }
  async function applyAll() {
    const approved = rows.filter(row => row.review && progress.pending.includes(row.id));
    if (busy || !approved.length || !confirm(`לאשר שיוך של ${approved.length} התאמות חזקות שנבדקו? רק מזהה העסק ישתנה.`)) return;
    setBusy(true); stop.current = false;
    let current = { ...progress };
    try {
      for (let i = 0; i < approved.length && !stop.current; i += BATCH_SIZE) {
        const batch = approved.slice(i, i + BATCH_SIZE);
        const result = await apply({ data: { tripId, receipts: batch.flatMap(row => row.review ? [row.review] : []) } });
        for (const [index, outcome] of result.results.entries()) {
          const id = batch[index]?.id;
          if (outcome.status === 'applied') current.applied++;
          else if (outcome.status === 'skipped') current.skipped++;
          else current.failed++;
          if (id && outcome.status !== 'failed') current.pending = current.pending.filter(value => value !== id);
        }
        save({ ...current });
      }
      await qc.invalidateQueries({ queryKey: ['recs'] });
    } catch { toast.error('האישור נעצר; אפשר לחדש. רשומות שכבר שויכו לא יידרסו'); }
    finally { setBusy(false); }
  }
  const available = rows.filter(row => row.review && progress.pending.includes(row.id)).length;
  return <div dir="rtl" className="space-y-3">
    {!imported && <select aria-label="קבוצת המלצות לבדיקה" disabled={busy} value={mode} onChange={event => setMode(event.target.value)} className="min-h-11 w-full border border-border bg-background rounded-md px-2"><option value="all">כל ההמלצות ללא מזהה</option><option value="import">המלצות חדשות מייבוא מפות</option></select>}
    <div className="flex flex-wrap items-center gap-2"><label htmlFor="identity-cap" className="text-sm">מגבלת בדיקה</label><input id="identity-cap" type="number" min={1} max={SCAN_CAP} value={cap} disabled={busy} onChange={event => setCap(Number(event.target.value) || 1)} className="h-11 w-24 border border-border rounded-md bg-background px-2" /><span className="text-xs text-muted-foreground">עד 1,200 · חיפוש Google עשוי להיות בתשלום</span></div>
    <p role="status" className="text-sm">נבדקו {progress.scanned} · בקשות {progress.requests} · לאישור {progress.pending.length} · נדחו לבדיקה {progress.deferred.length} · טרם נסרקו {progress.scope?.length ?? (progress.done ? 0 : 'בהמשך')}<br/>שויכו {progress.applied} · דולגו {progress.skipped} · נכשלו {progress.failed}</p>
    <div className="flex flex-wrap gap-2">
      <Button className="min-h-11" disabled={busy || !ready} variant="outline" onClick={() => run()}>סריקה מוגבלת / המשך</Button>
      <Button className="min-h-11" disabled={busy || !ready || !progress.pending.length && !progress.deferred.length} variant="outline" onClick={() => run(true)}>בדיקה חוזרת לממתינות</Button>
      {busy && <Button variant="outline" className="min-h-11" onClick={() => { stop.current = true; }}>עצירה אחרי הקבוצה</Button>}
      <Button className="min-h-11" disabled={busy || !available} onClick={applyAll}>אישור מרוכז — {available} התאמות חזקות</Button>
    </div>
    {progress.pending.length > available && <p className="text-xs text-muted-foreground">אחרי רענון יש לבדוק מחדש את הממתינות לפני אישור.</p>}
    <div className="max-h-[45dvh] overflow-auto">{rows.map(row => <div key={row.id} className="border-b border-border py-2 text-sm break-words"><bdi className="font-semibold">{row.name}</bdi> · {labels[row.status]}{row.candidates.map(candidate => <div key={candidate.id} className="text-xs text-muted-foreground"><bdi>{candidate.name}</bdi> · <bdi>{candidate.address}</bdi> · {candidate.distance} מ׳</div>)}</div>)}</div>
  </div>;
}
