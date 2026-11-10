import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { ExternalLink, Image as ImageIcon, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/BottomSheet';
import { toast } from 'sonner';
import { IdentityReviewPanel } from './IdentityReviewPanel';
import { businessMapsLink } from '@/lib/place-identity';
import { recommendationBusinessMedia, reviewRecommendationIdentities, applyRecommendationIdentity } from '@/lib/place-identity.functions';
import { useQueryClient } from '@tanstack/react-query';

export function RecommendationBusiness({ id, placeId, name, tripId, onPhoto }: { id: string; placeId?: string | null; name: string; tripId: string; onPhoto: (url: string | null) => void }) {
  const fetchMedia = useServerFn(recommendationBusinessMedia);
  const [media, setMedia] = useState<Awaited<ReturnType<typeof fetchMedia>> | null>(null);
  const [busy, setBusy] = useState(false);
  const link = businessMapsLink(placeId, name);
  if (!link) return <FindBusiness id={id} tripId={tripId} />;
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
      {media.openNow != null && <span> · {media.openNow ? 'פתוח עכשיו' : 'סגור עכשיו'}</span>}
      {media.error && <span role="status">{media.error}</span>}
      {!media.error && media.rating == null && !media.photo && <span>אין תמונה או דירוג זמינים · Google Maps</span>}
      {media.photo && <div>Google Maps · {media.authors.map((author: { name: string; uri: string | null }, index: number) => author.uri?.startsWith('https://') ? <a className="underline" key={index} href={author.uri} target="_blank" rel="noreferrer">{author.name} </a> : <span key={index}>{author.name} </span>)}</div>}
    </div>}
  </div>;
}

type Receipt = { text: string; signature: string };
type Option = { id: string; name: string; address: string; distance: number; review: Receipt | null };
type Found = { kind: 'confident' | 'ambiguous'; options: Option[] } | { kind: 'message'; text: string };

function FindBusiness({ id, tripId }: { id: string; tripId: string }) {
  const review = useServerFn(reviewRecommendationIdentities);
  const apply = useServerFn(applyRecommendationIdentity);
  const qc = useQueryClient();
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await review({ data: { tripId, ids: [id], limit: 1 } });
      const row = response.results[0];
      if (response.stopped || !row) setFound({ kind: 'message', text: 'החיפוש לא זמין כרגע' });
      else if (row.status === 'confident' && row.proposed && row.review) {
        const candidate = row.candidates.find(c => c.id === row.proposed!.id);
        setFound({ kind: 'confident', options: [{ id: row.proposed.id, name: row.proposed.name, address: row.proposed.address, distance: candidate?.distance ?? 0, review: row.review }] });
      } else if (row.status === 'ambiguous') setFound({ kind: 'ambiguous', options: row.candidates.slice(0, 5) });
      else if (row.status === 'no_match') setFound({ kind: 'message', text: 'לא נמצא עסק קרוב' });
      else if (row.status === 'pin_only') setFound({ kind: 'message', text: 'אין נקודה שמורה' });
      else setFound({ kind: 'message', text: 'החיפוש לא זמין כרגע' });
    } catch { setFound({ kind: 'message', text: 'החיפוש לא זמין כרגע' }); }
    finally { setBusy(false); }
  };
  const choose = async (receipt: Receipt | null) => {
    if (busy || !receipt) return;
    setBusy(true);
    try {
      await apply({ data: receipt });
      await qc.invalidateQueries({ queryKey: ['recs'] });
      toast.success('העסק שויך');
      setFound(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'השיוך נכשל'); }
    finally { setBusy(false); }
  };
  return <div className="mt-2 space-y-1" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {!found && <Button variant="ghost" size="sm" disabled={busy} onClick={event => { event.stopPropagation(); void search(); }}><Search />{busy ? 'מחפש…' : 'מצא עסק ב־Google'}</Button>}
    {found?.kind === 'message' && <div role="status" className="text-xs text-muted-foreground">{found.text}</div>}
    {found && found.kind !== 'message' && <ul className="space-y-1">
      {found.options.map(option => <li key={option.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-xs">
        <div className="min-w-0 flex-1 break-words"><bdi className="font-semibold">{option.name}</bdi><div className="text-muted-foreground"><bdi>{option.address}</bdi> · {option.distance} מ׳</div></div>
        <Button size="sm" variant="outline" disabled={busy || !option.review} onClick={event => { event.stopPropagation(); void choose(option.review); }}>{found.kind === 'confident' ? 'זה המקום' : 'בחר'}</Button>
      </li>)}
    </ul>}
  </div>;
}

export function RecommendationIdentityReview({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="outline" size="sm" onClick={() => setOpen(true)}><Search />בדיקת שיוך לעסקים</Button>
    <BottomSheet open={open} onOpenChange={setOpen} title="בדיקת שיוך ל־Google">{open && <IdentityReviewPanel tripId={tripId} />}</BottomSheet></>;
}
