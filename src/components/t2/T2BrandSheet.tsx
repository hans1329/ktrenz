import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG } from "./T2TrendTreemap";
import T2BrandLogo from "./T2BrandLogo";
import type { TrendTile } from "./T2TrendTreemap";

interface BrandInfo {
  id: string;
  brand_name: string;
  brand_name_ko: string | null;
  logo_url: string | null;
  domain: string | null;
  category: string;
}

interface Props {
  brand: BrandInfo;
  keywords: TrendTile[];
  totalInfluence: number;
  artistName: string;
  onClose: () => void;
}

const BRAND_CATEGORY_LABELS: Record<string, string> = {
  luxury: "Luxury",
  fashion: "Fashion",
  beauty: "Beauty",
  tech: "Tech",
  food: "F&B",
  entertainment: "Entertainment",
  lifestyle: "Lifestyle",
  ngo: "NGO",
  other: "Other",
};

export default function T2BrandSheet({ brand, keywords, totalInfluence, artistName, onClose }: Props) {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const brandName = language === "ko" && brand.brand_name_ko ? brand.brand_name_ko : brand.brand_name;

  const sortedKeywords = [...keywords].sort((a, b) => b.influenceIndex - a.influenceIndex);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] overflow-y-auto">
        <SheetHeader className="pb-3">
          <div className="flex items-center gap-3">
            {/* Brand logo */}
            <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden border border-border/40" style={{ background: 'hsl(0 0% 15%)' }}>
              <T2BrandLogo
                brandId={brand.id}
                brandName={brand.brand_name}
                domain={brand.domain}
                logoUrl={brand.logo_url}
                alt={brand.brand_name}
                className="w-10 h-10 object-contain"
                fallbackClassName="text-xl font-black"
              />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base font-bold text-foreground truncate">
                {brandName}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {BRAND_CATEGORY_LABELS[brand.category] || brand.category}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  × {artistName}
                </span>
              </div>
            </div>
            {/* Total influence */}
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 text-primary">
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-sm font-bold font-mono">
                  {totalInfluence.toFixed(0)}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {keywords.length} keyword{keywords.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </SheetHeader>

        {/* Connection strength bar */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Connection Strength</span>
            <span className="font-mono">{Math.min(totalInfluence, 100).toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(totalInfluence, 100)}%` }}
            />
          </div>
        </div>

        {/* Keywords list */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Related Keywords
          </p>
          {sortedKeywords.map(kw => {
            const config = CATEGORY_CONFIG[kw.category];
            const kwText = language === "ko" && kw.keywordKo ? kw.keywordKo : kw.keyword;
            return (
              <button
                key={kw.id}
                onClick={() => {
                  onClose();
                  navigate(`/t2/${kw.id}`);
                }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 transition-all text-left"
              >
                <Badge
                  className="text-[9px] px-1.5 py-0 h-4 border-0 font-medium shrink-0 text-white"
                  style={{ background: config?.color || "hsl(var(--muted-foreground))" }}
                >
                  {config?.label || kw.category}
                </Badge>
                <span className="text-xs font-medium text-foreground truncate flex-1">
                  {kwText}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                  +{kw.influenceIndex.toFixed(0)}%
                </span>
              </button>
            );
          })}
        </div>

        {/* Brand website link */}
        {brand.domain && (
          <a
            href={`https://${brand.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex items-center justify-center gap-1.5 mt-4 py-2.5 rounded-xl",
              "border border-border/60 text-xs text-muted-foreground",
              "hover:bg-muted/40 transition-all"
            )}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {brand.domain}
          </a>
        )}
      </SheetContent>
    </Sheet>
  );
}
