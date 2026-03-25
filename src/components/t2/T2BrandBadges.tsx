import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TrendTile } from "./T2TrendTreemap";
import T2BrandSheet from "./T2BrandSheet";

interface BrandInfo {
  id: string;
  brand_name: string;
  brand_name_ko: string | null;
  logo_url: string | null;
  domain: string | null;
  category: string;
}

interface BrandConnection {
  brand: BrandInfo;
  keywords: TrendTile[];
  totalInfluence: number;
}

interface Props {
  keywords: TrendTile[];
  artistName: string;
  max?: number;
}

export default function T2BrandBadges({ keywords, artistName, max = 3 }: Props) {
  const { language } = useLanguage();
  const [selectedBrand, setSelectedBrand] = useState<BrandConnection | null>(null);

  // Get unique brand_ids from keywords
  const brandIds = useMemo(() => {
    const ids = new Set<string>();
    for (const kw of keywords) {
      if (kw.brandId) ids.add(kw.brandId);
    }
    return Array.from(ids);
  }, [keywords]);

  // Fetch brand registry data
  const { data: brands } = useQuery({
    queryKey: ["brand-registry", brandIds.join(",")],
    enabled: brandIds.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ktrenz_brand_registry")
        .select("id, brand_name, brand_name_ko, logo_url, domain, category")
        .in("id", brandIds);
      return (data || []) as BrandInfo[];
    },
  });

  const connections = useMemo(() => {
    if (!brands?.length) return [];
    const brandMap = new Map(brands.map(b => [b.id, b]));
    const connMap = new Map<string, BrandConnection>();

    for (const kw of keywords) {
      if (!kw.brandId) continue;
      const brand = brandMap.get(kw.brandId);
      if (!brand) continue;

      if (!connMap.has(brand.id)) {
        connMap.set(brand.id, { brand, keywords: [], totalInfluence: 0 });
      }
      const conn = connMap.get(brand.id)!;
      conn.keywords.push(kw);
      conn.totalInfluence += kw.influenceIndex;
    }

    return Array.from(connMap.values())
      .sort((a, b) => b.totalInfluence - a.totalInfluence)
      .slice(0, max);
  }, [brands, keywords, max]);

  if (!connections.length) return null;

  const brandName = (b: BrandInfo) =>
    language === "ko" && b.brand_name_ko ? b.brand_name_ko : b.brand_name;

  return (
    <>
      <div className="flex gap-1.5 mt-2 overflow-x-auto no-scrollbar">
        {connections.map(conn => {
          const maxInfluence = Math.max(...connections.map(c => c.totalInfluence), 1);
          const strength = Math.min(conn.totalInfluence / maxInfluence, 1);

          return (
            <button
              key={conn.brand.id}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedBrand(conn);
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full",
                "border border-border/60 bg-muted/40",
                "hover:bg-muted/80 transition-all shrink-0"
              )}
            >
              {/* Logo */}
              <div className="w-4 h-4 rounded-full overflow-hidden bg-background shrink-0 flex items-center justify-center">
                {conn.brand.domain ? (
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${conn.brand.domain}&sz=128`}
                    alt={conn.brand.brand_name}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                ) : null}
                <span
                  className={cn(
                    "text-[8px] font-bold text-muted-foreground",
                    conn.brand.domain && "hidden"
                  )}
                >
                  {conn.brand.brand_name.charAt(0)}
                </span>
              </div>

              {/* Name */}
              <span className="text-[10px] font-medium text-foreground/80 truncate max-w-[60px]">
                {brandName(conn.brand)}
              </span>

              {/* Strength indicator */}
              <div className="w-8 h-1.5 rounded-full bg-border/40 overflow-hidden shrink-0">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(strength * 100, 15)}%`,
                    background: strength > 0.7
                      ? "hsl(var(--primary))"
                      : strength > 0.4
                        ? "hsl(var(--muted-foreground))"
                        : "hsl(var(--muted-foreground) / 0.5)",
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {selectedBrand && (
        <T2BrandSheet
          brand={selectedBrand.brand}
          keywords={selectedBrand.keywords}
          totalInfluence={selectedBrand.totalInfluence}
          artistName={artistName}
          onClose={() => setSelectedBrand(null)}
        />
      )}
    </>
  );
}
