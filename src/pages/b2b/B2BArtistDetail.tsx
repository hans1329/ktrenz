import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  TrendingUp, Star, BarChart3, ArrowLeft,
  Activity, Zap, Brain, Sparkles, ChevronRight, Users,
  ShoppingBag, Globe, Flame, Share2, ShoppingCart
} from 'lucide-react';
import { Loader2 } from 'lucide-react';

const GRADE_CONFIG: Record<string, { label: string; color: string }> = {
  spark:     { label: 'Spark',     color: '#9CA3AF' },
  react:     { label: 'React',     color: '#3B82F6' },
  spread:    { label: 'Spread',    color: '#10B981' },
  intent:    { label: 'Intent',    color: '#F59E0B' },
  commerce:  { label: 'Commerce',  color: '#8B5CF6' },
  explosive: { label: 'Explosive', color: '#EF4444' },
};

const B2BArtistDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { org } = useOutletContext<{ org: any }>();
  const navigate = useNavigate();

  const { data: star, isLoading } = useQuery({
    queryKey: ['b2b-star-detail', id],
    queryFn: async () => {
      const { data } = await (supabase as any).from('ktrenz_stars').select('*').eq('id', id).single();
      return data;
    },
    enabled: !!id,
  });

  const { data: artistGrade } = useQuery({
    queryKey: ['b2b-artist-grade', id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('ktrenz_trend_artist_grades')
        .select('grade, grade_score, influence_score, keyword_count, grade_breakdown, score_details')
        .eq('star_id', id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: trends = [] } = useQuery({
    queryKey: ['b2b-star-trends', id, star?.display_name],
    queryFn: async () => {
      if (!star) return [];
      const { data } = await (supabase as any)
        .from('ktrenz_trend_triggers')
        .select('id, keyword, keyword_category, influence_index, trend_grade, trend_score, trend_score_details, purchase_stage, source_image_url, detected_at, status')
        .or(`star_id.eq.${id},artist_name.eq.${star.display_name}`)
        .order('trend_score', { ascending: false, nullsFirst: false })
        .limit(30);
      return data || [];
    },
    enabled: !!star,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 animate-spin text-[#9CA3AF]" />
      </div>
    );
  }

  if (!star) {
    return (
      <div className="flex items-center justify-center h-96 text-[#9CA3AF]">
        아티스트를 찾을 수 없습니다.
      </div>
    );
  }

  const activeTrends = trends.filter((t: any) => t.status === 'active');
  const gc = GRADE_CONFIG[artistGrade?.grade] || GRADE_CONFIG.spark;

  // Grade distribution from trends
  const gradeDistrib: Record<string, number> = {};
  trends.forEach((t: any) => {
    const g = (t.trend_grade || 'spark').toLowerCase();
    gradeDistrib[g] = (gradeDistrib[g] || 0) + 1;
  });

  // Category distribution
  const catDistrib: Record<string, number> = {};
  activeTrends.forEach((t: any) => {
    const c = t.keyword_category || 'other';
    catDistrib[c] = (catDistrib[c] || 0) + 1;
  });
  const maxCatCount = Math.max(...Object.values(catDistrib), 1);

  const CAT_COLORS: Record<string, string> = {
    brand: '#2563EB', product: '#8B5CF6', place: '#10B981', food: '#F59E0B',
    fashion: '#EC4899', beauty: '#EF4444', media: '#06B6D4', music: '#7C3AED',
    event: '#F97316', social: '#6366F1',
  };

  return (
    <div className="flex min-h-full">
      {/* ── CENTER ── */}
      <div className="flex-1 p-6 overflow-y-auto min-w-0 space-y-5">
        {/* Back */}
        <button onClick={() => navigate('/b2b')} className="flex items-center gap-1 text-[13px] text-[#6B7280] hover:text-[#111827] transition-colors">
          <ArrowLeft className="w-4 h-4" /> 돌아가기
        </button>

        {/* Profile Header */}
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-6">
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-[#F3F4F6] shrink-0">
              {star.image_url ? (
                <img src={star.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-[#D1D5DB]">
                  {star.display_name?.[0]}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-extrabold text-[#111827]">{star.display_name}</h1>
                {star.name_ko && star.name_ko !== star.display_name && (
                  <span className="text-sm text-[#9CA3AF]">{star.name_ko}</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-[#9CA3AF]">
                {star.agency && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{star.agency}</span>}
                {star.star_type && <span>{star.star_type === 'group' ? '그룹' : star.star_type === 'member' ? '멤버' : '솔로'}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* KIS-style Big Score Display */}
        {artistGrade && (
          <div className="bg-gradient-to-r from-[#1E3A8A] to-[#1E40AF] rounded-[10px] p-5 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-white/50 mb-1 uppercase tracking-wider">Trend Influence Score</div>
              <div className="text-[42px] font-black text-white leading-none">
                {artistGrade.influence_score > 0 ? artistGrade.influence_score.toFixed(2) : artistGrade.grade_score}
              </div>
              <div className="text-[11px] text-white/50 mt-1">{artistGrade.keyword_count} keywords tracked</div>
            </div>
            <div className="text-right space-y-1">
              <span
                className="inline-block text-[10px] font-bold px-[8px] py-[3px] rounded-[10px] bg-white/15 text-white"
              >
                {gc.label}
              </span>
              {artistGrade.grade_breakdown && Object.entries(artistGrade.grade_breakdown).map(([g, count]) => (
                <div key={g} className="text-[10px] text-white/60">
                  {GRADE_CONFIG[g]?.label || g}: {count as number}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-[14px]">
          {[
            { label: '활성 트렌드', value: activeTrends.length, color: '#2563EB' },
            { label: '전체 트렌드', value: trends.length, color: '#374151' },
            { label: '상업 의도 감지', value: trends.filter((t: any) => ['intent', 'commerce'].includes((t.trend_grade || '').toLowerCase())).length, color: '#F59E0B' },
            { label: '최고 Trend Score', value: trends.length > 0 && trends[0].trend_score != null ? (trends[0].trend_score * 100).toFixed(0) : '-', color: '#EF4444' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white rounded-[10px] p-4 border border-[#E5E7EB]">
              <div className="text-[11px] text-[#9CA3AF] font-semibold uppercase tracking-[0.5px] mb-[6px]">{kpi.label}</div>
              <p className="text-[26px] font-extrabold leading-none" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Category Bars */}
        {Object.keys(catDistrib).length > 0 && (
          <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-5">
            <div className="text-[11px] font-bold text-[#9CA3AF] mb-3 uppercase tracking-[0.5px]">카테고리별 트렌드</div>
            {Object.entries(catDistrib).sort(([,a],[,b]) => b - a).map(([cat, count]) => (
              <div key={cat} className="mb-[10px] last:mb-0">
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="font-semibold text-[#374151] capitalize">{cat}</span>
                  <span className="font-bold text-[#111827]">{count}</span>
                </div>
                <div className="bg-[#F3F4F6] rounded h-[5px]">
                  <div
                    className="rounded h-[5px] transition-all"
                    style={{ width: `${(count / maxCatCount) * 100}%`, backgroundColor: CAT_COLORS[cat] || '#9CA3AF' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Trend List */}
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-[18px] py-[14px] border-b border-[#F3F4F6] flex items-center justify-between">
            <div className="text-[14px] font-bold text-[#111827] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#2563EB]" />
              관련 트렌드 ({trends.length})
            </div>
          </div>
          <div className="divide-y divide-[#F9FAFB]">
            {trends.slice(0, 15).map((trend: any) => {
              const tgc = GRADE_CONFIG[(trend.trend_grade || 'spark').toLowerCase()] || GRADE_CONFIG.spark;
              return (
                <div key={trend.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[#F9FAFB] transition-colors">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#F3F4F6] shrink-0">
                    {trend.source_image_url ? (
                      <img src={trend.source_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#D1D5DB]">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[#111827] font-medium truncate">{trend.keyword}</p>
                    <p className="text-[11px] text-[#9CA3AF]">
                      {trend.keyword_category} · {new Date(trend.detected_at).toLocaleDateString('ko-KR')}
                      {trend.purchase_stage && ` · ${trend.purchase_stage}`}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-[2px] rounded-[10px]"
                    style={{ backgroundColor: `${tgc.color}20`, color: tgc.color }}
                  >
                    {tgc.label}
                  </span>
                  <div className="text-right w-16">
                    <p className="text-[14px] font-bold text-[#111827]">
                      {trend.trend_score != null ? (trend.trend_score * 100).toFixed(0) : (trend.influence_index ?? 0).toFixed(0)}
                    </p>
                    <p className="text-[10px] text-[#9CA3AF]">score</p>
                  </div>
                  <span className={`text-[10px] px-[6px] py-[2px] rounded ${
                    trend.status === 'active' ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#F3F4F6] text-[#9CA3AF]'
                  }`}>
                    {trend.status === 'active' ? '활성' : '종료'}
                  </span>
                </div>
              );
            })}
            {trends.length === 0 && (
              <div className="px-5 py-12 text-center text-[#9CA3AF]">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">관련 트렌드가 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── AI INSIGHT PANEL ── */}
      <aside className="w-[320px] min-w-[320px] bg-white border-l border-[#E5E7EB] flex flex-col shrink-0 sticky top-[52px] h-[calc(100vh-52px)]">
        <div className="px-[18px] py-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse" />
            <span className="text-[14px] font-bold text-[#111827]">AI Analyst</span>
          </div>
          <span className="text-[11px] text-[#9CA3AF]">{trends.length}건</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Summary */}
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg p-[10px]">
            <div className="text-[10px] font-bold text-[#2563EB] mb-1 uppercase">종합 평가</div>
            <p className="text-[12px] text-[#1E40AF] leading-[1.5]">
              {activeTrends.length > 0
                ? `${star.display_name} — ${activeTrends.length}개 활성 트렌드. ${
                    artistGrade?.influence_score > 0 ? `Influence Score ${artistGrade.influence_score.toFixed(2)}.` : ''
                  } ${trends.filter((t: any) => ['intent', 'commerce'].includes((t.trend_grade || '').toLowerCase())).length}건의 상업적 의도 감지.`
                : `${star.display_name}의 현재 활성 트렌드 없음.`}
            </p>
          </div>

          {/* Grade Distribution */}
          {Object.keys(gradeDistrib).length > 0 && (
            <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-3">
              <div className="text-[10px] font-bold text-[#9CA3AF] mb-2 uppercase tracking-[0.5px]">등급 분포</div>
              {Object.entries(gradeDistrib).sort(([,a],[,b]) => b - a).map(([grade, count]) => {
                const g = GRADE_CONFIG[grade];
                const pct = trends.length > 0 ? (count / trends.length) * 100 : 0;
                return (
                  <div key={grade} className="flex items-center gap-2 mb-2 last:mb-0">
                    <span className="text-[10px] font-semibold w-16" style={{ color: g?.color }}>{g?.label || grade}</span>
                    <div className="flex-1 h-[5px] bg-[#F3F4F6] rounded overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: g?.color }} />
                    </div>
                    <span className="text-[10px] text-[#9CA3AF] w-6 text-right font-mono">{count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Actions */}
          <div>
            <p className="text-[10px] text-[#9CA3AF] font-semibold mb-2 uppercase tracking-wider">빠른 실행</p>
            <div className="space-y-1.5">
              {[
                { label: 'Pre/Post 분석', icon: <BarChart3 className="w-3.5 h-3.5" /> },
                { label: '경쟁사 벤치마크', icon: <Globe className="w-3.5 h-3.5" /> },
                { label: '캠페인 시뮬레이션', icon: <Zap className="w-3.5 h-3.5" /> },
              ].map(action => (
                <button
                  key={action.label}
                  disabled
                  title="준비 중"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#D1D5DB] cursor-not-allowed opacity-60"
                >
                  <span className="text-[#D1D5DB]">{action.icon}</span>
                  {action.label}
                  <span className="ml-auto text-[9px] font-semibold text-[#D1D5DB] uppercase">Soon</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default B2BArtistDetail;
