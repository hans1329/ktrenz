import { useOutletContext } from 'react-router-dom';
import { Rocket, FileText, BarChart3, Send, Clock, CheckCircle, Sparkles } from 'lucide-react';

const MOCK_ACTIVATIONS = [
  { id: 1, title: 'SEVENTEEN Dior 캠페인 리포트', type: 'report', status: 'completed', date: '2026-03-25', pages: 12, format: 'PDF' },
  { id: 2, title: 'aespa 뷰티 마켓 분석', type: 'analysis', status: 'completed', date: '2026-03-22', pages: 8, format: 'PDF' },
  { id: 3, title: 'IVE x Chanel 제안서 초안', type: 'proposal', status: 'in_progress', date: '2026-03-27', pages: 6, format: 'PPTX' },
  { id: 4, title: 'Q2 아티스트 포트폴리오 리밸런싱', type: 'strategy', status: 'in_progress', date: '2026-03-28', pages: null, format: 'Dashboard' },
];

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string; icon: any }> = {
  completed: { color: '#065F46', bg: '#D1FAE5', label: '완료', icon: CheckCircle },
  in_progress: { color: '#92400E', bg: '#FEF3C7', label: '진행 중', icon: Clock },
};

const TOOLS = [
  { name: '캠페인 리포트 생성', desc: '트렌드 데이터 기반 자동 리포트 생성', icon: FileText, color: '#2563EB' },
  { name: 'Pre/Post 분석', desc: '캠페인 전후 검색량·감성 비교 분석', icon: BarChart3, color: '#8B5CF6' },
  { name: '제안서 초안 작성', desc: 'AI 기반 브랜드 콜라보 제안서 생성', icon: Send, color: '#F59E0B' },
  { name: '시장 예측 보고서', desc: '다음 분기 트렌드 예측 리포트', icon: Sparkles, color: '#EF4444' },
];

const B2BActivation = () => {
  return (
    <div className="p-6 max-w-[960px] space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-[#111827] flex items-center gap-2"><Rocket className="w-5 h-5 text-[#EF4444]" /> Activation Studio</h1>
        <p className="text-[13px] text-[#6B7280] mt-1">AI 리포트 생성 · 제안서 작성 · 캠페인 시뮬레이션 · 자동화 도구</p>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-2 gap-3">
        {TOOLS.map(tool => (
          <div key={tool.name} className="bg-white rounded-[10px] border border-[#E5E7EB] p-5 hover:shadow-md transition-all cursor-pointer group">
            <tool.icon className="w-6 h-6 mb-3" style={{ color: tool.color }} />
            <div className="text-[14px] font-bold text-[#111827] group-hover:text-[#2563EB] transition-colors">{tool.name}</div>
            <p className="text-[12px] text-[#6B7280] mt-1">{tool.desc}</p>
          </div>
        ))}
      </div>

      {/* Recent Outputs */}
      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#F3F4F6]">
          <span className="text-[14px] font-bold text-[#111827]">최근 산출물</span>
        </div>
        <div className="divide-y divide-[#F9FAFB]">
          {MOCK_ACTIVATIONS.map(item => {
            const st = STATUS_STYLES[item.status];
            const StatusIcon = st.icon;
            return (
              <div key={item.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#F9FAFB] transition-colors cursor-pointer">
                <div className="w-10 h-10 rounded-lg bg-[#F3F4F6] flex items-center justify-center text-[#9CA3AF]">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-[#111827]">{item.title}</div>
                  <div className="text-[11px] text-[#9CA3AF]">{item.date} · {item.format}{item.pages ? ` · ${item.pages}p` : ''}</div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: st.bg, color: st.color }}>
                  <StatusIcon className="w-3 h-3" />
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default B2BActivation;
