import { useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { ArrowLeft, TrendingUp, ShoppingBag, Users, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import SEO from "@/components/SEO";
import T2BrandLogo from "@/components/t2/T2BrandLogo";
import V3Header from "@/components/v3/V3Header";
import V3TabBar from "@/components/v3/V3TabBar";

interface BrandInfo {
  id: string;
  brand_name: string;
  brand_name_ko: string | null;
  logo_url: string | null;
  domain: string | null;
  category: string | null;
}

const T2BrandPage = () => {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();

  // 1. Brand info
  const { data: brand, isLoading: brandLoading } = useQuery({
    queryKey: ["t2-brand-detail", brandId],
    enabled: !!brandId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ktrenz_brand_registry")
        .select("id, brand_name, brand_name_ko, logo_url, domain, category")
        .eq("id", brandId)
        .maybeSingle();
      return (data ?? null) as BrandInfo | null;
    },
  });

  // 2. All active triggers linked to this brand
  const { data: triggers = [], isLoading: triggersLoading } = useQuery({
    queryKey: ["t2-brand-triggers", brandId],
    enabled: !!brandId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ktrenz_trend_triggers")
        .select("id, keyword, keyword_ko, keyword_category, star_id, influence_index, baseline_score, source_image_url, detected_at")
        .eq("brand_id", brandId)
        .eq("status", "active")
        .order("influence_index", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  // 3. Related artists (stars) from those triggers
  const starIds = useMemo(() => {
    const ids = new Set<string>();
    triggers.forEach((t: any) => { if (t.star_id) ids.add(t.star_id); });
    return Array.from(ids);
  }, [triggers]);

  const { data: relatedStars = [] } = useQuery({
    queryKey: ["t2-brand-stars", starIds.join(",")],
    enabled: starIds.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ktrenz_stars")
        .select("id, display_name, name_ko, image_url, wiki_entry_id, star_type")
        .in("id", starIds)
        .eq("is_active", true);

      const stars = (data ?? []) as any[];
      // Fetch wiki images for fallback
      const wikiIds = stars.map((s: any) => s.wiki_entry_id).filter(Boolean);
      const imageMap = new Map<string, string>();
      if (wikiIds.length > 0) {
        const { data: wikiData } = await supabase
          .from("wiki_entries")
          .select("id, image_url")
          .in("id", wikiIds);
        (wikiData ?? []).forEach((w: any) => { if (w.image_url) imageMap.set(w.id, w.image_url); });
      }

      return stars.map((s: any) => ({
        ...s,
        resolvedImage: (s.wiki_entry_id && imageMap.get(s.wiki_entry_id)) || s.image_url || null,
      }));
    },
  });

  // Group triggers by category
  const productTriggers = useMemo(() => triggers.filter((t: any) => t.keyword_category === "product"), [triggers]);
  const brandTriggers = useMemo(() => triggers.filter((t: any) => t.keyword_category === "brand"), [triggers]);
  const otherTriggers = useMemo(() => triggers.filter((t: any) => t.keyword_category !== "product" && t.keyword_category !== "brand"), [triggers]);

  // Per-artist trigger count
  const artistTriggerCounts = useMemo(() => {
    const map = new Map<string, number>();
    triggers.forEach((t: any) => {
      if (t.star_id) map.set(t.star_id, (map.get(t.star_id) || 0) + 1);
    });
    return map;
  }, [triggers]);

  const getLabel = useCallback((kw: any) => {
    if (language === "ko" && kw.keyword_ko) return kw.keyword_ko;
    return kw.keyword;
  }, [language]);

  const getBrandLabel = useCallback(() => {
    if (!brand) return "";
    return language === "ko" && brand.brand_name_ko ? brand.brand_name_ko : brand.brand_name;
  }, [brand, language]);

  const getStarName = useCallback((s: any) => {
    return language === "ko" && s.name_ko ? s.name_ko : s.display_name;
  }, [language]);

  const isLoading = brandLoading || triggersLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!brand) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Brand not found</p>
        <button onClick={() => navigate(-1)} className="text-primary text-sm font-medium">← Back</button>
      </div>
    );
  }

  return (
    <>
      <SEO
        title={`${brand.brand_name} – KTrenZ Brand`}
        titleKo={`${brand.brand_name_ko || brand.brand_name} – KTrenZ 브랜드`}
        description={`K-Pop trends connected to ${brand.brand_name}`}
        descriptionKo={`${brand.brand_name_ko || brand.brand_name} 관련 K-Pop 트렌드`}
        path={`/t2/brand/${brand.id}`}
      />

      <div className="fixed top-0 left-0 right-0 z-50 bg-card/70 backdrop-blur-md">
        <V3Header />
      </div>

      <div className="min-h-screen bg-background pt-14 pb-24">
        <div className="max-w-2xl mx-auto px-4">

          {/* Back */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-4 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {language === "ko" ? "뒤로" : "Back"}
          </button>

          {/* Brand Header */}
          <div className="flex items-center gap-4 mb-8">
            <div
              className="w-16 h-16 rounded-2xl border border-border/60 overflow-hidden flex items-center justify-center shrink-0"
              style={{ backgroundColor: "hsl(0 0% 15%)" }}
            >
              <T2BrandLogo
                brandId={brand.id}
                brandName={brand.brand_name}
                domain={brand.domain}
                logoUrl={brand.logo_url}
                alt={brand.brand_name}
                className="w-full h-full object-contain p-1.5"
                fallbackClassName="text-xl"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black text-foreground truncate">{getBrandLabel()}</h1>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {brand.domain && (
                  <a
                    href={`https://${brand.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    {brand.domain} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {triggers.length} {language === "ko" ? "트렌드" : "trends"}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {starIds.length} {language === "ko" ? "아티스트" : "artists"}
                </span>
              </div>
            </div>
          </div>

          {/* Related Artists */}
          {relatedStars.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 text-secondary-foreground">
                <Users className="w-4 h-4" />
                {language === "ko" ? "연관 아티스트" : language === "ja" ? "関連アーティスト" : language === "zh" ? "相关艺人" : "Related Artists"}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {relatedStars
                  .sort((a: any, b: any) => (artistTriggerCounts.get(b.id) || 0) - (artistTriggerCounts.get(a.id) || 0))
                  .map((star: any) => (
                  <button
                    key={star.id}
                    onClick={() => navigate(`/t2/artist/${star.id}`)}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors text-left"
                  >
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      {star.resolvedImage ? (
                        <img
                          src={star.resolvedImage}
                          alt={getStarName(star)}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <span className="text-xs font-bold text-muted-foreground">{getStarName(star).slice(0, 2)}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground truncate">{getStarName(star)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {artistTriggerCounts.get(star.id) || 0} {language === "ko" ? "키워드" : "keywords"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Product Keywords */}
          {productTriggers.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 text-secondary-foreground">
                <ShoppingBag className="w-4 h-4" />
                {language === "ko" ? "제품 키워드" : language === "ja" ? "製品キーワード" : language === "zh" ? "产品关键词" : "Product Keywords"}
              </h2>
              <div className="grid gap-2">
                {productTriggers.map((kw: any) => {
                  const star = relatedStars.find((s: any) => s.id === kw.star_id);
                  return (
                    <button
                      key={kw.id}
                      onClick={() => navigate(`/t2/${kw.id}`)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors text-left w-full"
                    >
                      {kw.source_image_url && (
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
                          <img src={kw.source_image_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{getLabel(kw)}</p>
                        {star && (
                          <p className="text-[11px] text-muted-foreground truncate">{getStarName(star)}</p>
                        )}
                      </div>
                      {kw.influence_index > 0 && (
                        <span className="text-xs font-bold text-primary shrink-0">
                          {Number(kw.influence_index).toFixed(0)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Brand Keywords */}
          {brandTriggers.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 text-secondary-foreground">
                <TrendingUp className="w-4 h-4" />
                {language === "ko" ? "브랜드 키워드" : language === "ja" ? "ブランドキーワード" : language === "zh" ? "品牌关键词" : "Brand Keywords"}
              </h2>
              <div className="flex flex-wrap gap-2">
                {brandTriggers.map((kw: any) => (
                  <button
                    key={kw.id}
                    onClick={() => navigate(`/t2/${kw.id}`)}
                    className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    {getLabel(kw)}
                    {kw.influence_index > 0 && (
                      <span className="ml-1.5 text-muted-foreground">{Number(kw.influence_index).toFixed(0)}</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Other Keywords */}
          {otherTriggers.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 text-secondary-foreground">
                {language === "ko" ? "기타 키워드" : "Other Keywords"}
              </h2>
              <div className="flex flex-wrap gap-2">
                {otherTriggers.map((kw: any) => (
                  <button
                    key={kw.id}
                    onClick={() => navigate(`/t2/${kw.id}`)}
                    className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {getLabel(kw)}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <V3TabBar activeTab="rankings" onTabChange={() => {}} />
    </>
  );
};

export default T2BrandPage;
