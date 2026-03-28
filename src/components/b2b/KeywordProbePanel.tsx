import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search, Loader2, TrendingUp, ShoppingBag, Newspaper,
  BookOpen, AlertTriangle, CheckCircle2, XCircle, Megaphone,
  ExternalLink, Sparkles, Target, Twitter, Instagram, Music2
} from 'lucide-react';

interface ProbeResult {
  keyword: string;
  artist_name: string | null;
  realtime: {
    news_total: number;
    blog_total: number;
    shop_total: number;
    buzz_score: number;
    x_mentions?: number;
    instagram_posts?: number;
    tiktok_videos?: number;
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
  headlines: { title: string; link: string; pubDate: string; source?: string }[];
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

const SOURCE_STYLES: Record<string, { icon: any; color: string; label: string }> = {
  news: { icon: Newspaper, color: 'hsl(200,80%,55%)', label: '뉴스' },
  blog: { icon: BookOpen, color: 'hsl(170,70%,50%)', label: '블로그' },
  x: { icon: Twitter, color: 'hsl(200,90%,50%)', label: 'X' },
  instagram: { icon: Instagram, color: 'hsl(330,80%,60%)', label: 'Instagram' },
  tiktok: { icon: Music2, color: 'hsl(350,80%,55%)', label: 'TikTok' },
};

// Mock data for SEVENTEEN keyword probes
const SEVENTEEN_MOCK_RESULTS: Record<string, ProbeResult> = {
  '세븐틴 디올': {
    keyword: '세븐틴 디올',
    artist_name: 'SEVENTEEN',
    realtime: { news_total: 1842, blog_total: 3256, shop_total: 892, buzz_score: 94, x_mentions: 12400, instagram_posts: 3870, tiktok_videos: 945 },
    existing_trend: {
      id: 'mt-1', keyword: '세븐틴 x 디올', artist_name: 'SEVENTEEN', influence_index: 92,
      trend_score: 0.94, trend_grade: 'Explosive', purchase_stage: 'purchase',
      commercial_intent: 'high', keyword_category: 'brand', source_image_url: null, detected_at: new Date().toISOString(),
    },
    analysis: {
      sentiment: { positive: 72, negative: 3, neutral: 25 },
      purchase_stage: 'purchase',
      campaign: { detected: true, confidence: 0.96, type: 'collaboration', brand: 'Dior', artist: 'SEVENTEEN', indicators: ['공식 앰배서더 발표 후 검색량 340% 급증', 'X에서 #SVT_Dior 해시태그 12.4K 멘션', 'Instagram Stories에서 디올 매장 방문 인증 게시물 급증', '팬덤 주도 구매 인증 릴레이 확산'] },
    },
    headlines: [
      { title: '세븐틴 정한, 디올 SS26 컬렉션 프론트로 참석 "글로벌 앰배서더의 품격"', link: '#', pubDate: '2시간 전', source: 'news' },
      { title: '세븐틴 x 디올 한정판 백팩, 온라인 출시 30분 만에 완판', link: '#', pubDate: '5시간 전', source: 'news' },
      { title: '[블로그] 디올 세븐틴 콜라보 제품 언박싱 후기 — 정한 포토카드 동봉!', link: '#', pubDate: '8시간 전', source: 'blog' },
      { title: '@pledis_svt: 정한 x Dior SS26 비하인드 영상 🎬 #SVT_Dior', link: '#', pubDate: '3시간 전', source: 'x' },
      { title: '세븐틴 캐럿들 디올 매장 줄서기 인증 🔥 "정한이 때문에 명품 입문"', link: '#', pubDate: '4시간 전', source: 'instagram' },
      { title: '정한 디올 공항패션 따라하기 챌린지 💃 #SVTDiorChallenge 조회수 2.1M', link: '#', pubDate: '6시간 전', source: 'tiktok' },
    ],
  },
  '정한 향수': {
    keyword: '정한 향수',
    artist_name: 'SEVENTEEN',
    realtime: { news_total: 423, blog_total: 1890, shop_total: 2145, buzz_score: 87, x_mentions: 5600, instagram_posts: 2100, tiktok_videos: 420 },
    existing_trend: {
      id: 'mt-2', keyword: '정한 향수 컬렉션', artist_name: 'SEVENTEEN', influence_index: 85,
      trend_score: 0.87, trend_grade: 'Commerce', purchase_stage: 'consideration',
      commercial_intent: 'high', keyword_category: 'product', source_image_url: null, detected_at: new Date().toISOString(),
    },
    analysis: {
      sentiment: { positive: 68, negative: 5, neutral: 27 },
      purchase_stage: 'consideration',
      campaign: { detected: true, confidence: 0.82, type: 'sponsorship', brand: 'Dior Parfums', artist: 'SEVENTEEN 정한', indicators: ['정한 사용 향수 검색량 주간 180% 증가', 'X에서 #정한향수 해시태그 트렌딩', '올리브영 정한 향수 관련 검색어 급상승'] },
    },
    headlines: [
      { title: '"정한이 뿌리는 그 향수" 디올 Sauvage 올리브영 매출 230% 급증', link: '#', pubDate: '4시간 전', source: 'news' },
      { title: '[블로그] 정한 향수 BEST 5 — 팬미팅에서 직접 확인한 리스트', link: '#', pubDate: '6시간 전', source: 'blog' },
      { title: '@jeonghan_scent: 정한이 쓰는 향수 올리브영에서 찾았다 🥹', link: '#', pubDate: '2시간 전', source: 'x' },
      { title: '정한 향수 하울 💐 모든 향 비교 테스트 | 결과 충격', link: '#', pubDate: '5시간 전', source: 'tiktok' },
      { title: '정한 최애 향수 레이어링법 따라하기 — 실제 후기 (놀라움)', link: '#', pubDate: '8시간 전', source: 'instagram' },
    ],
  },
};

const DEFAULT_MOCK: ProbeResult = SEVENTEEN_MOCK_RESULTS['세븐틴 디올'];

export default function KeywordProbePanel() {
  const [keyword, setKeyword] = useState('');
  const [artistFilter, setArtistFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(DEFAULT_MOCK);
  const [error, setError] = useState<string | null>(null);

  const handleProbe = async () => {
    if (!keyword.trim() || keyword.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setResult(null);

    // Check mock data first
    const mockKey = Object.keys(SEVENTEEN_MOCK_RESULTS).find(k =>
      keyword.trim().includes(k) || k.includes(keyword.trim())
    );
    if (mockKey) {
      setTimeout(() => {
        setResult(SEVENTEEN_MOCK_RESULTS[mockKey]);
        setLoading(false);
      }, 800);
      return;
    }

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
    <div className="space-y-3">
      {/* 검색 입력 */}
      <div className="bg-[#F9FAFB] rounded-lg border border-[#E5E7EB] p-3">
        <h3 className="text-[12px] font-bold text-[#111827] mb-2 flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-[#2563EB]" />
          키워드 프로브
        </h3>
        <div className="flex gap-1.5 mb-1.5">
          <Input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleProbe()}
            placeholder="키워드 (예: 세븐틴 디올)"
            className="bg-white border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] h-8 text-[12px] flex-1"
          />
          <button
            onClick={handleProbe}
            disabled={loading || keyword.trim().length < 2}
            className="px-3 h-8 rounded-md bg-[#2563EB] text-white text-[11px] font-semibold hover:bg-[#1D4ED8] disabled:opacity-40 flex items-center gap-1 shrink-0"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            조회
          </button>
        </div>
        <Input
          value={artistFilter}
          onChange={e => setArtistFilter(e.target.value)}
          placeholder="아티스트명 (선택)"
          className="bg-white border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF] h-7 text-[11px]"
        />
      </div>

      {error && (
        <div className="bg-[#FEF2F2] rounded-lg border border-[#FECACA] p-2.5 text-[11px] text-[#991B1B]">
          {error}
        </div>
      )}

      {result && (
        <>
          {/* 실시간 수치 — 2열 그리드 */}
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: '뉴스', value: result.realtime.news_total.toLocaleString(), icon: Newspaper, color: '#2563EB' },
              { label: '블로그', value: result.realtime.blog_total.toLocaleString(), icon: BookOpen, color: '#10B981' },
              { label: '쇼핑', value: result.realtime.shop_total.toLocaleString(), icon: ShoppingBag, color: '#F59E0B' },
              { label: '버즈 점수', value: `${result.realtime.buzz_score}/100`, icon: TrendingUp, color: '#8B5CF6' },
              ...(result.realtime.x_mentions != null ? [{ label: 'X 멘션', value: result.realtime.x_mentions.toLocaleString(), icon: Twitter, color: '#1D9BF0' }] : []),
              ...(result.realtime.instagram_posts != null ? [{ label: 'Instagram', value: result.realtime.instagram_posts.toLocaleString(), icon: Instagram, color: '#E4405F' }] : []),
              ...(result.realtime.tiktok_videos != null ? [{ label: 'TikTok', value: result.realtime.tiktok_videos.toLocaleString(), icon: Music2, color: '#FF0050' }] : []),
            ].map(m => (
              <div key={m.label} className="bg-white rounded-lg border border-[#E5E7EB] p-2.5">
                <div className="flex items-center gap-1 mb-0.5">
                  <m.icon className="w-3 h-3" style={{ color: m.color }} />
                  <span className="text-[9px] text-[#9CA3AF] font-semibold uppercase">{m.label}</span>
                </div>
                <p className="text-[15px] font-extrabold text-[#111827]">{m.value}</p>
              </div>
            ))}
          </div>

          {/* 감성 분석 */}
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-2.5">
            <p className="text-[9px] text-[#9CA3AF] font-semibold mb-1.5 uppercase tracking-wider">감성 분석</p>
            <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden mb-1.5">
              {result.analysis.sentiment.positive > 0 && (
                <div className="bg-[#10B981] rounded-l-full" style={{ width: `${result.analysis.sentiment.positive}%` }} />
              )}
              {result.analysis.sentiment.neutral > 0 && (
                <div className="bg-[#9CA3AF]" style={{ width: `${result.analysis.sentiment.neutral}%` }} />
              )}
              {result.analysis.sentiment.negative > 0 && (
                <div className="bg-[#EF4444] rounded-r-full" style={{ width: `${result.analysis.sentiment.negative}%` }} />
              )}
            </div>
            <div className="flex justify-between text-[9px]">
              <span className="text-[#10B981] flex items-center gap-0.5"><CheckCircle2 className="w-2.5 h-2.5" /> 긍정 {result.analysis.sentiment.positive}%</span>
              <span className="text-[#9CA3AF]">중립 {result.analysis.sentiment.neutral}%</span>
              <span className="text-[#EF4444] flex items-center gap-0.5"><XCircle className="w-2.5 h-2.5" /> 부정 {result.analysis.sentiment.negative}%</span>
            </div>
          </div>

          {/* 구매 단계 */}
          {stage && (
            <div className="bg-white rounded-lg border border-[#E5E7EB] p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[9px] text-[#9CA3AF] font-semibold uppercase tracking-wider">구매 단계</p>
                <Badge variant="outline" className="text-[9px] border-none font-bold" style={{ color: stage.color, backgroundColor: `${stage.color}20` }}>
                  <Target className="w-2.5 h-2.5 mr-0.5" />
                  {stage.label}
                </Badge>
              </div>
              <div className="flex gap-0.5 mt-1.5">
                {Object.entries(STAGE_LABELS).map(([key, s]) => (
                  <div key={key} className="flex-1 h-1 rounded-full" style={{
                    backgroundColor: key === result.analysis.purchase_stage ? s.color : '#E5E7EB',
                    opacity: key === result.analysis.purchase_stage ? 1 : 0.4,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* 캠페인 감지 */}
          <div className={`rounded-lg border p-2.5 ${
            result.analysis.campaign.detected
              ? 'bg-[#F5F3FF] border-[#DDD6FE]'
              : 'bg-white border-[#E5E7EB]'
          }`}>
            <div className="flex items-center gap-1.5 mb-1.5">
              {result.analysis.campaign.detected ? (
                <Megaphone className="w-3.5 h-3.5 text-[#8B5CF6]" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-[#9CA3AF]" />
              )}
              <span className="text-[11px] font-bold text-[#111827]">
                {result.analysis.campaign.detected ? '캠페인 감지됨' : '캠페인 미감지'}
              </span>
              {result.analysis.campaign.detected && (
                <span className="text-[9px] ml-auto px-1.5 py-0.5 rounded-full bg-[#8B5CF6]/10 text-[#8B5CF6] font-bold">
                  신뢰도 {Math.round(result.analysis.campaign.confidence * 100)}%
                </span>
              )}
            </div>
            {result.analysis.campaign.detected && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-[#9CA3AF]">유형:</span>
                  <span className="text-[#111827] font-semibold">{CAMPAIGN_TYPE_LABELS[result.analysis.campaign.type] || result.analysis.campaign.type}</span>
                </div>
                {result.analysis.campaign.brand && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-[#9CA3AF]">브랜드:</span>
                    <span className="text-[#111827] font-semibold">{result.analysis.campaign.brand}</span>
                  </div>
                )}
                {result.analysis.campaign.artist && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-[#9CA3AF]">아티스트:</span>
                    <span className="text-[#111827] font-semibold">{result.analysis.campaign.artist}</span>
                  </div>
                )}
                <div className="mt-1 space-y-0.5">
                  {result.analysis.campaign.indicators.map((ind, i) => (
                    <p key={i} className="text-[10px] text-[#6B7280] flex items-start gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-[#8B5CF6] mt-0.5 shrink-0" />
                      {ind}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 기존 트렌드 매칭 */}
          {result.existing_trend && (
            <div className="bg-white rounded-lg border border-[#BBF7D0] p-2.5">
              <p className="text-[9px] text-[#10B981] font-semibold mb-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> 기존 트렌드 매칭
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-[#111827] font-bold truncate">{result.existing_trend.keyword}</p>
                  <p className="text-[10px] text-[#9CA3AF]">{result.existing_trend.artist_name}</p>
                </div>
                <Badge variant="outline" className="text-[9px] border-none bg-[#8B5CF6]/10 text-[#8B5CF6] font-bold">
                  {result.existing_trend.trend_grade || 'Spark'}
                </Badge>
              </div>
              <div className="flex gap-3 mt-1.5 text-[9px]">
                <span className="text-[#9CA3AF]">영향력 <span className="text-[#111827] font-bold">{result.existing_trend.influence_index?.toFixed(1)}</span></span>
                <span className="text-[#9CA3AF]">스코어 <span className="text-[#111827] font-bold">{((result.existing_trend.trend_score ?? 0) * 100).toFixed(0)}</span></span>
                <span className="text-[#9CA3AF]">의도 <span className="text-[#111827] font-bold">{result.existing_trend.commercial_intent}</span></span>
              </div>
            </div>
          )}

          {/* 근거 컨텐츠 — 소스별 구분 */}
          {result.headlines.length > 0 && (
            <div className="bg-white rounded-lg border border-[#E5E7EB] p-2.5">
              <p className="text-[9px] text-[#9CA3AF] font-semibold mb-2 uppercase tracking-wider">근거 컨텐츠</p>
              <div className="space-y-1.5">
                {result.headlines.map((h, i) => {
                  const src = SOURCE_STYLES[h.source || 'news'] || SOURCE_STYLES.news;
                  const SrcIcon = src.icon;
                  return (
                    <a
                      key={i}
                      href={h.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 text-[11px] text-[#374151] hover:text-[#2563EB] transition-colors group"
                    >
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <SrcIcon className="w-3 h-3" style={{ color: src.color }} />
                        <span className="text-[8px] font-bold uppercase" style={{ color: src.color }}>{src.label}</span>
                      </div>
                      <span className="flex-1 line-clamp-2 leading-[1.4]">{h.title}</span>
                      <span className="text-[9px] text-[#9CA3AF] shrink-0 mt-0.5">{h.pubDate}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
