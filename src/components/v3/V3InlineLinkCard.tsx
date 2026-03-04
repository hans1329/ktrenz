import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// Platform detection & styling
const PLATFORM_MAP: { pattern: RegExp; label: string; emoji: string; gradient: string }[] = [
  { pattern: /youtube\.com|youtu\.be/, label: "YouTube", emoji: "▶️", gradient: "from-red-500/20 to-red-600/10 border-red-500/30" },
  { pattern: /spotify\.com/, label: "Spotify", emoji: "🎧", gradient: "from-green-500/20 to-green-600/10 border-green-500/30" },
  { pattern: /melon\.com/, label: "Melon", emoji: "🍈", gradient: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30" },
  { pattern: /music\.bugs\.co/, label: "Bugs", emoji: "🎵", gradient: "from-orange-500/20 to-orange-600/10 border-orange-500/30" },
  { pattern: /genie\.co/, label: "Genie", emoji: "🧞", gradient: "from-blue-400/20 to-blue-500/10 border-blue-400/30" },
  { pattern: /x\.com|twitter\.com/, label: "X", emoji: "𝕏", gradient: "from-slate-500/20 to-slate-600/10 border-slate-500/30" },
  { pattern: /instagram\.com/, label: "Instagram", emoji: "📸", gradient: "from-pink-500/20 to-purple-500/10 border-pink-500/30" },
  { pattern: /pinterest\.com/, label: "Pinterest", emoji: "📌", gradient: "from-red-400/20 to-red-500/10 border-red-400/30" },
  { pattern: /naver\.com/, label: "Naver", emoji: "📰", gradient: "from-green-600/20 to-green-700/10 border-green-600/30" },
];

function detectPlatform(url: string) {
  for (const p of PLATFORM_MAP) {
    if (p.pattern.test(url)) return p;
  }
  return { label: "Link", emoji: "🔗", gradient: "from-primary/20 to-primary/10 border-primary/30" };
}

interface V3InlineLinkCardProps {
  href: string;
  children: React.ReactNode;
}

const V3InlineLinkCard = ({ href, children }: V3InlineLinkCardProps) => {
  const platform = detectPlatform(href);
  const text = typeof children === "string" ? children : 
    Array.isArray(children) ? children.map(c => typeof c === "string" ? c : "").join("") : "";

  // If it's an image link (markdown image rendered as link), just render normal link
  const isImageChild = Array.isArray(children) && children.some(
    (c: any) => c?.type === "img" || c?.props?.node?.tagName === "img"
  );
  if (isImageChild) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {children}
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "not-prose flex items-center gap-2.5 my-1.5 px-3 py-2.5 rounded-xl",
        "bg-gradient-to-r border transition-all",
        "hover:scale-[1.02] hover:shadow-md active:scale-[0.98]",
        "no-underline cursor-pointer",
        platform.gradient
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-lg shrink-0">{platform.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-foreground truncate">
          {text || `${platform.label} 바로가기`}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{platform.label}</div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    </a>
  );
};

export default V3InlineLinkCard;
