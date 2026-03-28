import { useOutletContext } from 'react-router-dom';
import { Zap, Calendar, TrendingUp, DollarSign, Eye, Target } from 'lucide-react';

const MOCK_CAMPAIGNS = [
  { id: 1, name: 'SEVENTEEN x Dior SS26', brand: 'Dior', artist: 'SEVENTEEN', status: 'active', startDate: '2026-03-01', endDate: '2026-04-15', kpiReach: '2.4M', kpiEngagement: '8.7%', kpiConversion: '3.2%', score: 94, trend: '+32%' },
  { id: 2, name: 'aespa Beauty Campaign', brand: 'MAC', artist: 'aespa', status: 'active', startDate: '2026-03-10', endDate: '2026-04-30', kpiReach: '1.8M', kpiEngagement: '6.5%', kpiConversion: '2.8%', score: 87, trend: '+18%' },
  { id: 3, name: 'IVE x Chanel', brand: 'Chanel', artist: 'IVE', status: 'planned', startDate: '2026-04-01', endDate: '2026-05-15', kpiReach: '-', kpiEngagement: '-', kpiConversion: '-', score: 0, trend: '-' },
  { id: 4, name: 'BLACKPINK Bulgari FW26', brand: 'Bulgari', artist: 'BLACKPINK', status: 'completed', startDate: '2026-01-15', endDate: '2026-03-01', kpiReach: '5.1M', kpiEngagement: '12.3%', kpiConversion: '4.7%', score: 97, trend: '+45%' },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: '#D1FAE5', text: '#065F46', label: '진행 중' },
  planned: { bg: '#DBEAFE', text: '#1E40AF', label: '예정' },
  completed: { bg: '#F3F4F6', text: '#6B7280', label: '완료' },
};

const B2BCampaigns = () => {
  return (
    <div className="p-6 max-w-[960px] space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-[#111827] flex items-center gap-2"><Zap className="w-5 h-5 text-[#F59E0B]" /> Campaign Manager</h1>
          <p className="text-[13px] text-[#6B7280] mt-1">캠페인 트래킹 · KPI 모니터링 · Pre/Post 성과 비교</p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-[12px] font-semibold hover:bg-[#1D4ED8]">+ 캠페인 등록</button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '진행 중', value: 2, icon: Target, color: '#10B981' },
          { label: '예정', value: 1, icon: Calendar, color: '#2563EB' },
          { label: '완료', value: 1, icon: Eye, color: '#6B7280' },
          { label: '평균 ROI', value: '3.2x', icon: DollarSign, color: '#F59E0B' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[10px] p-4 border border-[#E5E7EB]">
            <s.icon className="w-4 h-4 mb-2" style={{ color: s.color }} />
            <div className="text-[11px] text-[#9CA3AF] font-semibold uppercase tracking-[0.5px]">{s.label}</div>
            <div className="text-[22px] font-extrabold mt-1" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {MOCK_CAMPAIGNS.map(c => {
          const st = STATUS_STYLES[c.status];
          return (
            <div key={c.id} className="bg-white rounded-[10px] border border-[#E5E7EB] p-5 hover:shadow-md transition-all cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-[#111827]">{c.name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: st.bg, color: st.text }}>{st.label}</span>
                  </div>
                  <div className="text-[11px] text-[#9CA3AF] mt-0.5">{c.brand} · {c.artist} · {c.startDate} ~ {c.endDate}</div>
                </div>
                {c.score > 0 && (
                  <div className="text-right">
                    <div className="text-[22px] font-extrabold text-[#111827]">{c.score}</div>
                    <div className="text-[11px] font-bold text-[#10B981]">{c.trend}</div>
                  </div>
                )}
              </div>
              {c.status !== 'planned' && (
                <div className="grid grid-cols-3 gap-4 pt-3 border-t border-[#F3F4F6]">
                  <div><div className="text-[10px] text-[#9CA3AF] uppercase font-semibold">Reach</div><div className="text-[16px] font-bold text-[#111827]">{c.kpiReach}</div></div>
                  <div><div className="text-[10px] text-[#9CA3AF] uppercase font-semibold">Engagement</div><div className="text-[16px] font-bold text-[#2563EB]">{c.kpiEngagement}</div></div>
                  <div><div className="text-[10px] text-[#9CA3AF] uppercase font-semibold">Conversion</div><div className="text-[16px] font-bold text-[#8B5CF6]">{c.kpiConversion}</div></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default B2BCampaigns;
