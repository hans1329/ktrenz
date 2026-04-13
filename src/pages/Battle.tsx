import { useState, useEffect, useRef, useCallback, forwardRef, type ReactNode } from "react";

const InsightLoadingText = ({ starName, t }: { starName: string; t: (k: string) => string }) => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setIdx(p => (p + 1) % 2), 2500);
    return () => clearInterval(iv);
  }, []);
  const msgs = [
    t("battle.analyzingTrend").replace("{name}", starName),
    t("battle.pleaseWait"),
  ];
  return (
    <p className="text-sm text-muted-foreground animate-pulse text-center">{msgs[idx]}</p>
  );
};
import { createPortal } from "react-dom";
import SEO from "@/components/SEO";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Zap, Trophy, TrendingUp, Clock, ChevronLeft, ChevronRight, ExternalLink, Flame, Share2, Play, Music, Instagram, Newspaper, MessageCircle, FileText, Sprout, Rocket, ChevronDown, Ticket, Loader2, Gift, Star, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import V3Header from "@/components/v3/V3Header";
import V3TabBar from "@/components/v3/V3TabBar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFieldTranslation } from "@/hooks/useFieldTranslation";
import SmartImage from "@/components/SmartImage";
import { toast } from "@/hooks/use-toast";
import SettlementResultsModal, { type SettledPrediction } from "@/components/battle/SettlementResultsModal";
import TicketInfoPopup from "@/components/TicketInfoPopup";
import { cn } from "@/lib/utils";


  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          {/* Sword & Shield clash animation */}
          <div className="relative w-24 h-24 mb-2">
            {/* Left sword */}
            <span className="absolute text-3xl animate-[swordLeft_1.2s_ease-in-out_infinite]" style={{ left: 0, top: '50%', transform: 'translateY(-50%)' }}>
              ⚔️
            </span>
            {/* Right shield */}
            <span className="absolute text-3xl animate-[shieldRight_1.2s_ease-in-out_infinite]" style={{ right: 0, top: '50%', transform: 'translateY(-50%)' }}>
              🛡️
            </span>
            {/* Clash spark */}
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl animate-[clashSpark_1.2s_ease-in-out_infinite]">
              💥
            </span>
          </div>
          <div className="w-48 h-2 rounded-full overflow-hidden bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #ff6b6b, #ffa94d, #ffd43b, #69db7c, #4dabf7, #9775fa, #ff6b6b)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite",
              }}
            />
          </div>
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        </div>
        <style>{`
          @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
          @keyframes swordLeft {
            0%, 100% { transform: translateY(-50%) translateX(-8px) rotate(-15deg); }
            45%, 55% { transform: translateY(-50%) translateX(18px) rotate(10deg); }
          }
          @keyframes shieldRight {
            0%, 100% { transform: translateY(-50%) translateX(8px) rotate(15deg); }
            45%, 55% { transform: translateY(-50%) translateX(-18px) rotate(-10deg); }
          }
          @keyframes clashSpark {
            0%, 35% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
            45%, 55% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
            70%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          }
        `}</style>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-muted/30">
      <SEO
        title="KTrenZ – K-Pop Content Battle"
        titleKo="KTrenZ – K-Pop 콘텐츠 배틀"
        description="Pick the winning K-Pop content. Vote and earn K-Cash."
        descriptionKo="이길 K-Pop 콘텐츠를 골라 투표하고 K-Cash를 모으세요."
        path="/battle"
      />
      <div className="fixed top-0 left-0 right-0 z-50 bg-card">
        <V3Header rightSlot={
          <button onClick={() => setShowTicketInfo(true)} className="flex items-center gap-1 active:opacity-60 transition-opacity">
            <Ticket className="text-primary h-[16px] w-[18px]" />
            <span className="font-bold text-primary text-sm">{remainingTickets}</span>
          </button>
        } />
      </div>
      <TicketInfoPopup open={showTicketInfo} onClose={() => setShowTicketInfo(false)} remaining={remainingTickets} total={totalTickets} />

      <div className="pt-16 pb-24 space-y-5">
        {/* Title + Flip Timer */}
        <div className="text-center sm:text-left space-y-4 pt-6 pb-4 max-w-lg sm:max-w-4xl mx-auto px-4">
          <h2 className="text-xl text-foreground tracking-tight font-sans font-bold sm:text-3xl text-center">
            {t("pickWinner")}
          </h2>
          <FlipTimer />

          {/* Filter Tabs */}
          <div className="flex items-center justify-center gap-1.5 mt-6 mb-4">
            {([
              { key: "live" as const, label: language === "ko" ? "라이브" : language === "ja" ? "ライブ" : language === "zh" ? "进行中" : "Live" },
              { key: "settled" as const, label: language === "ko" ? "정산완료" : language === "ja" ? "精算済" : language === "zh" ? "已结算" : "Settled" },
              { key: "myBets" as const, label: language === "ko" ? "내 참여" : language === "ja" ? "参加済" : language === "zh" ? "我的参与" : "My Bets" },
            ]).map(tab => {
              const count = battlePairs.filter((_, idx) => {
                const state = getPairState(idx);
                if (tab.key === "live") return !state.submitted || predictions.find(p => p.pickedRunId === state.pickedRunId)?.status === "pending";
                if (tab.key === "settled") return state.submitted && predictions.find(p => p.pickedRunId === state.pickedRunId)?.status !== "pending";
                return state.submitted;
              }).length;
              const displayCount = tab.key === "live"
                ? count
                : tab.key === "settled"
                ? settledBattleResults.length
                : myBetPredictions.length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setBattleFilter(tab.key)}
                  className={cn(
                    "px-3.5 py-2 text-xs font-semibold transition-all border-b-2",
                    battleFilter === tab.key
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label} {displayCount > 0 && <span className="ml-0.5 opacity-70">{displayCount}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* My Bets tab */}
        {battleFilter === "myBets" && myBetPredictions.length > 0 && (
          <div className="max-w-lg sm:max-w-4xl mx-auto px-4 space-y-2 mb-4">
            <div className="flex items-center gap-2 pb-1">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {t("historyTab")} ({myBetPredictions.length})
              </span>
            </div>
            {myBetPredictions.map((pred, i) => (
              <div key={pred.id || `${pred.pickedRunId}-${pred.opponentRunId}-${pred.band}-${pred.created_at || i}`} className="rounded-xl bg-card border border-border p-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {pred.pickedStarName} <span className="text-muted-foreground font-normal">vs</span> {pred.opponentStarName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pred.battle_date && <span className="mr-1.5 opacity-60">{pred.battle_date}</span>}
                    {t(pred.band === "steady" ? "bandSteady" : pred.band === "rising" ? "bandRising" : "bandSurge")} · {BANDS.find((b) => b.key === pred.band)?.range}
                    {pred.reward_amount != null && pred.status === "won" && <span className="ml-1 text-primary font-bold">+{pred.reward_amount}💎</span>}
                  </p>
                </div>
                <Badge variant="outline" className="ml-2 shrink-0">
                  {t(pred.status === "pending" ? "pending" : pred.status === "won" ? "won" : "lost")}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Settled tab: all battle pair results */}
        {battleFilter === "settled" && settledBattleResults.length > 0 && (
          <div className="max-w-lg sm:max-w-4xl mx-auto px-4 space-y-3 mb-4">
            {(() => {
              const grouped = new Map<string, typeof settledBattleResults>();
              settledBattleResults.forEach(r => {
                const arr = grouped.get(r.battleDate) || [];
                arr.push(r);
                grouped.set(r.battleDate, arr);
              });
              return Array.from(grouped.entries()).map(([date, pairs]) => (
                <div key={date} className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{date}</p>
                  {pairs.map((pair, i) => {
                    const aWins = pair.growthA > pair.growthB;
                    const bWins = pair.growthB > pair.growthA;
                    const draw = pair.growthA === pair.growthB;
                    return (
                      <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                          {/* Star A */}
                          <div className={cn("px-3 py-2.5 text-center", aWins && "bg-primary/[0.03]")}>
                            <p className={cn("text-sm font-bold truncate", aWins ? "text-foreground" : "text-muted-foreground")}>{pair.starA}</p>
                            <p className={cn("text-lg font-black mt-0.5", aWins ? "text-foreground" : "text-muted-foreground")}>
                              {pair.growthA > 0 ? "+" : ""}{pair.growthA}%
                            </p>
                            {aWins && <span className="text-[10px] font-bold text-primary">▲ {t("winner")}</span>}
                          </div>
                          {/* VS */}
                          <div className="px-2 text-center">
                            <span className="text-[10px] font-bold text-muted-foreground/40">VS</span>
                          </div>
                          {/* Star B */}
                          <div className={cn("px-3 py-2.5 text-center", bWins && "bg-primary/[0.03]")}>
                            <p className={cn("text-sm font-bold truncate", bWins ? "text-foreground" : "text-muted-foreground")}>{pair.starB}</p>
                            <p className={cn("text-lg font-black mt-0.5", bWins ? "text-foreground" : "text-muted-foreground")}>
                              {pair.growthB > 0 ? "+" : ""}{pair.growthB}%
                            </p>
                            {bWins && <span className="text-[10px] font-bold text-primary">▲ {t("winner")}</span>}
                          </div>
                        </div>
                        {draw && <p className="text-center text-[10px] text-muted-foreground pb-2">{t("draw")}</p>}
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        )}

        {/* Filtered battle pairs */}
        {battlePairs.map((pair, pairIdx) => {
          // Filter logic
          const state = getPairState(pairIdx);
          const pred = predictions.find(p => p.pickedRunId === state.pickedRunId);
          if (battleFilter === "myBets" || battleFilter === "settled") return null;
          if (battleFilter === "live" && state.submitted && pred?.status !== "pending") return null;

          const pairState = getPairState(pairIdx);
          const pairRuns = pair.runs;
          const pairItems = pair.items;
          const pickedRun = pairRuns.find((r) => r.id === pairState.pickedRunId);

          return (
            <div key={pairIdx} className="space-y-5 relative">
              {/* Question-style battle header */}
              <div className={cn("max-w-sm sm:max-w-[80%] mx-auto px-2 sm:px-0", pairIdx > 0 ? "my-6" : "mb-1")}>
                <div
                  className={cn(
                    "rounded-2xl border p-4 space-y-2 transition-all",
                    pairState.submitted
                      ? "bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800"
                      : "bg-card border-border"
                  )}
                  onClick={() => {
                    if (battleFilter === "live" && pairState.submitted) {
                      setCollapsedPairs(prev => {
                        const next = new Set(prev);
                        if (next.has(pairIdx)) next.delete(pairIdx);
                        else next.add(pairIdx);
                        return next;
                      });
                    }
                  }}
                >
                  {/* Battle number badge */}
                  <div className="flex items-center justify-between">
                    <span className={cn("text-[10px] font-bold uppercase tracking-widest rounded-full px-3 py-1 border",
                      pairState.submitted
                        ? "bg-sky-600 text-white border-sky-400"
                        : "bg-primary text-primary-foreground border-primary/40"
                    )}>
                      Battle {pairIdx + 1}{pairState.submitted ? ` ✓` : ""}
                    </span>
                    {battleFilter === "live" && pairState.submitted && (
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", collapsedPairs.has(pairIdx) && "rotate-180")} />
                    )}
                  </div>

                  {/* Question text */}
                  <p className="text-sm sm:text-base font-bold text-foreground leading-snug">
                    {(() => {
                      const starA = pairRuns[0]?.star?.display_name || "A";
                      const starB = pairRuns[1]?.star?.display_name || "B";
                      return t("questionFormat").replace("{a}", starA).replace("{b}", starB);
                    })()}
                  </p>

                  {/* Tap to analyze hint */}
                  {!pairState.submitted && (
                    <p className="text-[11px] text-muted-foreground">{t("tapToAnalyze")}</p>
                  )}
                </div>
              </div>


              {/* Collapsible content for submitted pairs in live tab */}
              {battleFilter === "live" && pairState.submitted && collapsedPairs.has(pairIdx) ? null : (
              <>

              {/* Card carousels — full width */}
              <div className="w-full px-2 sm:px-4">
                {pairRuns.map((run, idx) => (
                  <div key={run.id}>
                    {idx > 0 && (
                      <div className="my-6 flex items-center gap-3 px-4">
                        <div className="flex-1 h-px bg-border/60" />
                        <span className="text-[10px] font-semibold text-purple-500 uppercase tracking-widest">vs</span>
                        <div className="flex-1 h-px bg-border/60" />
                      </div>
                    )}
                    <div className="space-y-2">
                      <ArtistSection
                        runItems={pairItems[run.id] || []}
                        runId={run.id}
                        starId={run.star_id}
                        starName={run.star?.display_name || "Unknown"}
                        starImage={run.star?.image_url || null}
                        contentScore={parseFloat((run.content_score + getHotBonus(pairIdx, run.id)).toFixed(1))}
                        scoreLabel={t("contentScore")}
                        isPicked={pairState.pickedRunId === run.id}
                        isSubmitted={pairState.submitted}
                        onPick={() => handlePick(pairIdx, run.id)}
                        onCardTap={(item) => { setDrawerItem(item); setDrawerPairIndex(pairIdx); }}
                        onInsightOpen={() => openInsightDrawer(run.id, run.star_id, run.star?.display_name || "Unknown")}
                        disabled={pairState.submitted}
                        index={idx}
                      />
                    </div>
                  </div>
                ))}
              </div>

              </>
              )}
            </div>
          );
        })}

        {/* Today's Battle Summary — only in live tab when there are submissions */}
        {battleFilter === "live" && predictions.filter(p => p.status === "pending").length > 0 && (
          <div className="max-w-lg sm:max-w-4xl mx-auto px-4 mt-6 mb-2">
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-foreground">
                  {language === "ko" ? "오늘의 배틀 요약" : language === "ja" ? "今日のバトルまとめ" : language === "zh" ? "今日战斗摘要" : "Today's Battle Summary"}
                </span>
              </div>
              <div className="space-y-2">
                {predictions.filter(p => p.status === "pending").map((pred, i) => {
                  const bandInfo = BANDS.find(b => b.key === pred.band);
                  const BandIcon = bandInfo?.icon || Sprout;
                  const bandLabel = pred.band === "steady" ? (language === "ko" ? "안정" : "Steady")
                    : pred.band === "rising" ? (language === "ko" ? "상승" : "Rising")
                    : (language === "ko" ? "급등" : "Surge");
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-primary truncate">{pred.pickedStarName}</span>
                        <span className="text-[10px] text-muted-foreground">vs</span>
                        <span className="text-xs text-muted-foreground truncate">{pred.opponentStarName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <BandIcon className={cn("w-3.5 h-3.5", bandInfo?.iconColor)} />
                        <span className="text-[11px] font-semibold text-foreground">{bandLabel}</span>
                        <span className="text-[10px] text-muted-foreground">+{bandInfo?.reward}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <div className="flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] text-muted-foreground">
                    {language === "ko" ? "사용한 티켓" : "Tickets used"}
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {predictions.filter(p => p.status === "pending").length}/{totalTickets}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">
                    {language === "ko" ? "매일 결과 발표" : "Daily results"}
                  </span>
                  <span className="text-xs font-bold text-foreground">15:00 GMT</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty states */}
        {battleFilter === "myBets" && myBetPredictions.length === 0 && (
          <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground text-sm">
            {t("noBattlesYet")}
          </div>
        )}
        {battleFilter === "settled" && settledBattleResults.length === 0 && (
          <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground text-sm">
            {t("noSettled")}
          </div>
        )}
        {battleFilter === "live" && battlePairs.every((_, idx) => {
          const s = getPairState(idx);
          const p = predictions.find(pr => pr.pickedRunId === s.pickedRunId);
          return s.submitted && p?.status !== "pending";
        }) && (
          <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground text-sm">
            {t("allDone")}
          </div>
        )}

      </div>

      {/* Detail Drawer */}
      <Sheet open={!!drawerItem} onOpenChange={(open) => !open && setDrawerItem(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto sm:max-w-lg sm:mx-auto focus:outline-none focus-visible:outline-none focus-visible:ring-0" hideClose>
          {drawerItem && (() => {
            const drawerPair = battlePairs[drawerPairIndex];
            const drawerRuns = drawerPair?.runs || [];
            const starRun = drawerRuns.find((r) => r.star_id === drawerItem.star_id);
            const meta = drawerItem.metadata || {};
            return (
              <>
                {/* Drag handle */}
                <div className="flex justify-center pt-2 pb-4">
                  <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                </div>

                {/* Artist · Date */}
                <p className="text-[11px] text-muted-foreground mb-2">
                  <span className="font-semibold text-foreground">{starRun?.star?.display_name || ""}</span>
                  {drawerItem.published_at && (
                    <span> · {(() => {
                      const d = new Date(drawerItem.published_at);
                      return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
                    })()}</span>
                  )}
                </p>

                {/* Media embed or thumbnail */}
                <div className="rounded-2xl overflow-hidden bg-muted mb-4">
                  {(() => {
                    const source = drawerItem.source;
                    const url = drawerItem.url || meta.url || "";

                    // YouTube embed
                    const ytMatch = url.match(/(?:v=|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                    const ytId = ytMatch?.[1] || meta.videoId;
                    if ((source === "youtube" || ytId) && ytId) {
                      return (
                        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                          <iframe
                            src={`https://www.youtube.com/embed/${ytId}?rel=0&autoplay=1&mute=1`}
                            className="absolute inset-0 w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      );
                    }

                    // TikTok embed
                    if (source === "tiktok" && url) {
                      const tiktokIdMatch = url.match(/\/video\/(\d+)/);
                      const tiktokId = tiktokIdMatch?.[1] || meta.embed_video_id;
                      if (tiktokId) {
                        return (
                          <iframe
                            src={`https://www.tiktok.com/embed/v2/${tiktokId}?autoplay=1`}
                            className="w-full border-0"
                            style={{ height: "580px" }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        );
                      }
                    }

                    // Instagram: resolve media via edge function, play in-drawer
                    if (source === "instagram" && url) {
                      return (
                        <InstagramEmbed
                          key={drawerItem.id}
                          item={drawerItem}
                          starId={drawerItem.star_id}
                        />
                      );
                    }

                    // Fallback: thumbnail image
                    return drawerItem.thumbnail ? (
                      <SmartImage src={drawerItem.thumbnail} alt={drawerItem.title} className="w-full h-auto" />
                    ) : (
                      <div className="w-full aspect-video bg-muted" />
                    );
                  })()}
                </div>

                {/* Title */}
                <h3 className="text-base font-semibold text-foreground leading-snug mb-2">{decodeHtml(getLocalizedTitle(drawerItem, language))}</h3>

                {/* Description */}
                {(() => {
                  let desc = drawerItem.description;
                  if (!desc) return null;
                  // Filter CSS code, template vars, or heavily garbled text
                  if (/^\.[\w_]+\s*\{/.test(desc.trim())) return null;
                  if (/\{\{[\w#\/]/.test(desc)) return null;
                  // Strip inline CSS blocks that sneak into scraped descriptions
                  if (/[\w.#-]+\s*\{[^}]*\}/.test(desc)) return null;
                  // Check for garbled encoding: high ratio of replacement/control chars
                  const garbledCount = (desc.match(/[\x00-\x08\uFFFD]/g) || []).length;
                  if (garbledCount > 5) return null;
                  // Strip news bylines: [서울=뉴시스]기자명 기자 = , (서울=연합뉴스) etc.
                  desc = desc.replace(/[\[(\[]\s*\S+=\S+[\])\]]\s*\S+\s*기자\s*=\s*/g, "").trim();
                  desc = desc.replace(/^\s*\S+\s+기자\s*=\s*/, "").trim();
                  // Strip email addresses and DB prohibition notices
                  desc = desc.replace(/\S+@\S+\.\S+/g, "").replace(/\*재판매\s*및\s*DB\s*금지/g, "").trim();
                  // Strip photo credit lines: (사진 = xxx 제공) or (사진=xxx)
                  desc = desc.replace(/\(사진\s*=?\s*[^)]*제공\)\s*\d{4}\.\d{2}\.\d{2}\.?/g, "").trim();
                  if (!desc) return null;
                  const displayDesc = desc.length > 300 ? desc.slice(0, 300) + "…" : desc;
                  return (
                    <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                      {decodeHtml(displayDesc)}
                    </p>
                  );
                })()}

                {/* External link */}
                {(drawerItem.url || meta.url || meta.videoId) && (
                  <div className="flex justify-end gap-1 mb-4">
                    <a
                      href={drawerItem.url || meta.url || (meta.videoId ? `https://www.youtube.com/watch?v=${meta.videoId}` : "#")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => {
                        const shareUrl = drawerItem.url || meta.url || (meta.videoId ? `https://www.youtube.com/watch?v=${meta.videoId}` : "");
                        if (navigator.share) {
                          navigator.share({ title: drawerItem.title, url: shareUrl }).catch(() => {});
                        } else {
                          navigator.clipboard.writeText(shareUrl);
                        }
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {meta.likes != null && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Likes</p>
                      <p className="text-sm font-medium text-foreground">{Number(meta.likes).toLocaleString()}</p>
                    </div>
                  )}
                  {meta.plays != null && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Views</p>
                      <p className="text-sm font-medium text-foreground">{Number(meta.plays).toLocaleString()}</p>
                    </div>
                  )}
                  {meta.comments != null && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Comments</p>
                      <p className="text-sm font-medium text-foreground">{Number(meta.comments).toLocaleString()}</p>
                    </div>
                  )}
                  {meta.channelTitle && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Channel</p>
                      <p className="text-sm font-medium text-foreground truncate">{meta.channelTitle}</p>
                    </div>
                  )}
                  {meta.author && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Author</p>
                      <p className="text-sm font-medium text-foreground truncate">{meta.author}</p>
                    </div>
                  )}
                  {meta.subreddit && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Subreddit</p>
                      <p className="text-sm font-medium text-foreground">r/{meta.subreddit}</p>
                    </div>
                  )}
                </div>

                {/* Hot button */}
                <button
                  onClick={() => toggleHot(drawerPairIndex, drawerItem.id)}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 transition-all text-sm font-semibold focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                    getPairState(drawerPairIndex).hotVotes.has(drawerItem.id)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary"
                  }`}
                >
                  <Flame className={`w-4 h-4 ${getPairState(drawerPairIndex).hotVotes.has(drawerItem.id) ? "fill-current" : ""}`} />
                  {getPairState(drawerPairIndex).hotVotes.has(drawerItem.id) ? "Hot!" : t("markHot")}
                </button>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Insight Report Drawer */}
      <Sheet open={!!insightDrawer?.open} onOpenChange={(open) => { if (!open) setInsightDrawer(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl h-[85vh] overflow-y-auto sm:max-w-lg sm:mx-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetHeader>
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              {insightDrawer?.starName} Trend Report
            </SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            {insightLoading && !insightData[`${insightDrawer?.runId}-${insightDrawer?.starId}`] ? (
              <div className="flex flex-col items-center justify-center gap-3 min-h-[240px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <InsightLoadingText starName={insightDrawer?.starName ?? ""} t={globalT} />
              </div>
            ) : (() => {
              const key = `${insightDrawer?.runId}-${insightDrawer?.starId}`;
              const data = insightData[key];
              if (!data) return <p className="text-sm text-muted-foreground text-center py-8">No data available</p>;
              return (
                <div className="space-y-5">
                  {data.headline && (
                    <div className="rounded-xl bg-muted border border-border p-4">
                      <p className="text-lg font-bold text-foreground">{data.headline}</p>
                    </div>
                  )}
                  {data.bullets && data.bullets.length > 0 && (
                    <div className="space-y-3">
                      {data.bullets.map((bullet, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed">{bullet}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Lifestyle Trends */}
                  {data.lifestyle && data.lifestyle.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lifestyle Trends</p>
                      <div className="grid gap-2">
                        {data.lifestyle.map((item, i) => {
                          const icon = item.category === "fashion" ? "👗" : item.category === "food" ? "🍽️" : item.category === "place" ? "📍" : "🎬";
                          const catLabel = item.category === "fashion" ? (language === "ko" ? "패션" : language === "ja" ? "ファッション" : language === "zh" ? "时尚" : "Fashion")
                            : item.category === "food" ? (language === "ko" ? "음식" : language === "ja" ? "グルメ" : language === "zh" ? "美食" : "Food")
                            : item.category === "place" ? (language === "ko" ? "장소" : language === "ja" ? "スポット" : language === "zh" ? "地点" : "Place")
                            : (language === "ko" ? "활동" : language === "ja" ? "アクティビティ" : language === "zh" ? "活动" : "Activity");
                          return (
                            <div key={i} className="rounded-lg bg-muted p-3 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-base">{icon}</span>
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase">{catLabel}</span>
                              </div>
                              <p className="text-sm text-foreground leading-snug">{item.text}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {data.vibe && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">Trend Vibe:</span>
                      <Badge variant="secondary" className={cn(
                        "text-xs",
                        data.vibe === "hot" && "bg-red-500/10 text-red-600",
                        data.vibe === "rising" && "bg-orange-500/10 text-orange-600",
                        data.vibe === "steady" && "bg-emerald-500/10 text-emerald-600",
                      )}>
                        {data.vibe === "hot" ? "Hot" : data.vibe === "rising" ? "Rising" : "Steady"}
                      </Badge>
                    </div>
                  )}

                  {/* Trend Bet Box — full betting with 3 bands */}
                  {(() => {
                    const pairIdx = battlePairs.findIndex(p => p.runs.some(r => r.id === insightDrawer?.runId));
                    const pair = battlePairs[pairIdx];
                    const pairState = pairIdx >= 0 ? getPairState(pairIdx) : null;
                    const currentRun = pair?.runs.find(r => r.id === insightDrawer?.runId);
                    if (!pair || !currentRun) return null;
                    const isAlreadySubmitted = pairState?.submitted;
                    const isPicked = pairState?.pickedRunId === currentRun.id;
                    const isPickedInDrawer = pairState?.pickedRunId === currentRun.id;

                    const betTitle = language === "ko" ? `${insightDrawer?.starName}의 트렌드가 내일 더 유행할까?`
                      : language === "ja" ? `${insightDrawer?.starName}のトレンドは明日上がる？`
                      : language === "zh" ? `${insightDrawer?.starName}的趋势明天会上涨吗？`
                      : `Will ${insightDrawer?.starName}'s trend rise tomorrow?`;

                    const pickLabel = t("predictGrowth");
                    const submittedLabel = language === "ko" ? "예측 완료!" : language === "ja" ? "予測完了！" : language === "zh" ? "预测完成！" : "Prediction submitted!";
                    const alreadyLabel = language === "ko" ? "이미 예측함" : language === "ja" ? "予測済み" : language === "zh" ? "已预测" : "Already predicted";

                    return (
                      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                        <p className="text-sm font-bold text-foreground text-center">{betTitle}</p>

                        {isAlreadySubmitted ? (
                          <div className="flex items-center gap-2 py-1">
                            <Badge variant="secondary" className="text-xs">
                              {isPicked ? `✅ ${submittedLabel}` : alreadyLabel}
                            </Badge>
                            {isPicked && pairState?.selectedBand && (
                              <Badge variant="outline" className="text-xs">
                                {t(pairState.selectedBand === "steady" ? "bandSteady" : pairState.selectedBand === "rising" ? "bandRising" : "bandSurge")} {BANDS.find(b => b.key === pairState.selectedBand)?.range}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {/* Band selection */}
                            <div className="grid grid-cols-3 gap-2">
                              {BANDS.map((band) => {
                                const drawerBand = isPickedInDrawer ? pairState?.selectedBand : null;
                                const isSelected = drawerBand === band.key;
                                const BandIcon = band.icon;
                                const bandLabel = t(band.key === "steady" ? "bandSteady" : band.key === "rising" ? "bandRising" : "bandSurge");
                                return (
                                  <button
                                    key={band.key}
                                    onClick={() => {
                                      if (!user) { toast({ title: "Please log in", variant: "destructive" }); navigate("/login"); return; }
                                      // Set pick + band in a single state update to avoid stale state
                                      const currentBand = pairState?.pickedRunId === currentRun.id ? pairState?.selectedBand : null;
                                      updatePairState(pairIdx, {
                                        pickedRunId: currentRun.id,
                                        selectedBand: currentBand === band.key ? null : band.key,
                                      });
                                    }}
                                    className={cn(
                                      "flex flex-col items-center py-2.5 px-1 rounded-xl border transition-all",
                                      isSelected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
                                    )}
                                  >
                                    <span className="text-base">{band.key === "steady" ? "🌱" : band.key === "rising" ? "🔥" : "🚀"}</span>
                                    <span className="text-[10px] font-medium">{bandLabel}</span>
                                    <span className="text-sm font-extrabold mt-0.5">{band.range}</span>
                                    <span className="text-[10px] font-bold text-muted-foreground">+{band.reward.toLocaleString()} 💎</span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Submit */}
                            <Button
                              size="sm"
                              className="w-full"
                              disabled={!isPickedInDrawer || !pairState?.selectedBand}
                              onClick={() => {
                                handleSubmit(pairIdx);
                                setInsightDrawer(null);
                              }}
                            >
                              {pickLabel}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>

      <V3TabBar activeTab="battle" onTabChange={() => {}} />
      <AllTicketsUsedModal
        open={showAllUsedModal}
        onClose={() => setShowAllUsedModal(false)}
        language={language}
        userLevel={userLevel}
        kPoints={kPoints}
        totalTickets={totalTickets}
      />
      {confirmModal && (
        <PredictionConfirmModal
          open={!!confirmModal}
          onClose={() => setConfirmModal(null)}
          language={language}
          starName={confirmModal.starName}
          band={confirmModal.band}
          reward={confirmModal.reward}
          kPoints={kPoints}
        />
      )}
      <SettlementResultsModal
        open={showSettlementModal}
        onClose={async () => {
          setShowSettlementModal(false);
          // Mark all as seen
          const ids = settlementResults.map(r => r.id);
          if (ids.length > 0 && user) {
            await supabase
              .from("b2_predictions")
              .update({ seen_at: new Date().toISOString() } as any)
              .in("id", ids);
          }
        }}
        results={settlementResults}
        language={language}
      />
      {/* First Analyzer Bonus Modal */}
      <Dialog open={showFirstAnalyzerModal} onOpenChange={setShowFirstAnalyzerModal}>
        <DialogContent className="max-w-sm rounded-2xl text-center mx-auto">
          <DialogTitle className="sr-only">First Analyzer Bonus</DialogTitle>
          <DialogDescription className="sr-only">You earned a bonus for being the first to analyze this trend</DialogDescription>
          <div className="flex flex-col items-center pt-2">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-foreground">
              {globalT("battle.firstAnalyzerTitle")}
            </h3>
            <p className="mb-5 text-sm text-muted-foreground">
              {globalT("battle.firstAnalyzerDesc")}
            </p>
            <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-2 text-lg font-bold text-primary">
              <Gift className="h-5 w-5" />
              +30 K-Cashes
            </div>
            <Button className="w-full" onClick={() => setShowFirstAnalyzerModal(false)}>
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
