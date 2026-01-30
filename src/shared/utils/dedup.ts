/**
 * Promise deduplication utility.
 * Wraps an async function so that concurrent calls share a single in-flight promise.
 * After the promise settles (resolves or rejects), the next call starts a new execution.
 */
export function dedup<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    if (inflight) return inflight;
    inflight = fn().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}
