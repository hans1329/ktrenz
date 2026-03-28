import { useOutletContext } from 'react-router-dom';
import { Globe, TrendingUp, MapPin, BarChart3 } from 'lucide-react';

const MOCK_MARKETS = [
  { region: '한국', flag: '🇰🇷', trends: 42, topArtist: 'SEVENTEEN', topBrand: 'Dior', growth: '+18%', score: 94 },
  { region: '일본', flag: '🇯🇵', trends: 28, topArtist: 'BLACKPINK', topBrand: 'Bulgari', growth: '+12%', score: 87 },
  { region: '미국', flag: '🇺🇸', trends: 19, topArtist: 'NewJeans', topBrand: 'Calvin Klein', growth: '+25%', score: 82 },
  { region: '동남아시아', flag: '🌏', trends: 23, topArtist: 'BLACKPINK', topBrand: 'Shopee', growth: '+31%', score: 79 },
  { region: '유럽', flag: '🇪🇺', trends: 15, topArtist: 'aespa', topBrand: 'Prada', growth: '+8%', score: 74 },
  { region: '중국', flag: '🇨🇳', trends: 35, topArtist: 'IVE', topBrand: 'Chanel', growth: '+15%', score: 88 },
];

const MOCK_CATEGORIES = [
  { name: 'Fashion & Luxury', share: 34, count: 56, color: '#8B5CF6' },
  { name: 'Beauty & Cosmetics', share: 22, count: 36, color: '#EC4899' },
  { name: 'Food & Restaurant', share: 15, count: 25, color: '#F59E0B' },
  { name: 'Entertainment', share: 12, count: 20, color: '#3B82F6' },
  { name: 'Lifestyle', share: 10, count: 16, color: '#10B981' },
  { name: 'Tech & Digital', share: 7, count: 11, color: '#6366F1' },
];

const B2BMarkets = () => {
  return (
    <div className="p-6 max-w-[960px] space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-[#111827] flex items-center gap-2"><Globe className="w-5 h-5 text-[#10B981]" /> Market Intelligence</h1>
        <p className="text-[13px] text-[#6B7280] mt-1">글로벌 시장 트렌드 · 지역별 인기 아티스트 · 카테고리 분포</p>
      </div>

      {/* Region Cards */}
      <div className="grid grid-cols-3 gap-3">
        {MOCK_MARKETS.map(m => (
          <div key={m.region} className="bg-white rounded-[10px] border border-[#E5E7EB] p-4 hover:shadow-md transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <span className="text-lg">{m.flag}</span>
              <span className="text-[10px] font-bold text-[#10B981]">{m.growth}</span>
            </div>
            <div className="text-[14px] font-bold text-[#111827]">{m.region}</div>
            <div className="text-[11px] text-[#9CA3AF] mt-0.5">{m.trends} active trends</div>
            <div className="mt-3 pt-3 border-t border-[#F3F4F6] grid grid-cols-2 gap-2">
              <div><div className="text-[9px] text-[#9CA3AF] uppercase">Top Artist</div><div className="text-[11px] font-semibold text-[#111827] truncate">{m.topArtist}</div></div>
              <div><div className="text-[9px] text-[#9CA3AF] uppercase">Top Brand</div><div className="text-[11px] font-semibold text-[#111827] truncate">{m.topBrand}</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* Category Distribution */}
      <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-5">
        <div className="text-[14px] font-bold text-[#111827] mb-4">카테고리별 트렌드 분포</div>
        <div className="space-y-3">
          {MOCK_CATEGORIES.map(cat => (
            <div key={cat.name}>
              <div className="flex justify-between text-[12px] mb-1">
                <span className="font-semibold text-[#374151]">{cat.name}</span>
                <span className="text-[#9CA3AF]">{cat.count}건 ({cat.share}%)</span>
              </div>
              <div className="bg-[#F3F4F6] rounded-full h-[6px]">
                <div className="rounded-full h-[6px]" style={{ width: `${cat.share}%`, backgroundColor: cat.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default B2BMarkets;
