import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import {
  TrendingUp, TrendingDown, Zap, Star, BarChart3, ArrowUpRight,
  Activity, ShoppingBag, Eye, Brain, Sparkles, ChevronRight
} from 'lucide-react';
import { useState } from 'react';

const B2BDashboard = () => {
  const { org } = useOutletContext<{ org: any }>();
  const isEntertainment = org?.org_type === 'entertainment';

  const { data: trackedStars = [] } = useQuery({
    queryKey: ['b2b-tracked-stars', org?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('ktrenz_b2b_tracked_stars')
        .select('*, star:ktrenz_stars(id, display_name, name_ko, image_url)')
        .eq('org_id', org.id);
      return data || [];
    },
    enabled: !!org?.id,
  });

  const { data: activeTrends = [] } = useQuery({
    queryKey: ['b2b-active-trends'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('ktrenz_trend_triggers')
        .select('id, keyword, keyword_category, artist_name, influence_index, trend_score, trend_grade, source_image_url, detected_at, star_id')
        .eq('status', 'active')
        .order('trend_score', { ascending: false, nullsFirst: false })
        .limit(20);
      return data || [];
    },
  });

  const ownedStars = trackedStars.filter((s: any) => s.relationship === 'owned');
  const competitorStars = trackedStars.filter((s: any) => s.relationship === 'competitor');

  const [aiQuery, setAiQuery] = useState('');

  return (
    <div className="flex min-h-full">
      {/* 중앙: 메인 콘텐츠 */}
      <div className="flex-1 p-6 space-y-6 max-w-[calc(100%-360px)]">
        {/* KPI */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: '활성 트렌드', value: activeTrends.length, icon: TrendingUp, color: 'hsl(270,80%,60%)' },
            { label: isEntertainment ? '소속 아티스트' : '추적 스타', value: ownedStars.length, icon: Star, color: 'hsl(45,90%,55%)' },
            { label: '경쟁사', value: competitorStars.length, icon: Eye, color: 'hsl(200,80%,55%)' },
            { label: '트렌드 알림', value: activeTrends.filter((t: any) => (t.trend_score ?? 0) > 70).length, icon: Zap, color: 'hsl(15,90%,55%)' },
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

        {/* 실시간 트렌드 피드 */}
        <div className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(220,15%,16%)]">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-[hsl(270,80%,60%)]" />
              실시간 트렌드 피드
            </h2>
            <button className="text-xs text-[hsl(270,80%,60%)] flex items-center gap-1 hover:underline">
              전체 보기 <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-[hsl(220,15%,16%)]">
            {activeTrends.slice(0, 8).map((trend: any) => (
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
                    {trend.artist_name} · {trend.keyword_category}
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
                <div className="flex items-center gap-1 text-[hsl(150,60%,50%)]">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">+{Math.floor(Math.random() * 200 + 20)}%</span>
                </div>
              </div>
            ))}
            {activeTrends.length === 0 && (
              <div className="px-5 py-12 text-center text-[hsl(220,10%,40%)]">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">활성 트렌드가 없습니다. 아티스트를 추가하여 추적을 시작하세요.</p>
              </div>
            )}
          </div>
        </div>

        {/* 스타 성과 카드 */}
        {ownedStars.length > 0 && (
          <div>
            <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-[hsl(45,90%,55%)]" />
              {isEntertainment ? '소속 아티스트 성과' : '추적 스타 성과'}
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {ownedStars.slice(0, 6).map((ts: any) => (
                <div key={ts.id} className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)] p-4 hover:border-[hsl(270,80%,55%,0.3)] transition-colors cursor-pointer">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-[hsl(220,15%,18%)]">
                      {ts.star?.image_url ? (
                        <img src={ts.star.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[hsl(220,10%,30%)] text-lg font-bold">
                          {ts.star?.display_name?.[0]}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-white font-semibold">{ts.star?.display_name}</p>
                      <p className="text-xs text-[hsl(220,10%,45%)]">
                        {ts.relationship === 'owned' ? '소속' : '경쟁사'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[hsl(220,10%,45%)]">활성 트렌드</span>
                    <span className="text-white font-bold">
                      {activeTrends.filter((t: any) => t.star?.name_en === ts.star?.name_en).length}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 우측: AI 의사결정 패널 */}
      <div className="w-[360px] border-l border-[hsl(220,15%,15%)] bg-[hsl(220,18%,9%)] flex flex-col shrink-0 sticky top-14 h-[calc(100vh-56px)]">
        <div className="px-4 py-3 border-b border-[hsl(220,15%,15%)]">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-[hsl(270,80%,60%)]" />
            <h3 className="text-sm font-bold text-white">AI 의사결정 엔진</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(270,80%,55%,0.2)] text-[hsl(270,80%,70%)] font-medium ml-auto">LIVE</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {[
            {
              type: 'opportunity',
              icon: <Sparkles className="w-3.5 h-3.5" />,
              color: 'hsl(45,90%,55%)',
              title: '시장 기회',
              body: activeTrends.length > 0
                ? `${activeTrends[0]?.keyword}이(가) ${activeTrends[0]?.trend_grade || 'Spark'} 수준의 에너지로 트렌딩 중입니다. 즉각적인 브랜드 협업을 검토하세요.`
                : '맞춤형 시장 기회를 받으려면 아티스트를 추가하세요.',
            },
            {
              type: 'alert',
              icon: <Zap className="w-3.5 h-3.5" />,
              color: 'hsl(15,90%,55%)',
              title: '트렌드 알림',
              body: activeTrends.length > 3
                ? `${activeTrends.filter((t: any) => t.trend_grade === 'Commerce' || t.trend_grade === 'Intent').length}개 트렌드가 강한 상업적 의도를 보이고 있습니다.`
                : '트렌드 알림을 생성하려면 더 많은 데이터가 필요합니다.',
            },
            {
              type: 'benchmark',
              icon: <BarChart3 className="w-3.5 h-3.5" />,
              color: 'hsl(200,80%,55%)',
              title: '경쟁 인사이트',
              body: competitorStars.length > 0
                ? `${competitorStars.length}개 경쟁사 아티스트를 모니터링 중입니다. Pre/Post 분석에서 성과를 비교하세요.`
                : '벤치마크 인사이트를 받으려면 경쟁사 아티스트를 추가하세요.',
            },
          ].map(insight => (
            <div key={insight.type} className="bg-[hsl(220,15%,12%)] rounded-xl border border-[hsl(220,15%,16%)] p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <div style={{ color: insight.color }}>{insight.icon}</div>
                <span className="text-xs font-semibold text-white">{insight.title}</span>
              </div>
              <p className="text-xs text-[hsl(220,10%,55%)] leading-relaxed">{insight.body}</p>
              <button className="mt-2 text-[10px] text-[hsl(270,80%,60%)] font-medium hover:underline flex items-center gap-1">
                자세히 보기 <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          ))}

          <div className="pt-2 space-y-2">
            <p className="text-[10px] text-[hsl(220,10%,35%)] font-medium uppercase tracking-wider">빠른 실행</p>
            {[
              { label: '트렌드 리포트 생성', icon: <BarChart3 className="w-3.5 h-3.5" /> },
              { label: '협업 매칭 찾기', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
              { label: '캠페인 임팩트 분석', icon: <Zap className="w-3.5 h-3.5" /> },
            ].map(action => (
              <button
                key={action.label}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[hsl(220,15%,18%)] bg-[hsl(220,15%,12%)] text-sm text-[hsl(220,10%,60%)] hover:border-[hsl(270,80%,55%,0.3)] hover:text-white transition-colors"
              >
                <span className="text-[hsl(270,80%,60%)]">{action.icon}</span>
                {action.label}
                <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
              </button>
            ))}
          </div>
        </div>

        {/* AI 채팅 입력 */}
        <div className="p-3 border-t border-[hsl(220,15%,15%)]">
          <div className="relative">
            <Input
              value={aiQuery}
              onChange={e => setAiQuery(e.target.value)}
              placeholder="트렌드, 스타, 캠페인에 대해 AI에게 질문하세요..."
              className="bg-[hsl(220,15%,12%)] border-[hsl(220,15%,18%)] text-white placeholder:text-[hsl(220,10%,30%)] h-9 text-sm pr-10"
            />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-[hsl(270,80%,60%)] hover:text-[hsl(270,80%,70%)]">
              <Brain className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default B2BDashboard;
