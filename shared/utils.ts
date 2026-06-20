/**
 * Safely parse a JSON string, returning a fallback value on failure.
 * Prevents runtime crashes from malformed JSON data.
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
