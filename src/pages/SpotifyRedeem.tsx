import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Gift, CheckCircle, AlertCircle, Music,
  Globe, Loader2, ChevronRight, Copy, ExternalLink, ShieldCheck, History,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import SEO from "@/components/SEO";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ── Duration mapping (approximate Spotify Premium months per USD value) ── */
const DURATION_MAP: Record<number, { en: string; ko: string; ja: string; zh: string }> = {
  10: { en: "~1 month", ko: "약 1개월", ja: "約1ヶ月", zh: "约1个月" },
  25: { en: "~2 months", ko: "약 2개월", ja: "約2ヶ月", zh: "约2个月" },
  30: { en: "~3 months", ko: "약 3개월", ja: "約3ヶ月", zh: "约3个月" },
  50: { en: "~5 months", ko: "약 5개월", ja: "約5ヶ月", zh: "约5个月" },
  60: { en: "~6 months", ko: "약 6개월", ja: "約6ヶ月", zh: "约6个月" },
  100: { en: "~10 months", ko: "약 10개월", ja: "約10ヶ月", zh: "约10个月" },
};
const getDuration = (d: number, lang: string) => {
  const exact = DURATION_MAP[d];
  if (exact) return exact[lang as keyof typeof exact] || exact.en;
  // Approximate: ~$10/month for Spotify Premium
  const months = Math.round(d / 10);
  const labels: Record<string, string> = {
    en: `~${months} month${months > 1 ? "s" : ""}`,
    ko: `약 ${months}개월`,
    ja: `約${months}ヶ月`,
    zh: `约${months}个月`,
  };
  return labels[lang] || labels.en;
};

const KCASH_PER_USD = 1000;

const SPOTIFY_SVG = (
  <svg viewBox="0 0 24 24" fill="hsl(142, 71%, 45%)"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
);

/* ── i18n Labels ── */
const L: Record<string, Record<string, string>> = {
  pageTitle: { en: "Redeem Spotify Premium", ko: "Spotify Premium 교환", ja: "Spotify Premium 交換", zh: "兑换 Spotify Premium" },
  subtitle: { en: "Exchange your K-Cash for a Spotify Premium gift card", ko: "K-Cash를 사용해 Spotify Premium 기프트카드를 받으세요", ja: "K-CashでSpotify Premiumギフトカードに交換", zh: "使用K-Cash兑换Spotify Premium礼品卡" },
  selectCountry: { en: "Select Your Country", ko: "국가를 선택하세요", ja: "国を選択してください", zh: "选择你的国家" },
  selectCountryDesc: { en: "Gift cards are region-specific. Choose the country where you use Spotify.", ko: "기프트카드는 지역별로 다릅니다. Spotify를 사용하는 국가를 선택하세요.", ja: "ギフトカードは地域別です。Spotifyを利用する国を選択してください。", zh: "礼品卡因地区而异。请选择您使用Spotify的国家。" },
  yourBalance: { en: "Your Balance", ko: "보유 잔액", ja: "残高", zh: "余额" },
  required: { en: "Required", ko: "필요 캐쉬", ja: "必要額", zh: "所需" },
  redeemNow: { en: "Redeem Now", ko: "교환하기", ja: "交換する", zh: "立即兑换" },
  notEnough: { en: "Not enough K-Cash", ko: "캐쉬가 부족합니다", ja: "K-Cash不足", zh: "K-Cash不足" },
  loadingProducts: { en: "Loading available products…", ko: "상품 로딩 중…", ja: "商品を読み込み中…", zh: "正在加载商品…" },
  noProducts: { en: "No Spotify products available for this country", ko: "이 국가에서 사용 가능한 Spotify 상품이 없습니다", ja: "この国のSpotify商品はありません", zh: "该国暂无可用的Spotify商品" },
  changeCountry: { en: "Change Country", ko: "국가 변경", ja: "国を変更", zh: "更改国家" },
  confirmTitle: { en: "Confirm Redemption", ko: "교환 확인", ja: "交換確認", zh: "确认兑换" },
  confirmDesc: { en: "This action will deduct K-Cash from your balance and generate a gift card code.", ko: "K-Cash가 차감되고 기프트카드 코드가 생성됩니다.", ja: "K-Cashが差し引かれ、ギフトカードコードが生成されます。", zh: "将扣除K-Cash并生成礼品卡代码。" },
  confirm: { en: "Confirm", ko: "확인", ja: "確認", zh: "确认" },
  cancel: { en: "Cancel", ko: "취소", ja: "キャンセル", zh: "取消" },
  successTitle: { en: "Redemption Successful!", ko: "교환 완료!", ja: "交換成功！", zh: "兑换成功！" },
  yourCode: { en: "Your Gift Card Code", ko: "기프트카드 코드", ja: "ギフトカードコード", zh: "礼品卡代码" },
  codeCopied: { en: "Code copied!", ko: "코드 복사됨!", ja: "コードがコピーされました！", zh: "代码已复制！" },
  redeemAt: { en: "Redeem at spotify.com/redeem", ko: "spotify.com/redeem 에서 사용하세요", ja: "spotify.com/redeemで利用", zh: "在spotify.com/redeem使用" },
  done: { en: "Done", ko: "완료", ja: "完了", zh: "完成" },
  processing: { en: "Processing…", ko: "처리 중…", ja: "処理中…", zh: "处理中…" },
  howTitle: { en: "How to earn K-Cash", ko: "K-Cash 획득 방법", ja: "K-Cash獲得方法", zh: "如何获取K-Cash" },
  how1: { en: "Predict trend battles daily", ko: "매일 트렌드 배틀 예측에 참여하세요", ja: "毎日トレンドバトルを予測する", zh: "每日参与趋势预测" },
  how2: { en: "Correct predictions earn 100~1,000 K-Cash", ko: "예측 성공 시 100~1,000 캐쉬를 받아요", ja: "予測成功で100〜1,000 K-Cash獲得", zh: "预测正确可获得100~1,000 K-Cash" },
  how3: { en: "Complete daily missions for bonus rewards", ko: "데일리 미션 완료로 보너스를 받으세요", ja: "デイリーミッションでボーナス獲得", zh: "完成每日任务获取额外奖励" },
  backToBattle: { en: "Back to Battle", ko: "배틀로 돌아가기", ja: "バトルに戻る", zh: "返回对战" },
  loginRequired: { en: "Please log in to redeem", ko: "교환하려면 로그인이 필요합니다", ja: "交換するにはログインが必要です", zh: "请登录后兑换" },
  orderHistory: { en: "Order History", ko: "교환 내역", ja: "交換履歴", zh: "兑换记录" },
  noHistory: { en: "No redemption history yet", ko: "교환 내역이 없습니다", ja: "交換履歴はまだありません", zh: "暂无兑换记录" },
  fulfilled: { en: "Fulfilled", ko: "완료", ja: "完了", zh: "已完成" },
  failed: { en: "Failed", ko: "실패", ja: "失敗", zh: "失败" },
  pending: { en: "Pending", ko: "처리중", ja: "処理中", zh: "处理中" },
  remaining: { en: "remaining to goal", ko: "목표까지 남은 캐쉬", ja: "目標まであと", zh: "距目标还差" },
};

type Step = "country" | "products" | "confirm" | "success";

interface ReloadlyProduct {
  productId: number;
  productName: string;
  brand?: { brandName: string };
  denominationType: string;
  fixedRecipientDenominations?: number[];
  minRecipientDenomination?: number;
  maxRecipientDenomination?: number;
  recipientCurrencyCode?: string;
  senderCurrencyCode?: string;
}

interface SpotifyCountry {
  code: string;
  name: string;
  flagUrl: string;
  products: ReloadlyProduct[];
}

const SpotifyRedeem = () => {
  const navigate = useNavigate();
  const { user, kPoints } = useAuth();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const l = useCallback((key: string) => L[key]?.[language] || L[key]?.en || key, [language]);

  const [step, setStep] = useState<Step>("country");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ReloadlyProduct | null>(null);
  const [selectedDenom, setSelectedDenom] = useState<number | null>(null);
  const [resultCode, setResultCode] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  /* ── Fetch available countries with Spotify products ── */
  const { data: availableCountries, isLoading: countriesLoading } = useQuery({
    queryKey: ["spotify-countries"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-redeem-giftcard", {
        body: { action: "list_countries" },
      });
      if (error) throw error;
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.error) throw new Error(parsed.error);
      return (parsed.countries ?? []) as SpotifyCountry[];
    },
    enabled: !!user,
    retry: 1,
    staleTime: 10 * 60 * 1000,
  });

  /* ── Load saved country from DB ── */
  const { data: savedPref } = useQuery({
    queryKey: ["user-preferences", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await (supabase as any)
        .from("ktrenz_user_preferences")
        .select("country_code")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.country_code ?? null;
    },
    enabled: !!user,
  });

  const [countryInitialized, setCountryInitialized] = useState(false);

  useEffect(() => {
    if (savedPref && !countryInitialized) {
      setSelectedCountry(savedPref);
      setStep("products");
      setCountryInitialized(true);
    }
  }, [savedPref, countryInitialized]);

  /* ── Save country to DB ── */
  const saveCountry = async (code: string) => {
    if (!user) return;
    await (supabase as any)
      .from("ktrenz_user_preferences")
      .upsert({ user_id: user.id, country_code: code }, { onConflict: "user_id" });
    queryClient.invalidateQueries({ queryKey: ["user-preferences", user.id] });
  };

  /* ── Fetch products ── */
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["spotify-products", selectedCountry],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-redeem-giftcard", {
        body: { action: "list_products", country_code: selectedCountry },
      });
      if (error) throw error;
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.error) throw new Error(parsed.error);
      return (parsed.products ?? []) as ReloadlyProduct[];
    },
    enabled: !!selectedCountry && step === "products" && !!user,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  /* ── Order mutation ── */
  const orderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct || !selectedDenom) throw new Error("No product selected");
      const { data, error } = await supabase.functions.invoke("ktrenz-redeem-giftcard", {
        body: {
          action: "order",
          product_id: selectedProduct.productId,
          product_name: selectedProduct.productName,
          denomination: selectedDenom,
          country_code: selectedCountry,
          currency_code: selectedProduct.recipientCurrencyCode || "USD",
        },
      });
      if (error) throw error;
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.error) throw new Error(parsed.error);
      return parsed;
    },
    onSuccess: (data) => {
      setResultCode(data.pin_code || "CODE_PENDING");
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["ktrenz-points"] });
    },
    onError: (err) => {
      toast({ title: (err as Error).message, variant: "destructive" });
    },
  });

  /* ── Order history ── */
  const { data: orderHistory } = useQuery({
    queryKey: ["giftcard-history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-redeem-giftcard", {
        body: { action: "history" },
      });
      if (error) throw error;
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      return parsed.orders ?? [];
    },
    enabled: !!user && showHistory,
  });

  const handleCountrySelect = (code: string) => {
    setSelectedCountry(code);
    saveCountry(code);
    setStep("products");
  };

  const handleProductSelect = (product: ReloadlyProduct, denom: number) => {
    setSelectedProduct(product);
    setSelectedDenom(denom);
    setStep("confirm");
  };

  const kcashCost = selectedDenom ? selectedDenom * KCASH_PER_USD : 0;
  const canAfford = kPoints >= kcashCost;
  const countryObj = availableCountries?.find((c) => c.code === selectedCountry);

  const copyCode = () => {
    if (resultCode) {
      navigator.clipboard.writeText(resultCode);
      toast({ title: l("codeCopied") });
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto">{SPOTIFY_SVG}</div>
          <p className="text-muted-foreground text-sm">{l("loginRequired")}</p>
          <Button onClick={() => navigate("/login")}>{l("loginRequired")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title={l("pageTitle")} description={l("subtitle")} />

      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => {
              if (step === "products") { setStep("country"); setSelectedCountry(null); }
              else if (step === "confirm") setStep("products");
              else navigate(-1);
            }} className="p-1 -ml-1">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="font-bold text-foreground text-base">{l("pageTitle")}</h1>
          </div>
          <button onClick={() => setShowHistory(true)} className="p-1.5 rounded-full hover:bg-muted">
            <History className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Balance bar */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
          <span className="text-sm text-muted-foreground">{l("yourBalance")}</span>
          <span className="font-bold text-foreground">💎 {kPoints.toLocaleString()} K-Cash</span>
        </div>

        {/* ── Step 1: Country Selection ── */}
        {step === "country" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="font-bold text-foreground text-lg flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                {l("selectCountry")}
              </h2>
              <p className="text-xs text-muted-foreground">{l("selectCountryDesc")}</p>
            </div>

            {countriesLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{l("loadingProducts")}</p>
              </div>
            ) : !availableCountries || availableCountries.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">{l("noProducts")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {availableCountries.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => handleCountrySelect(c.code)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card",
                      "hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                    )}
                  >
                    {c.flagUrl ? (
                      <img src={c.flagUrl} alt={c.code} className="w-7 h-5 rounded-sm object-cover" />
                    ) : (
                      <span className="text-xl">🌐</span>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.code}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Products ── */}
        {step === "products" && (
          <div className="space-y-4">
            {/* Country badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {countryObj?.flagUrl ? (
                  <img src={countryObj.flagUrl} alt={countryObj.code} className="w-6 h-4 rounded-sm object-cover" />
                ) : (
                  <span className="text-xl">🌐</span>
                )}
                <span className="text-sm font-medium text-foreground">
                  {countryObj?.name}
                </span>
              </div>
              <button
                onClick={() => { setStep("country"); setSelectedCountry(null); }}
                className="text-xs text-primary hover:underline"
              >
                {l("changeCountry")}
              </button>
            </div>

            {productsLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{l("loadingProducts")}</p>
              </div>
            ) : !products || products.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">{l("noProducts")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((product) => {
                  const denoms = product.fixedRecipientDenominations ?? [];
                  return (
                    <div key={product.productId} className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 shrink-0">{SPOTIFY_SVG}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-foreground truncate">{product.productName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {product.recipientCurrencyCode || "USD"}
                          </p>
                        </div>
                      </div>

                      {/* Fixed denominations */}
                      {denoms.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {denoms.map((d) => {
                            const cost = d * KCASH_PER_USD;
                            const affordable = kPoints >= cost;
                            return (
                              <button
                                key={d}
                                onClick={() => handleProductSelect(product, d)}
                                disabled={!affordable}
                                className={cn(
                                  "flex flex-col items-center px-4 py-2.5 rounded-xl border transition-all",
                                  affordable
                                    ? "border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary"
                                    : "border-border/30 bg-muted/30 opacity-50 cursor-not-allowed"
                                )}
                              >
                                <span className="text-sm font-bold text-foreground">
                                  ${d}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {cost.toLocaleString()} K-Cash
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Range denomination (simplified: show common values) */}
                      {denoms.length === 0 && product.minRecipientDenomination && (
                        <div className="flex flex-wrap gap-2">
                          {[10, 25, 50].filter(
                            (d) =>
                              d >= (product.minRecipientDenomination ?? 0) &&
                              d <= (product.maxRecipientDenomination ?? 999)
                          ).map((d) => {
                            const cost = d * KCASH_PER_USD;
                            const affordable = kPoints >= cost;
                            return (
                              <button
                                key={d}
                                onClick={() => handleProductSelect(product, d)}
                                disabled={!affordable}
                                className={cn(
                                  "flex flex-col items-center px-4 py-2.5 rounded-xl border transition-all",
                                  affordable
                                    ? "border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary"
                                    : "border-border/30 bg-muted/30 opacity-50 cursor-not-allowed"
                                )}
                              >
                                <span className="text-sm font-bold text-foreground">${d}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {cost.toLocaleString()} K-Cash
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* How to earn */}
            <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">{l("howTitle")}</h3>
              </div>
              <div className="space-y-2.5">
                {["how1", "how2", "how3"].map((key) => (
                  <div key={key} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1" />
                    <span>{l(key)}</span>
                  </div>
                ))}
              </div>
            </div>

            <Button variant="outline" className="w-full rounded-xl" onClick={() => navigate("/")}>
              {l("backToBattle")}
            </Button>
          </div>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === "confirm" && selectedProduct && selectedDenom !== null && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 shrink-0">{SPOTIFY_SVG}</div>
                <div>
                  <h2 className="font-bold text-foreground">{selectedProduct.productName}</h2>
                  <p className="text-sm text-muted-foreground">
                    {countryObj?.flag} {countryObj?.name[language as keyof typeof countryObj.name] || countryObj?.name.en}
                  </p>
                </div>
              </div>

              <div className="space-y-3 p-4 rounded-xl bg-muted/50">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-foreground">
                    ${selectedDenom} {selectedProduct.recipientCurrencyCode || "USD"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cost</span>
                  <span className="font-bold text-foreground">
                    💎 {kcashCost.toLocaleString()} K-Cash
                  </span>
                </div>
                <div className="border-t border-border/50 pt-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">{l("yourBalance")}</span>
                  <span className={cn("font-bold", canAfford ? "text-foreground" : "text-destructive")}>
                    💎 {kPoints.toLocaleString()}
                  </span>
                </div>
                {canAfford && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">After redemption</span>
                    <span className="text-muted-foreground">
                      💎 {(kPoints - kcashCost).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground text-center">{l("confirmDesc")}</p>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setStep("products")}
                  disabled={orderMutation.isPending}
                >
                  {l("cancel")}
                </Button>
                <Button
                  className="flex-1 rounded-xl bg-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,40%)] text-white"
                  disabled={!canAfford || orderMutation.isPending}
                  onClick={() => orderMutation.mutate()}
                >
                  {orderMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {l("processing")}</>
                  ) : (
                    <><Gift className="w-4 h-4 mr-2" /> {l("confirm")}</>
                  )}
                </Button>
              </div>

              {!canAfford && (
                <p className="text-xs text-destructive text-center flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {l("notEnough")}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 4: Success ── */}
        {step === "success" && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-[hsl(142,71%,45%)]/10 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-[hsl(142,71%,45%)]" />
              </div>

              <h2 className="text-lg font-bold text-foreground">{l("successTitle")}</h2>

              {resultCode && resultCode !== "CODE_PENDING" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{l("yourCode")}</p>
                  <button
                    onClick={copyCode}
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-muted font-mono text-lg font-bold text-foreground tracking-wider hover:bg-muted/80 transition-colors"
                  >
                    {resultCode}
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              )}

              <a
                href="https://www.spotify.com/redeem"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                {l("redeemAt")}
              </a>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="w-3 h-3" />
                Powered by Reloadly
              </div>

              <Button
                className="w-full rounded-xl"
                onClick={() => {
                  setStep("products");
                  setSelectedProduct(null);
                  setSelectedDenom(null);
                  setResultCode(null);
                }}
              >
                {l("done")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Order History Dialog ── */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{l("orderHistory")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {!orderHistory || orderHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{l("noHistory")}</p>
            ) : (
              orderHistory.map((o: any) => (
                <div key={o.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{o.product_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString()} · {o.kcash_cost?.toLocaleString()} K-Cash
                    </p>
                  </div>
                  <span className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full",
                    o.status === "fulfilled" && "bg-green-500/10 text-green-500",
                    o.status === "failed" && "bg-destructive/10 text-destructive",
                    o.status === "pending" && "bg-yellow-500/10 text-yellow-500"
                  )}>
                    {l(o.status)}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SpotifyRedeem;
