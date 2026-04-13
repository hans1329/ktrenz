import avatar1 from "@/assets/default-avatar-1.jpeg";
import avatar2 from "@/assets/default-avatar-2.jpeg";

const avatars = [avatar1, avatar2];

const cache = new Map<string, string>();

export function getDefaultAvatar(seed?: string): string {
  const key = seed ?? "anon";
  if (!cache.has(key)) {
    // Deterministic pick based on seed so the same user always sees the same avatar
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) | 0;
    }
    cache.set(key, avatars[Math.abs(hash) % avatars.length]);
  }
  return cache.get(key)!;
}
