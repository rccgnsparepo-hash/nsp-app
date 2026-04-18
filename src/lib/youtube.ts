/**
 * Extract YouTube video ID from any URL format:
 * - youtube.com/watch?v=ID
 * - youtu.be/ID
 * - youtube.com/embed/ID
 * - youtube.com/shorts/ID
 * - youtube.com/v/ID
 */
export const extractYoutubeId = (url: string): string | null => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m?.[1]) return m[1];
  }

  // Fallback: bare 11-char id
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
};

export const buildYoutubeEmbedUrl = (url: string): string | null => {
  const id = extractYoutubeId(url);
  if (!id) return null;
  // autoplay=0 disabled by default; rel=0 hides related videos from other channels
  return `https://www.youtube.com/embed/${id}?autoplay=0&rel=0&modestbranding=1`;
};
