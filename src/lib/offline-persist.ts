import { get, set, del } from "idb-keyval";
import type { QueryClient } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const KEY = "travelway-query-cache";
export const MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days

function createIdbPersister(): Persister {
  return {
    persistClient: (client: PersistedClient) => set(KEY, client),
    restoreClient: () => get<PersistedClient>(KEY),
    removeClient: () => del(KEY),
  };
}

/** Reads when the offline snapshot was last written (ms epoch), if any. */
export async function getCacheTimestamp(): Promise<number | null> {
  try {
    const client = await get<PersistedClient>(KEY);
    return client?.timestamp ?? null;
  } catch {
    return null;
  }
}

/** Persists the query cache to IndexedDB so the app has data while offline. */
export async function startOfflinePersistence(queryClient: QueryClient) {
  if (typeof window === "undefined") return;
  const { persistQueryClient } = await import("@tanstack/react-query-persist-client");
  persistQueryClient({
    queryClient,
    persister: createIdbPersister(),
    maxAge: MAX_AGE,
    buster: "v1",
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        query.state.status === "success" && query.state.data !== undefined,
    },
  });
}
