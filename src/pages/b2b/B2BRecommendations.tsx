import { useOutletContext } from 'react-router-dom';
import { Lightbulb, Star, TrendingUp, Zap, Target, ArrowRight } from 'lucide-react';

const MOCK_RECS = [
  { id: 1, type: 'opportunity', title: 'SEVENTEEN x Luxury Watch 콜라보 기회', desc: 'Dior 캠페인 성공 이후 럭셔리 시계 카테고리에서 SEVENTEEN 관련 검색량이 42% 증가. 현재 경쟁 브랜드 없는 빈 포지션.', confidence: 92, artist: 'SEVENTEEN', category: 'Luxury Accessories' },
  { id: 2, type: 'timing', title: 'aespa 뷰티 캠페인 최적 타이밍', desc: '4월 컴백 예정. 컴백 2주 전 론칭 시 검색량 시너지 극대화 가능. 과거 3회 캠페인 평균 ROI 3.8x.', confidence: 88, artist: 'aespa', category: 'Beauty' },
  { id: 3, type: 'risk', title: 'NewJeans 패션 포지션 경쟁 심화', desc: '최근 3개 럭셔리 브랜드가 NewJeans 멤버와 계약. 신규 진입 시 차별화 전략 필요. 스트리트 패션 카테고리 권장.', confidence: 85, artist: 'NewJeans', category: 'Fashion' },
  { id: 4, type: 'opportunity', title: 'Byeon Wooseok F&B 브랜드 앰배서더', desc: '최근 레스토랑 방문 키워드 3건 연속 감지. 외식/카페 브랜드 콜라보 시 높은 전환율 예상. 타겟: MZ세대 여성.', confidence: 79, artist: 'Byeon Wooseok', category: 'F&B' },
  { id: 5, type: 'timing', title: 'IVE 여름 시즌 활용 제안', desc: 'IVE의 여름 앨범 발매와 연계한 음료/아이스크림 브랜드 캠페인 추천. 지난해 여름 캠페인 engagement rate 11.2%.', confidence: 83, artist: 'IVE', category: 'F&B' },
];

const TYPE_STYLES: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  opportunity: { icon: Star, color: '#F59E0B', bg: '#FFFBEB', label: '기회 포착' },
  timing: { icon: Zap, color: '#2563EB', bg: '#EFF6FF', label: '타이밍 추천' },
  risk: { icon: Target, color: '#EF4444', bg: '#FEF2F2', label: '리스크 알림' },
};

const B2BRecommendations = () => {
  return (
    <div className="p-6 max-w-[960px] space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-[#111827] flex items-center gap-2"><Lightbulb className="w-5 h-5 text-[#F59E0B]" /> AI Recommendations</h1>
        <p className="text-[13px] text-[#6B7280] mt-1">AI 기반 기회 탐색 · 타이밍 추천 · 리스크 감지</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '기회 포착', value: 2, color: '#F59E0B' },
          { label: '타이밍 추천', value: 2, color: '#2563EB' },
          { label: '리스크 알림', value: 1, color: '#EF4444' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[10px] p-4 border border-[#E5E7EB]">
            <div className="text-[11px] text-[#9CA3AF] font-semibold uppercase tracking-[0.5px] mb-1">{s.label}</div>
            <div className="text-[26px] font-extrabold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {MOCK_RECS.map(rec => {
          const st = TYPE_STYLES[rec.type];
          const Icon = st.icon;
          return (
            <div key={rec.id} className="bg-white rounded-[10px] border border-[#E5E7EB] p-5 hover:shadow-md transition-all cursor-pointer group">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: st.bg }}>
                  <Icon className="w-5 h-5" style={{ color: st.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                    <span className="text-[10px] text-[#9CA3AF]">{rec.artist} · {rec.category}</span>
                  </div>
                  <h3 className="text-[14px] font-bold text-[#111827] group-hover:text-[#2563EB] transition-colors">{rec.title}</h3>
                  <p className="text-[12px] text-[#6B7280] mt-1 leading-[1.5]">{rec.desc}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[18px] font-extrabold text-[#111827]">{rec.confidence}%</div>
                  <div className="text-[10px] text-[#9CA3AF]">신뢰도</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default B2BRecommendations;
