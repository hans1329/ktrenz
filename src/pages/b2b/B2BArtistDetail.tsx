import { useParams, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  TrendingUp, Star, BarChart3, ArrowUpRight, ArrowDownRight,
  Activity, Zap, Brain, Sparkles, ChevronRight, Users,
  Eye, ShoppingBag, Globe, Calendar, ExternalLink
} from 'lucide-react';
import { Loader2 } from 'lucide-react';

const B2BArtistDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { org } = useOutletContext<{ org: any }>();

  // 스타 기본 정보
  const { data: star, isLoading } = useQuery({
    queryKey: ['b2b-star-detail', id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('ktrenz_stars')
        .select('*')
        .eq('id', id)
        .single();
      return data;
    },
    enabled: !!id,
  });

  // 관련 트렌드
  const { data: trends = [] } = useQuery({
    queryKey: ['b2b-star-trends', id],
    queryFn: async () => {
      if (!star?.display_name) return [];
      const { data } = await (supabase as any)
        .from('ktrenz_trend_triggers')
        .select('id, keyword, keyword_category, influence_index, trend_score, trend_grade, source_image_url, detected_at, status')
        .eq('artist_name', star.display_name)
        .order('detected_at', { ascending: false })
        .limit(30);
      return data || [];
    },
    enabled: !!star?.display_name,
  });

  // 에너지 스코어
  const { data: energyScores = [] } = useQuery({
    queryKey: ['b2b-star-energy', id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('ktrenz_star_energy_scores')
        .select('*')
        .eq('star_id', id)
        .order('calculated_at', { ascending: false })
        .limit(7);
      return data || [];
    },
    enabled: !!id,
  });

  // 스타 랭킹
  const { data: ranking } = useQuery({
    queryKey: ['b2b-star-ranking', id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('ktrenz_star_rankings')
        .select('*')
        .eq('star_id', id)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(220,10%,40%)]" />
      </div>
    );
  }

  if (!star) {
    return (
      <div className="flex items-center justify-center h-96 text-[hsl(220,10%,45%)]">
        아티스트를 찾을 수 없습니다.
      </div>
    );
  }

  const activeTrends = trends.filter((t: any) => t.status === 'active');
  const latestEnergy = energyScores[0];
  const avgTrendScore = activeTrends.length > 0
    ? activeTrends.reduce((s: number, t: any) => s + (t.trend_score ?? t.influence_index ?? 0), 0) / activeTrends.length
    : 0;

  return (
    <div className="flex min-h-full">
      {/* 중앙 메인 */}
      <div className="flex-1 p-6 space-y-6 max-w-[calc(100%-360px)]">
        {/* 프로필 헤더 */}
        <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)] p-6">
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-[hsl(220,15%,18%)] shrink-0">
              {star.image_url ? (
                <img src={star.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-[hsl(220,10%,30%)]">
                  {star.display_name?.[0]}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold text-white">{star.display_name}</h1>
                {star.name_ko && star.name_ko !== star.display_name && (
                  <span className="text-sm text-[hsl(220,10%,50%)]">{star.name_ko}</span>
                )}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(220,15%,18%)] text-[hsl(220,10%,55%)]">
                  {star.star_type === 'group' ? '그룹' : star.star_type === 'member' ? '멤버' : '솔로'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-[hsl(220,10%,45%)]">
                {star.agency && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{star.agency}</span>}
                {star.debut_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{star.debut_date}</span>}
                {star.nationality && <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{star.nationality}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* KPI 카드 */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: '활성 트렌드', value: activeTrends.length, icon: TrendingUp, color: 'hsl(270,80%,60%)' },
            { label: '평균 트렌드 스코어', value: avgTrendScore.toFixed(1), icon: BarChart3, color: 'hsl(45,90%,55%)' },
            { label: '에너지 스코어', value: latestEnergy?.energy_score?.toFixed(1) ?? '-', icon: Zap, color: 'hsl(15,90%,55%)' },
            { label: '현재 랭킹', value: ranking?.overall_rank ? `#${ranking.overall_rank}` : '-', icon: Star, color: 'hsl(200,80%,55%)' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-[hsl(220,15%,12%)] rounded-xl p-4 border border-[hsl(220,15%,16%)]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-[hsl(220,10%,45%)] font-medium">{kpi.label}</span>
                <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
              </div>
              <p className="text-2xl font-bold text-white">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* 트렌드 목록 */}
        <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(220,15%,16%)]">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-[hsl(270,80%,60%)]" />
              관련 트렌드 ({trends.length})
            </h2>
          </div>
          <div className="divide-y divide-[hsl(220,15%,16%)]">
            {trends.slice(0, 15).map((trend: any) => (
              <div key={trend.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[hsl(220,15%,14%)] transition-colors">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-[hsl(220,15%,18%)] shrink-0">
                  {trend.source_image_url ? (
                    <img src={trend.source_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[hsl(220,10%,30%)]">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{trend.keyword}</p>
                  <p className="text-xs text-[hsl(220,10%,45%)]">
                    {trend.keyword_category} · {new Date(trend.detected_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  trend.trend_grade === 'Explosive' ? 'bg-[hsl(0,80%,50%,0.2)] text-[hsl(0,80%,65%)]' :
                  trend.trend_grade === 'Commerce' ? 'bg-[hsl(270,80%,50%,0.2)] text-[hsl(270,80%,70%)]' :
                  trend.trend_grade === 'Intent' ? 'bg-[hsl(45,80%,50%,0.2)] text-[hsl(45,80%,65%)]' :
                  'bg-[hsl(220,15%,20%)] text-[hsl(220,10%,55%)]'
                }`}>
                  {trend.trend_grade || 'Spark'}
                </span>
                <div className="text-right w-16">
                  <p className="text-sm font-bold text-white">{(trend.trend_score ?? trend.influence_index ?? 0).toFixed(0)}</p>
                  <p className="text-[10px] text-[hsl(220,10%,40%)]">스코어</p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  trend.status === 'active'
                    ? 'bg-[hsl(150,60%,40%,0.2)] text-[hsl(150,60%,55%)]'
                    : 'bg-[hsl(220,15%,18%)] text-[hsl(220,10%,40%)]'
                }`}>
                  {trend.status === 'active' ? '활성' : '종료'}
                </span>
              </div>
            ))}
            {trends.length === 0 && (
              <div className="px-5 py-12 text-center text-[hsl(220,10%,40%)]">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">이 아티스트와 관련된 트렌드가 아직 없습니다.</p>
              </div>
            )}
          </div>
        </div>

        {/* 에너지 스코어 히스토리 */}
        {energyScores.length > 0 && (
          <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)] p-5">
            <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-[hsl(15,90%,55%)]" />
              에너지 스코어 추이
            </h2>
            <div className="flex gap-3 overflow-x-auto">
              {energyScores.map((es: any, i: number) => {
                const prev = energyScores[i + 1];
                const diff = prev ? es.energy_score - prev.energy_score : 0;
                return (
                  <div key={es.id} className="bg-[hsl(220,15%,15%)] rounded-lg p-3 min-w-[120px] text-center">
                    <p className="text-[10px] text-[hsl(220,10%,40%)] mb-1">
                      {new Date(es.calculated_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-lg font-bold text-white">{es.energy_score?.toFixed(1)}</p>
                    {diff !== 0 && (
                      <div className={`flex items-center justify-center gap-0.5 text-[10px] mt-1 ${diff > 0 ? 'text-[hsl(150,60%,55%)]' : 'text-[hsl(0,60%,55%)]'}`}>
                        {diff > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(diff).toFixed(1)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 우측 AI 패널 */}
      <div className="w-[360px] border-l border-[hsl(220,15%,15%)] bg-[hsl(220,18%,9%)] flex flex-col shrink-0 sticky top-14 h-[calc(100vh-56px)]">
        <div className="px-4 py-3 border-b border-[hsl(220,15%,15%)]">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-[hsl(270,80%,60%)]" />
            <h3 className="text-sm font-bold text-white">AI 아티스트 분석</h3>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {/* 종합 평가 */}
          <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)] p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-[hsl(45,90%,55%)]" />
              <span className="text-xs font-semibold text-white">종합 평가</span>
            </div>
            <p className="text-xs text-[hsl(220,10%,55%)] leading-relaxed">
              {activeTrends.length > 0
                ? `${star.display_name}은(는) 현재 ${activeTrends.length}개의 활성 트렌드에 연결되어 있습니다. 평균 트렌드 스코어 ${avgTrendScore.toFixed(1)}로 ${avgTrendScore > 60 ? '높은 시장 관심도' : '보통 수준의 노출도'}를 보이고 있습니다.`
                : `${star.display_name}에 대한 활성 트렌드가 없어 현재 시장 노출도가 낮은 상태입니다.`}
            </p>
          </div>

          {/* 트렌드 분포 */}
          <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)] p-3.5">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-3.5 h-3.5 text-[hsl(200,80%,55%)]" />
              <span className="text-xs font-semibold text-white">트렌드 등급 분포</span>
            </div>
            {['Explosive', 'Commerce', 'Intent', 'Spark'].map(grade => {
              const count = trends.filter((t: any) => (t.trend_grade || 'Spark') === grade).length;
              const pct = trends.length > 0 ? (count / trends.length) * 100 : 0;
              return (
                <div key={grade} className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] text-[hsl(220,10%,50%)] w-16">{grade}</span>
                  <div className="flex-1 h-1.5 bg-[hsl(220,15%,18%)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          grade === 'Explosive' ? 'hsl(0,80%,55%)' :
                          grade === 'Commerce' ? 'hsl(270,80%,60%)' :
                          grade === 'Intent' ? 'hsl(45,80%,55%)' :
                          'hsl(220,10%,40%)',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-[hsl(220,10%,45%)] w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>

          {/* 추천 액션 */}
          <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)] p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-[hsl(15,90%,55%)]" />
              <span className="text-xs font-semibold text-white">추천 액션</span>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Pre/Post 분석 실행', desc: '관여 전후 검색량 변화 비교' },
                { label: '경쟁사 대비 벤치마크', desc: '동종 아티스트 성과 비교' },
                { label: '캠페인 시뮬레이션', desc: '트렌드 기반 예상 성과 추정' },
              ].map(action => (
                <button
                  key={action.label}
                  className="w-full text-left px-3 py-2 rounded-lg border border-[hsl(220,15%,18%)] hover:border-[hsl(270,80%,55%,0.3)] transition-colors"
                >
                  <p className="text-xs text-white font-medium">{action.label}</p>
                  <p className="text-[10px] text-[hsl(220,10%,40%)]">{action.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 소셜 / 외부 링크 */}
          {(star.youtube_channel_id || star.spotify_id) && (
            <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)] p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <ExternalLink className="w-3.5 h-3.5 text-[hsl(220,10%,50%)]" />
                <span className="text-xs font-semibold text-white">외부 채널</span>
              </div>
              <div className="space-y-1.5">
                {star.youtube_channel_id && (
                  <a
                    href={`https://youtube.com/channel/${star.youtube_channel_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-[hsl(220,10%,55%)] hover:text-white transition-colors"
                  >
                    <span className="text-red-500">▶</span> YouTube 채널
                  </a>
                )}
                {star.spotify_id && (
                  <a
                    href={`https://open.spotify.com/artist/${star.spotify_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-[hsl(220,10%,55%)] hover:text-white transition-colors"
                  >
                    <span className="text-green-500">●</span> Spotify
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default B2BArtistDetail;
