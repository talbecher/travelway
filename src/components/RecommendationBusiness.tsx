import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { ExternalLink, Image as ImageIcon, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/BottomSheet';
import { toast } from 'sonner';
import { IdentityReviewPanel } from './IdentityReviewPanel';
import { businessMapsLink } from '@/lib/place-identity';
import { recommendationBusinessMedia } from '@/lib/place-identity.functions';

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

export function RecommendationIdentityReview({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="outline" size="sm" onClick={() => setOpen(true)}><Search />בדיקת שיוך לעסקים</Button>
    <BottomSheet open={open} onOpenChange={setOpen} title="בדיקת שיוך ל־Google">{open && <IdentityReviewPanel tripId={tripId} />}</BottomSheet></>;
}
