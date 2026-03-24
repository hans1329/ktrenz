import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search, Loader2, TrendingUp, ShoppingBag, Newspaper,
  BookOpen, AlertTriangle, CheckCircle2, XCircle, Megaphone,
  ExternalLink, Sparkles, Target
} from 'lucide-react';

interface ProbeResult {
  keyword: string;
  artist_name: string | null;
  realtime: {
    news_total: number;
    blog_total: number;
    shop_total: number;
    buzz_score: number;
  };
  existing_trend: {
    id: string;
    keyword: string;
    artist_name: string;
    influence_index: number;
    trend_score: number;
    trend_grade: string;
    purchase_stage: string;
    commercial_intent: string;
    keyword_category: string;
    source_image_url: string | null;
    detected_at: string;
  } | null;
  analysis: {
    sentiment: { positive: number; negative: number; neutral: number };
    purchase_stage: string;
    campaign: {
      detected: boolean;
      confidence: number;
      type: string;
      brand?: string;
      artist?: string;
      indicators: string[];
    };
  };
  headlines: { title: string; link: string; pubDate: string }[];
}

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  awareness: { label: '인지', color: 'hsl(200,80%,55%)' },
  interest: { label: '관심', color: 'hsl(170,70%,50%)' },
  consideration: { label: '고려', color: 'hsl(45,90%,55%)' },
  purchase: { label: '구매', color: 'hsl(270,80%,60%)' },
  review: { label: '리뷰', color: 'hsl(15,90%,55%)' },
};

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  sponsorship: '스폰서십/협찬',
  ad: '광고 캠페인',
  collaboration: '브랜드 콜라보',
  organic: '자연 발생',
};

export default function KeywordProbePanel() {
  const [keyword, setKeyword] = useState('');
  const [artistFilter, setArtistFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleProbe = async () => {
    if (!keyword.trim() || keyword.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('ktrenz-keyword-probe', {
        body: { keyword: keyword.trim(), artist_name: artistFilter.trim() || undefined },
      });
      if (fnErr) throw fnErr;
      setResult(data as ProbeResult);
    } catch (e: any) {
      setError(e.message || '프로브 실패');
    } finally {
      setLoading(false);
    }
  };

  const stage = result ? STAGE_LABELS[result.analysis.purchase_stage] || STAGE_LABELS.awareness : null;

  return (
    <div className="space-y-4">
      {/* 검색 입력 */}
      <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)] p-4">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Search className="w-4 h-4 text-[hsl(270,80%,60%)]" />
          키워드 프로브
        </h3>
        <div className="flex gap-2 mb-2">
          <Input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleProbe()}
            placeholder="키워드 입력 (예: 올리브영, 아리랑)"
            className="bg-[hsl(220,15%,8%)] border-[hsl(220,15%,18%)] text-white placeholder:text-[hsl(220,10%,30%)] h-9 text-sm flex-1"
          />
          <button
            onClick={handleProbe}
            disabled={loading || keyword.trim().length < 2}
            className="px-4 h-9 rounded-lg bg-[hsl(270,80%,55%)] text-white text-sm font-medium hover:bg-[hsl(270,80%,50%)] disabled:opacity-40 flex items-center gap-1.5 shrink-0"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            조회
          </button>
        </div>
        <Input
          value={artistFilter}
          onChange={e => setArtistFilter(e.target.value)}
          placeholder="아티스트명 (선택)"
          className="bg-[hsl(220,15%,8%)] border-[hsl(220,15%,18%)] text-white placeholder:text-[hsl(220,10%,30%)] h-8 text-xs"
        />
      </div>

      {error && (
        <div className="bg-[hsl(0,60%,15%)] rounded-lg border border-[hsl(0,60%,25%)] p-3 text-xs text-[hsl(0,80%,70%)]">
          {error}
        </div>
      )}

      {result && (
        <>
          {/* 실시간 수치 */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '뉴스', value: result.realtime.news_total.toLocaleString(), icon: Newspaper, color: 'hsl(200,80%,55%)' },
              { label: '블로그', value: result.realtime.blog_total.toLocaleString(), icon: BookOpen, color: 'hsl(170,70%,50%)' },
              { label: '쇼핑', value: result.realtime.shop_total.toLocaleString(), icon: ShoppingBag, color: 'hsl(45,90%,55%)' },
              { label: '버즈 점수', value: `${result.realtime.buzz_score}/100`, icon: TrendingUp, color: 'hsl(270,80%,60%)' },
            ].map(m => (
              <div key={m.label} className="bg-[hsl(220,15%,12%)] rounded-lg border border-[hsl(220,15%,16%)] p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <m.icon className="w-3 h-3" style={{ color: m.color }} />
                  <span className="text-[10px] text-[hsl(220,10%,45%)]">{m.label}</span>
                </div>
                <p className="text-lg font-bold text-white">{m.value}</p>
              </div>
            ))}
          </div>

          {/* 감성 분석 */}
          <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)] p-3">
            <p className="text-[10px] text-[hsl(220,10%,40%)] font-medium mb-2 uppercase tracking-wider">감성 분석</p>
            <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-2">
              {result.analysis.sentiment.positive > 0 && (
                <div className="bg-[hsl(150,60%,45%)]" style={{ width: `${result.analysis.sentiment.positive}%` }} />
              )}
              {result.analysis.sentiment.neutral > 0 && (
                <div className="bg-[hsl(220,10%,40%)]" style={{ width: `${result.analysis.sentiment.neutral}%` }} />
              )}
              {result.analysis.sentiment.negative > 0 && (
                <div className="bg-[hsl(0,70%,50%)]" style={{ width: `${result.analysis.sentiment.negative}%` }} />
              )}
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-[hsl(150,60%,55%)] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> 긍정 {result.analysis.sentiment.positive}%
              </span>
              <span className="text-[hsl(220,10%,50%)]">중립 {result.analysis.sentiment.neutral}%</span>
              <span className="text-[hsl(0,70%,60%)] flex items-center gap-1">
                <XCircle className="w-3 h-3" /> 부정 {result.analysis.sentiment.negative}%
              </span>
            </div>
          </div>

          {/* 구매 단계 */}
          {stage && (
            <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)] p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-[hsl(220,10%,40%)] font-medium uppercase tracking-wider">구매 단계</p>
                <Badge variant="outline" className="text-[10px] border-none" style={{ color: stage.color, backgroundColor: `${stage.color}20` }}>
                  <Target className="w-3 h-3 mr-1" />
                  {stage.label}
                </Badge>
              </div>
              <div className="flex gap-1 mt-2">
                {Object.entries(STAGE_LABELS).map(([key, s]) => (
                  <div
                    key={key}
                    className="flex-1 h-1.5 rounded-full"
                    style={{
                      backgroundColor: key === result.analysis.purchase_stage ? s.color : 'hsl(220,15%,20%)',
                      opacity: key === result.analysis.purchase_stage ? 1 : 0.3,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 캠페인 감지 */}
          <div className={`rounded-xl border p-3 ${
            result.analysis.campaign.detected
              ? 'bg-[hsl(270,40%,12%)] border-[hsl(270,60%,30%)]'
              : 'bg-[hsl(220,15%,12%)] border-[hsl(220,15%,16%)]'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {result.analysis.campaign.detected ? (
                <Megaphone className="w-4 h-4 text-[hsl(270,80%,60%)]" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-[hsl(220,10%,40%)]" />
              )}
              <span className="text-xs font-semibold text-white">
                {result.analysis.campaign.detected ? '캠페인 감지됨' : '캠페인 미감지'}
              </span>
              {result.analysis.campaign.detected && (
                <span className="text-[10px] ml-auto px-1.5 py-0.5 rounded bg-[hsl(270,80%,55%,0.2)] text-[hsl(270,80%,70%)] font-medium">
                  신뢰도 {Math.round(result.analysis.campaign.confidence * 100)}%
                </span>
              )}
            </div>
            {result.analysis.campaign.detected && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[hsl(220,10%,45%)]">유형:</span>
                  <span className="text-white font-medium">
                    {CAMPAIGN_TYPE_LABELS[result.analysis.campaign.type] || result.analysis.campaign.type}
                  </span>
                </div>
                {result.analysis.campaign.brand && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[hsl(220,10%,45%)]">브랜드:</span>
                    <span className="text-white font-medium">{result.analysis.campaign.brand}</span>
                  </div>
                )}
                {result.analysis.campaign.artist && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[hsl(220,10%,45%)]">아티스트:</span>
                    <span className="text-white font-medium">{result.analysis.campaign.artist}</span>
                  </div>
                )}
                <div className="mt-1.5 space-y-0.5">
                  {result.analysis.campaign.indicators.slice(0, 3).map((ind, i) => (
                    <p key={i} className="text-[10px] text-[hsl(220,10%,45%)] flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-[hsl(270,80%,60%)]" />
                      {ind}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 기존 트렌드 매칭 */}
          {result.existing_trend && (
            <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(150,40%,25%)] p-3">
              <p className="text-[10px] text-[hsl(150,60%,55%)] font-medium mb-2 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> 기존 트렌드 매칭
              </p>
              <div className="flex items-center gap-3">
                {result.existing_trend.source_image_url && (
                  <img src={result.existing_trend.source_image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{result.existing_trend.keyword}</p>
                  <p className="text-xs text-[hsl(220,10%,45%)]">{result.existing_trend.artist_name}</p>
                </div>
                <Badge variant="outline" className="text-[10px] border-none bg-[hsl(270,80%,55%,0.15)] text-[hsl(270,80%,70%)]">
                  {result.existing_trend.trend_grade || 'Spark'}
                </Badge>
              </div>
              <div className="flex gap-3 mt-2 text-[10px]">
                <span className="text-[hsl(220,10%,45%)]">
                  영향력 <span className="text-white font-bold">{result.existing_trend.influence_index?.toFixed(1)}</span>
                </span>
                <span className="text-[hsl(220,10%,45%)]">
                  스코어 <span className="text-white font-bold">{(result.existing_trend.trend_score ?? 0).toFixed(0)}</span>
                </span>
                <span className="text-[hsl(220,10%,45%)]">
                  의도 <span className="text-white font-bold">{result.existing_trend.commercial_intent}</span>
                </span>
              </div>
            </div>
          )}

          {/* 최근 헤드라인 */}
          {result.headlines.length > 0 && (
            <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)] p-3">
              <p className="text-[10px] text-[hsl(220,10%,40%)] font-medium mb-2 uppercase tracking-wider">최근 헤드라인</p>
              <div className="space-y-1.5">
                {result.headlines.map((h, i) => (
                  <a
                    key={i}
                    href={h.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 text-xs text-[hsl(220,10%,55%)] hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 text-[hsl(220,10%,35%)]" />
                    <span className="line-clamp-2">{h.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
