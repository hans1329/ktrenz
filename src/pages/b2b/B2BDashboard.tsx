import { useOutletContext, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  TrendingUp, TrendingDown, Zap, Star, BarChart3, ArrowUpRight,
  Activity, ShoppingBag, Eye, Brain, Sparkles, ChevronRight,
  Flame, Share2, ShoppingCart
} from 'lucide-react';
import { useState, useMemo } from 'react';
import KeywordProbePanel from '@/components/b2b/KeywordProbePanel';
import { MOCK_ARTIST_GRADES, MOCK_ACTIVE_TRENDS } from '@/data/b2b-mock-data';

const GRADE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  spark:     { label: 'Spark',     color: '#9CA3AF', icon: Zap },
  react:     { label: 'React',     color: '#3B82F6', icon: TrendingUp },
  spread:    { label: 'Spread',    color: '#10B981', icon: Share2 },
  intent:    { label: 'Intent',    color: '#F59E0B', icon: ShoppingCart },
  commerce:  { label: 'Commerce',  color: '#8B5CF6', icon: Star },
  explosive: { label: 'Explosive', color: '#EF4444', icon: Flame },
};

const B2BDashboard = () => {
  const { org } = useOutletContext<{ org: any }>();
  const navigate = useNavigate();
  const [gradeFilter, setGradeFilter] = useState<string>('all');

  // Fetch active trends with trend_score
  const { data: rawTrends = [] } = useQuery({
    queryKey: ['b2b-active-trends'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('ktrenz_trend_triggers')
        .select('id, keyword, keyword_category, artist_name, influence_index, trend_score, trend_grade, purchase_stage, source_image_url, detected_at, star_id')
        .eq('status', 'active')
        .not('trend_grade', 'is', null)
        .order('trend_score', { ascending: false, nullsFirst: false })
        .limit(100);
      return data || [];
    },
  });

  const { data: rawArtistGrades = [] } = useQuery({
    queryKey: ['b2b-artist-grades'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('ktrenz_trend_artist_grades')
        .select('id, star_id, grade, grade_score, influence_score, keyword_count, grade_breakdown, computed_at')
        .order('influence_score', { ascending: false })
        .limit(50);
      if (!data) return [];
      const starIds = data.map((a: any) => a.star_id);
      const { data: stars } = await (supabase as any)
        .from('ktrenz_stars')
        .select('id, display_name, name_ko, agency, image_url')
        .in('id', starIds);
      const starMap = new Map((stars || []).map((s: any) => [s.id, s]));
      return data.map((a: any) => ({ ...a, star: starMap.get(a.star_id) }));
    },
  });

  // Use mock data when real data is empty
  const activeTrends = rawTrends.length > 0 ? rawTrends : MOCK_ACTIVE_TRENDS;
  const artistGrades = rawArtistGrades.length > 0 ? rawArtistGrades : MOCK_ARTIST_GRADES;
  const usingMock = rawTrends.length === 0 && rawArtistGrades.length === 0;

  // Stats
  const gradeStats = useMemo(() => {
    const counts: Record<string, number> = {};
    activeTrends.forEach((t: any) => {
      const g = (t.trend_grade || 'spark').toLowerCase();
      counts[g] = (counts[g] || 0) + 1;
    });
    return counts;
  }, [activeTrends]);

  const filteredTrends = useMemo(() => {
    if (gradeFilter === 'all') return activeTrends;
    return activeTrends.filter((t: any) => (t.trend_grade || 'spark').toLowerCase() === gradeFilter);
  }, [activeTrends, gradeFilter]);

  const breakoutCount = activeTrends.filter((t: any) => {
    const g = (t.trend_grade || '').toLowerCase();
    return g === 'explosive' || g === 'commerce';
  }).length;

  return (
    <div className="flex min-h-full">
      {/* ── CENTER CONTENT ── */}
      <div className="flex-1 p-6 overflow-y-auto min-w-0">
        <h1 className="text-xl font-extrabold text-[#111827] mb-1">Stars Intelligence</h1>
        <p className="text-[13px] text-[#6B7280] mb-5">Trend Score 기반 스타 분석 · 라이프사이클 추적 · 상업적 전환 모니터링</p>

        {/* Stat Row */}
        <div className="grid grid-cols-4 gap-[14px] mb-5">
          {[
            { label: '활성 트렌드', value: activeTrends.length, sub: `${Object.keys(gradeStats).length}개 등급 분포` },
            { label: '모니터링 아티스트', value: artistGrades.length, sub: 'Trend Score 기반', color: '#2563EB' },
            { label: 'Breakout 신호', value: breakoutCount, sub: 'Commerce + Explosive', color: '#EF4444' },
            { label: '상업 전환 감지', value: gradeStats['intent'] || 0, sub: 'Intent 이상 등급', color: '#F59E0B' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-[10px] p-4 border border-[#E5E7EB]">
              <div className="text-[11px] text-[#9CA3AF] font-semibold uppercase tracking-[0.5px] mb-[6px]">{s.label}</div>
              <div className="text-[26px] font-extrabold leading-none" style={{ color: s.color || '#111827' }}>{s.value}</div>
              <div className="text-[11px] text-[#9CA3AF] mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Artist Table */}
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-[#F3F4F6] flex items-center justify-between">
            <div className="text-[14px] font-bold text-[#111827]">아티스트 Trend Score</div>
            <div className="flex gap-2">
              <button
                onClick={() => setGradeFilter('all')}
                className={`px-3 py-[5px] rounded-[6px] text-[11px] font-semibold border cursor-pointer transition-colors ${
                  gradeFilter === 'all'
                    ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#2563EB]'
                    : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#374151] hover:bg-[#F3F4F6]'
                }`}
              >
                전체
              </button>
              {Object.entries(GRADE_CONFIG).map(([key, cfg]) => {
                const count = gradeStats[key] || 0;
                if (count === 0 && gradeFilter !== key) return null;
                return (
                  <button
                    key={key}
                    onClick={() => setGradeFilter(key)}
                    className={`px-3 py-[5px] rounded-[6px] text-[11px] font-semibold border cursor-pointer transition-colors ${
                      gradeFilter === key
                        ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#2563EB]'
                        : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#374151] hover:bg-[#F3F4F6]'
                    }`}
                  >
                    {cfg.label} {count > 0 && `(${count})`}
                  </button>
                );
              })}
            </div>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="px-4 py-[10px] text-left text-[11px] font-bold text-[#9CA3AF] bg-[#F9FAFB] uppercase tracking-[0.5px]">Artist</th>
                <th className="px-4 py-[10px] text-left text-[11px] font-bold text-[#9CA3AF] bg-[#F9FAFB] uppercase tracking-[0.5px]">Influence</th>
                <th className="px-4 py-[10px] text-left text-[11px] font-bold text-[#9CA3AF] bg-[#F9FAFB] uppercase tracking-[0.5px]">Grade</th>
                <th className="px-4 py-[10px] text-left text-[11px] font-bold text-[#9CA3AF] bg-[#F9FAFB] uppercase tracking-[0.5px]">Breakdown</th>
                <th className="px-4 py-[10px] text-left text-[11px] font-bold text-[#9CA3AF] bg-[#F9FAFB] uppercase tracking-[0.5px]">Keywords</th>
                <th className="px-4 py-[10px] text-left text-[11px] font-bold text-[#9CA3AF] bg-[#F9FAFB] uppercase tracking-[0.5px]"></th>
              </tr>
            </thead>
            <tbody>
              {(gradeFilter === 'all'
                ? artistGrades
                : artistGrades.filter((a: any) => a.grade === gradeFilter)
              ).slice(0, 20).map((artist: any) => {
                const gc = GRADE_CONFIG[artist.grade] || GRADE_CONFIG.spark;
                return (
                  <tr
                    key={artist.id}
                    className="border-b border-[#F9FAFB] hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                    onClick={() => navigate(`/b2b/artist/${artist.star_id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-[10px]">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center text-[14px] font-bold text-white shrink-0">
                          {artist.star?.image_url ? (
                            <img src={artist.star.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            artist.star?.display_name?.[0] || '?'
                          )}
                        </div>
                        <div>
                          <div className="text-[13px] font-bold text-[#111827]">{artist.star?.display_name || 'Unknown'}</div>
                          <div className="text-[11px] text-[#9CA3AF]">{artist.star?.agency || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[18px] font-extrabold text-[#111827]">
                        {artist.influence_score > 0 ? artist.influence_score.toFixed(2) : artist.grade_score}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[10px] font-bold px-2 py-[2px] rounded-[10px]"
                        style={{ backgroundColor: `${gc.color}20`, color: gc.color }}
                      >
                        {gc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-[3px] items-end h-6">
                        {Object.entries(artist.grade_breakdown || {}).map(([g, count]) => {
                          const c = GRADE_CONFIG[g];
                          const h = Math.min(24, Math.max(6, (count as number) * 6));
                          return (
                            <div
                              key={g}
                              className="w-2 rounded-t"
                              style={{ height: `${h}px`, backgroundColor: c?.color || '#BFDBFE' }}
                              title={`${c?.label || g}: ${count}`}
                            />
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#374151]">{artist.keyword_count}</td>
                    <td className="px-4 py-3">
                      <button className="px-3 py-[5px] rounded-[6px] text-[11px] font-semibold bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] hover:bg-[#DBEAFE]">
                        상세 보기 →
                      </button>
                    </td>
                  </tr>
                );
              })}
              {artistGrades.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-[#9CA3AF] text-sm">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    아티스트 등급 데이터가 없습니다. 수집 후 자동 생성됩니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Trend Feed */}
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-[18px] py-[14px] border-b border-[#F3F4F6] flex items-center justify-between">
            <div className="text-[14px] font-bold text-[#111827] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#2563EB]" />
              실시간 트렌드 피드
            </div>
          </div>
          <div className="divide-y divide-[#F9FAFB]">
            {filteredTrends.slice(0, 10).map((trend: any) => {
              const gc = GRADE_CONFIG[(trend.trend_grade || 'spark').toLowerCase()] || GRADE_CONFIG.spark;
              return (
                <div key={trend.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[#F9FAFB] transition-colors cursor-pointer">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#F3F4F6] shrink-0">
                    {trend.source_image_url ? (
                      <img src={trend.source_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#D1D5DB]">
                        <gc.icon className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[#111827] font-medium truncate">{trend.keyword}</p>
                    <p className="text-[11px] text-[#9CA3AF]">
                      {trend.artist_name} · {trend.keyword_category}
                      {trend.purchase_stage && <span className="ml-1">· {trend.purchase_stage}</span>}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-[2px] rounded-[10px]"
                    style={{ backgroundColor: `${gc.color}20`, color: gc.color }}
                  >
                    {gc.label}
                  </span>
                  <div className="text-right w-16">
                    <p className="text-[14px] font-bold text-[#111827]">
                      {trend.trend_score != null ? (trend.trend_score * 100).toFixed(0) : (trend.influence_index ?? 0).toFixed(0)}
                    </p>
                    <p className="text-[10px] text-[#9CA3AF]">score</p>
                  </div>
                </div>
              );
            })}
            {filteredTrends.length === 0 && (
              <div className="px-5 py-12 text-center text-[#9CA3AF]">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">활성 트렌드가 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── AI ANALYST PANEL ── */}
      <div className="w-[320px] min-w-[320px] bg-white border-l border-[#E5E7EB] flex flex-col shrink-0 sticky top-[52px] h-[calc(100vh-52px)]">
        <div className="px-[18px] py-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse" />
            <span className="text-[14px] font-bold text-[#111827]">AI Analyst</span>
          </div>
          <span className="text-[11px] text-[#9CA3AF]">Pro · 무제한</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Keyword Probe */}
          <KeywordProbePanel />

          {/* AI Insights */}
          {activeTrends.length > 0 && (
            <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg p-[10px]">
              <div className="text-[10px] font-bold text-[#2563EB] mb-1 uppercase">Market Signal</div>
              <p className="text-[12px] text-[#1E40AF] leading-[1.4]">
                {activeTrends[0]?.keyword}이(가) {GRADE_CONFIG[(activeTrends[0]?.trend_grade || 'spark').toLowerCase()]?.label || 'Spark'} 단계로 트렌딩 중.
                {breakoutCount > 0 && ` ${breakoutCount}건의 Breakout 신호 감지.`}
              </p>
            </div>
          )}

          {/* Grade Distribution */}
          {Object.keys(gradeStats).length > 0 && (
            <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-3">
              <div className="text-[10px] font-bold text-[#9CA3AF] mb-2 uppercase tracking-[0.5px]">등급 분포</div>
              {Object.entries(gradeStats).sort(([,a],[,b]) => (b as number) - (a as number)).map(([grade, count]) => {
                const gc = GRADE_CONFIG[grade];
                const pct = (count as number / activeTrends.length) * 100;
                return (
                  <div key={grade} className="flex items-center gap-2 mb-2 last:mb-0">
                    <span className="text-[10px] font-semibold w-16" style={{ color: gc?.color }}>{gc?.label || grade}</span>
                    <div className="flex-1 h-[5px] bg-[#F3F4F6] rounded">
                      <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: gc?.color }} />
                    </div>
                    <span className="text-[10px] text-[#9CA3AF] w-6 text-right font-mono">{count as number}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Suggested Prompts */}
        <div className="px-4 pb-2">
          <div className="text-[10px] text-[#9CA3AF] font-semibold mb-[6px] uppercase">추천 질문</div>
          <div className="flex flex-wrap gap-1">
            {['이번 주 급상승 트렌드', 'Commerce 전환 키워드', '경쟁사 포트폴리오'].map(p => (
              <span key={p} className="inline-block px-[10px] py-[5px] rounded-full bg-[#F3F4F6] border border-[#E5E7EB] text-[11px] text-[#374151] cursor-pointer hover:bg-[#EFF6FF] hover:border-[#BFDBFE] hover:text-[#2563EB] transition-colors">
                {p}
              </span>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-[#E5E7EB] flex gap-2 items-end">
          <textarea
            rows={2}
            placeholder="스타, 트렌드, 시장에 대해 물어보세요..."
            className="flex-1 border border-[#E5E7EB] rounded-lg px-3 py-2 text-[12px] text-[#374151] resize-none outline-none focus:border-[#93C5FD] font-[inherit] leading-[1.4]"
          />
          <button className="w-8 h-8 rounded-lg bg-[#2563EB] text-white flex items-center justify-center shrink-0 hover:bg-[#1D4ED8]">
            ↑
          </button>
        </div>
      </div>
    </div>
  );
};

export default B2BDashboard;
