import { useOutletContext } from 'react-router-dom';
import { Target, AlertTriangle, TrendingUp, Clock, Zap, ArrowUpRight, Bell } from 'lucide-react';

const MOCK_ALERTS = [
  { id: 1, type: 'breakout', artist: 'SEVENTEEN', keyword: '세븐틴 x 디올', score: 94, delta: '+32%', time: '12분 전', message: 'Explosive 등급 진입 — 구매 의도 급상승' },
  { id: 2, type: 'commerce', artist: 'aespa', keyword: '윈터 코스메틱 앰배서더', score: 90, delta: '+18%', time: '28분 전', message: 'Commerce 전환 감지 — 브랜드 콜라보 확인' },
  { id: 3, type: 'rising', artist: 'BLACKPINK', keyword: '지수 x 디올 컬렉션', score: 97, delta: '+45%', time: '1시간 전', message: '검색량 폭증 — 실시간 트렌딩 1위' },
  { id: 4, type: 'intent', artist: 'IVE', keyword: '장원영 공항패션', score: 82, delta: '+15%', time: '2시간 전', message: 'Intent 단계 진입 — 패션 카테고리 상승' },
  { id: 5, type: 'new', artist: 'NewJeans', keyword: '하니 빈티지 카페', score: 74, delta: 'NEW', time: '3시간 전', message: '신규 트렌드 감지 — Restaurant 카테고리' },
];

const ALERT_STYLES: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  breakout: { bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444', label: 'Breakout' },
  commerce: { bg: '#F5F3FF', border: '#DDD6FE', dot: '#8B5CF6', label: 'Commerce' },
  rising: { bg: '#FFF7ED', border: '#FED7AA', dot: '#F97316', label: 'Rising' },
  intent: { bg: '#FFFBEB', border: '#FDE68A', dot: '#F59E0B', label: 'Intent' },
  new: { bg: '#F0FDF4', border: '#BBF7D0', dot: '#22C55E', label: 'New Signal' },
};

const B2BRadar = () => {
  const { org } = useOutletContext<{ org: any }>();

  return (
    <div className="p-6 max-w-[960px] space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-[#111827] flex items-center gap-2">
          <Target className="w-5 h-5 text-[#EF4444]" /> Signal Radar
        </h1>
        <p className="text-[13px] text-[#6B7280] mt-1">실시간 트렌드 이상 신호 · 등급 변동 · 상업 전환 알림</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '활성 알림', value: 5, icon: Bell, color: '#EF4444' },
          { label: 'Breakout 신호', value: 2, icon: Zap, color: '#F97316' },
          { label: '상업 전환', value: 1, icon: TrendingUp, color: '#8B5CF6' },
          { label: '평균 반응시간', value: '1.2h', icon: Clock, color: '#2563EB' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[10px] p-4 border border-[#E5E7EB]">
            <s.icon className="w-4 h-4 mb-2" style={{ color: s.color }} />
            <div className="text-[11px] text-[#9CA3AF] font-semibold uppercase tracking-[0.5px]">{s.label}</div>
            <div className="text-[22px] font-extrabold mt-1" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Alert Feed */}
      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#F3F4F6] flex items-center justify-between">
          <span className="text-[14px] font-bold text-[#111827]">실시간 알림 피드</span>
          <span className="text-[11px] text-[#9CA3AF]">{MOCK_ALERTS.length}건</span>
        </div>
        <div className="divide-y divide-[#F9FAFB]">
          {MOCK_ALERTS.map(alert => {
            const style = ALERT_STYLES[alert.type];
            return (
              <div key={alert.id} className="px-5 py-4 hover:bg-[#F9FAFB] transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: style.dot }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-bold text-[#111827]">{alert.artist}</span>
                      <span className="text-[10px] font-bold px-2 py-[1px] rounded-full" style={{ backgroundColor: style.bg, color: style.dot, border: `1px solid ${style.border}` }}>
                        {style.label}
                      </span>
                      <span className="text-[11px] text-[#9CA3AF] ml-auto shrink-0">{alert.time}</span>
                    </div>
                    <p className="text-[12px] text-[#374151] font-medium">{alert.keyword}</p>
                    <p className="text-[11px] text-[#6B7280] mt-0.5">{alert.message}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[16px] font-extrabold text-[#111827]">{alert.score}</div>
                    <div className="text-[10px] font-bold text-[#10B981]">{alert.delta}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default B2BRadar;
