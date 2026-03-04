import { ExternalLink, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import React from "react";

// Platform detection & styling
const PLATFORM_MAP: { pattern: RegExp; label: string; emoji: string; gradient: string; iconBg: string }[] = [
  { pattern: /youtube\.com|youtu\.be/, label: "YouTube", emoji: "▶️", gradient: "from-red-500/15 to-red-600/5 border-red-500/25", iconBg: "bg-red-500" },
  { pattern: /spotify\.com/, label: "Spotify", emoji: "🎧", gradient: "from-green-500/15 to-green-600/5 border-green-500/25", iconBg: "bg-green-500" },
  { pattern: /melon\.com/, label: "Melon", emoji: "🍈", gradient: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/25", iconBg: "bg-emerald-500" },
  { pattern: /music\.bugs\.co/, label: "Bugs", emoji: "🎵", gradient: "from-orange-500/15 to-orange-600/5 border-orange-500/25", iconBg: "bg-orange-500" },
  { pattern: /genie\.co/, label: "Genie", emoji: "🧞", gradient: "from-blue-400/15 to-blue-500/5 border-blue-400/25", iconBg: "bg-blue-400" },
  { pattern: /x\.com|twitter\.com/, label: "X", emoji: "𝕏", gradient: "from-slate-500/15 to-slate-600/5 border-slate-500/25", iconBg: "bg-slate-600" },
  { pattern: /instagram\.com/, label: "Instagram", emoji: "📸", gradient: "from-pink-500/15 to-purple-500/5 border-pink-500/25", iconBg: "bg-pink-500" },
  { pattern: /pinterest\.com/, label: "Pinterest", emoji: "📌", gradient: "from-red-400/15 to-red-500/5 border-red-400/25", iconBg: "bg-red-400" },
  { pattern: /naver\.com/, label: "Naver", emoji: "📰", gradient: "from-green-600/15 to-green-700/5 border-green-600/25", iconBg: "bg-green-600" },
];

function detectPlatform(url: string) {
  for (const p of PLATFORM_MAP) {
    if (p.pattern.test(url)) return p;
  }
  return { label: "Link", emoji: "🔗", gradient: "from-primary/15 to-primary/5 border-primary/25", iconBg: "bg-primary" };
}

// Extract image src from React children (handles [![alt](img)](url) pattern)
function extractImageFromChildren(children: React.ReactNode): { imgSrc: string; imgAlt: string; textContent: string } | null {
  const walk = (node: React.ReactNode): { imgSrc?: string; imgAlt?: string } | null => {
    if (!node) return null;
    if (React.isValidElement(node)) {
      const props = node.props as any;
      if (node.type === "img" || props?.node?.tagName === "img") {
        return { imgSrc: props.src, imgAlt: props.alt };
      }
      if (props?.children) return walk(props.children);
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        const result = walk(child);
        if (result) return result;
      }
    }
    return null;
  };

  const imgInfo = walk(children);
  if (!imgInfo?.imgSrc) return null;

  // Extract text content
  const getText = (node: React.ReactNode): string => {
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(getText).join("");
    if (React.isValidElement(node)) {
      const props = node.props as any;
      if (node.type === "img" || props?.node?.tagName === "img") return "";
      return getText(props?.children);
    }
    return "";
  };

  return {
    imgSrc: imgInfo.imgSrc,
    imgAlt: imgInfo.imgAlt || "",
    textContent: getText(children).trim(),
  };
}

interface V3InlineLinkCardProps {
  href: string;
  children: React.ReactNode;
}

const V3InlineLinkCard = ({ href, children }: V3InlineLinkCardProps) => {
  const platform = detectPlatform(href);
  const imageData = extractImageFromChildren(children);

  // ── Thumbnail card (when image child is present) ──
  if (imageData?.imgSrc) {
    const isYouTube = /youtube\.com|youtu\.be/.test(href);
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "not-prose flex overflow-hidden rounded-xl my-2 border transition-all",
          "hover:scale-[1.01] hover:shadow-lg active:scale-[0.99]",
          "no-underline cursor-pointer",
          platform.gradient,
          "bg-gradient-to-r"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Thumbnail */}
        <div className="relative w-[120px] h-[80px] shrink-0 bg-muted overflow-hidden">
          <img
            src={imageData.imgSrc}
            alt={imageData.imgAlt}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          {isYouTube && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                <Play className="w-4 h-4 text-white fill-white ml-0.5" />
              </div>
            </div>
          )}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0 px-3 py-2 flex flex-col justify-center gap-0.5">
          <div className="text-[13px] font-semibold text-foreground line-clamp-2 leading-tight">
            {imageData.imgAlt || imageData.textContent || `${platform.label} 콘텐츠`}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs">{platform.emoji}</span>
            <span className="text-[11px] text-muted-foreground">{platform.label}</span>
            <ExternalLink className="w-3 h-3 text-muted-foreground/50 ml-auto" />
          </div>
        </div>
      </a>
    );
  }

  // ── Text-only card (no thumbnail) ──
  const text = typeof children === "string" ? children :
    Array.isArray(children) ? children.map(c => typeof c === "string" ? c : "").join("") : "";

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
