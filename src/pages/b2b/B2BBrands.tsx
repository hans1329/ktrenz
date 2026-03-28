import { useOutletContext } from 'react-router-dom';
import { BarChart3, TrendingUp, ArrowUpRight, ExternalLink } from 'lucide-react';

const MOCK_BRANDS = [
  { name: 'Dior', category: 'Luxury', artists: ['SEVENTEEN', 'BLACKPINK'], keywords: 8, score: 94, delta: '+22%', stage: 'Commerce' },
  { name: 'Chanel', category: 'Luxury', artists: ['IVE', 'BLACKPINK'], keywords: 6, score: 88, delta: '+15%', stage: 'Intent' },
  { name: 'Prada', category: 'Luxury', artists: ['aespa'], keywords: 4, score: 84, delta: '+18%', stage: 'Commerce' },
  { name: 'Bulgari', category: 'Luxury', artists: ['BLACKPINK'], keywords: 5, score: 82, delta: '+12%', stage: 'Spread' },
  { name: 'Burberry', category: 'Luxury', artists: ['NewJeans'], keywords: 3, score: 76, delta: '+8%', stage: 'Intent' },
  { name: 'Cartier', category: 'Luxury', artists: ['Byeon Wooseok'], keywords: 3, score: 77, delta: '+20%', stage: 'Commerce' },
  { name: 'Saint Laurent', category: 'Luxury', artists: ['BLACKPINK'], keywords: 4, score: 85, delta: '+14%', stage: 'Spread' },
];

const STAGE_COLORS: Record<string, string> = {
  Commerce: '#8B5CF6', Intent: '#F59E0B', Spread: '#10B981', React: '#3B82F6',
};

const B2BBrands = () => {
  return (
    <div className="p-6 max-w-[960px] space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-[#111827] flex items-center gap-2"><BarChart3 className="w-5 h-5 text-[#8B5CF6]" /> Brand Intelligence</h1>
        <p className="text-[13px] text-[#6B7280] mt-1">브랜드-아티스트 연관 분석 · 상업적 전환 추적 · 경쟁 브랜드 비교</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '모니터링 브랜드', value: MOCK_BRANDS.length, color: '#8B5CF6' },
          { label: 'Commerce 도달', value: 3, color: '#EF4444' },
          { label: '평균 Trend Score', value: '83.7', color: '#2563EB' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[10px] p-4 border border-[#E5E7EB]">
            <div className="text-[11px] text-[#9CA3AF] font-semibold uppercase tracking-[0.5px] mb-1">{s.label}</div>
            <div className="text-[26px] font-extrabold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#F3F4F6]">
          <span className="text-[14px] font-bold text-[#111827]">브랜드 트렌드 현황</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB]">
              {['Brand', 'Category', 'Artists', 'Keywords', 'Score', 'Δ', 'Stage'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-[#9CA3AF] uppercase tracking-[0.5px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_BRANDS.map(brand => (
              <tr key={brand.name} className="border-b border-[#F9FAFB] hover:bg-[#F9FAFB] cursor-pointer transition-colors">
                <td className="px-4 py-3 text-[13px] font-bold text-[#111827]">{brand.name}</td>
                <td className="px-4 py-3 text-[12px] text-[#6B7280]">{brand.category}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {brand.artists.map(a => (
                      <span key={a} className="text-[10px] px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] font-medium">{a}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-[13px] font-bold text-[#374151]">{brand.keywords}</td>
                <td className="px-4 py-3 text-[16px] font-extrabold text-[#111827]">{brand.score}</td>
                <td className="px-4 py-3 text-[12px] font-bold text-[#10B981]">{brand.delta}</td>
                <td className="px-4 py-3">
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: `${STAGE_COLORS[brand.stage] || '#9CA3AF'}15`, color: STAGE_COLORS[brand.stage] || '#9CA3AF' }}>
                    {brand.stage}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default B2BBrands;
