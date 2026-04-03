export function getYouTubeThumbnailUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;

  const match = sourceUrl.match(
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
  );

  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}
