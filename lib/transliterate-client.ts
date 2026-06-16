/**
 * Client helper around the /api/transliterate proxy (Google Input Tools).
 * Returns the best Devanagari transliteration of a romanized string, or null
 * if there's nothing to convert or the (unofficial) endpoint is unavailable.
 */
export async function transliterateToNepali(
  text: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const query = text.trim();
  // Nothing to transliterate if there are no Latin letters (already Devanagari).
  if (!query || !/[a-zA-Z]/.test(query)) return null;
  try {
    const res = await fetch(
      `/api/transliterate?text=${encodeURIComponent(query)}`,
      { signal },
    );
    const data = await res.json();
    const list: unknown = data?.suggestions;
    if (Array.isArray(list) && typeof list[0] === "string") return list[0];
    return null;
  } catch {
    return null;
  }
}
