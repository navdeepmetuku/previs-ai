/**
 * In-memory image URL cache.
 * Prevents re-rendering from re-fetching already-loaded images.
 * Key: scene.id  Value: imageUrl (data: or https://)
 */

const _cache = new Map<string, string>();

export function getCachedImageUrl(id: string): string | null {
  return _cache.get(id) ?? null;
}

export function cacheImageUrl(id: string, url: string): void {
  _cache.set(id, url);
}

export function clearImageCache(): void {
  _cache.clear();
}
