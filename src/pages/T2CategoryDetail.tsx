import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SEO from "@/components/SEO";
import T2TrendTreemap, { type TrendCategory, CATEGORY_CONFIG } from "@/components/t2/T2TrendTreemap";
import V3TabBar from "@/components/v3/V3TabBar";

// Merged category keys → actual DB categories
const MERGE_MAP: Record<string, string[]> = {
  brand_product: ["brand", "product"],
  beauty_fashion: ["beauty", "fashion"],
  event_social: ["event", "social"],
  music_media: ["music", "media"],
};

const LABEL_MAP: Record<string, string> = {
  brand_product: "Brand · Product",
  beauty_fashion: "Beauty · Fashion",
  event_social: "Event · Social",
  music_media: "Music · Media",
  place: "Place",
  food: "Food",
  my: "★ My Picks",
};

const T2CategoryDetail = () => {
  const { categoryKey } = useParams<{ categoryKey: string }>();
  const navigate = useNavigate();
  const label = LABEL_MAP[categoryKey || ""] || CATEGORY_CONFIG[categoryKey || ""]?.label || categoryKey;

  // For merged categories, we pass "all" and let the component filter,
  // but we need to pick a single TrendCategory for the prop.
  // We'll use "all" and rely on the list view showing everything,
  // then the parent filters. For simplicity, use the first sub-category.
  const dbCategories = MERGE_MAP[categoryKey || ""] || [categoryKey];
  const primaryCategory = (dbCategories[0] || "all") as TrendCategory;

  return (
    <div className="min-h-[100dvh] bg-background">
      <SEO title={`${label} Trends – KTrenZ`} description={`Browse ${label} trend keywords`} path={`/t2/category/${categoryKey}`} />

      {/* Header */}
      <div className="sticky top-0 z-50 bg-card/90 backdrop-blur-lg border-b border-border/30">
        <div className="flex items-center gap-3 px-4 py-3 md:max-w-[90%] mx-auto">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-base font-black text-foreground">{label}</h1>
        </div>
      </div>

      {/* List view */}
      <div className="pb-24">
        <T2TrendTreemap
          viewMode="list"
          selectedCategory={primaryCategory}
          hideCategory
          hideHeader
          sortMode="volume"
          mergedCategories={dbCategories}
        />
      </div>

      <V3TabBar activeTab="rankings" onTabChange={() => {}} />
    </div>
  );
};

export default T2CategoryDetail;
