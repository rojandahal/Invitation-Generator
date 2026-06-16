/**
 * Run async work over a list with a bounded number of concurrent workers.
 * Used for browser-side bulk generation (render + upload) so we never fire
 * hundreds of uploads at once. Never rejects — collects per-item errors.
 */
export async function runPool<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency = 5,
  onProgress?: (done: number, total: number) => void,
): Promise<{ errors: { index: number; error: unknown }[] }> {
  const total = items.length;
  const errors: { index: number; error: unknown }[] = [];
  let done = 0;
  let cursor = 0;

  async function next(): Promise<void> {
    const i = cursor++;
    if (i >= total) return;
    try {
      await worker(items[i], i);
    } catch (error) {
      errors.push({ index: i, error });
    } finally {
      done++;
      onProgress?.(done, total);
    }
    return next();
  }

  const runners = Array.from({ length: Math.min(concurrency, total) || 0 }, () =>
    next(),
  );
  await Promise.all(runners);
  return { errors };
}
