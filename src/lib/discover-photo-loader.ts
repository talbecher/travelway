/**
 * In-memory photo loader for the active Discover search only.
 * Refs manage the queue/dedupe; subscribers are notified on every
 * status change so cards re-render immediately (useSyncExternalStore).
 * No persistent cache.
 */
type Status = "queued" | "loading" | "done" | "failed";
type Fetcher = (photoName: string, searchId: string) => Promise<string | null>;

const MAX_CONCURRENT = 3;

export class DiscoverPhotoLoader {
  private gen = 0;
  private searchId = "";
  private status = new Map<string, Status>();
  private urls = new Map<string, string>();
  private queue: Array<{ name: string; wanted: () => boolean }> = [];
  private active = 0;
  private started = 0;
  private succeeded = 0;
  private version = 0;
  private listeners = new Set<() => void>();

  constructor(private fetcher: Fetcher) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getVersion = () => this.version;

  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Ends the current search (prints its final summary) and starts a new one. */
  reset(nextSearchId: string | null) {
    if (this.searchId) {
      console.info(
        `[discover] photos summary searchId=${this.searchId} started=${this.started} ok=${this.succeeded}`,
      );
    }
    this.gen++;
    this.searchId = nextSearchId ?? "";
    this.status.clear();
    this.urls.clear();
    this.queue = [];
    this.active = 0;
    this.started = 0;
    this.succeeded = 0;
    this.emit();
  }

  get(name: string): { status: Status | null; url: string | null } {
    return { status: this.status.get(name) ?? null, url: this.urls.get(name) ?? null };
  }

  /** Queue once per search; `wanted` is re-checked right before the request starts. */
  request(name: string, wanted: () => boolean) {
    if (!this.searchId) return;
    const s = this.status.get(name);
    if (s === "loading" || s === "done" || s === "failed") return;
    if (s === "queued") {
      // refresh the visibility check of the pending entry
      const q = this.queue.find((e) => e.name === name);
      if (q) q.wanted = wanted;
      else this.queue.push({ name, wanted });
    } else {
      this.status.set(name, "queued");
      this.queue.push({ name, wanted });
    }
    this.pump();
  }

  private pump() {
    while (this.active < MAX_CONCURRENT && this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (!next.wanted()) {
        // filtered out or scrolled away — may be re-queued when it comes near again
        this.status.delete(next.name);
        continue;
      }
      this.start(next.name);
    }
  }

  private start(name: string) {
    const gen = this.gen;
    const searchId = this.searchId;
    this.active++;
    this.started++;
    this.status.set(name, "loading");
    this.emit();
    this.fetcher(name, searchId)
      .then((url) => {
        if (gen !== this.gen) return;
        if (url) {
          this.urls.set(name, url);
          this.status.set(name, "done");
          this.succeeded++;
        } else {
          this.status.set(name, "failed");
        }
      })
      .catch(() => {
        if (gen !== this.gen) return;
        this.status.set(name, "failed");
      })
      .finally(() => {
        if (gen !== this.gen) return;
        this.active--;
        this.emit();
        this.pump();
      });
  }
}

/** Nearest vertically scrollable ancestor, or null. */
export function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const oy = getComputedStyle(cur).overflowY;
    if (oy === "auto" || oy === "scroll") return cur;
    cur = cur.parentElement;
  }
  return null;
}
