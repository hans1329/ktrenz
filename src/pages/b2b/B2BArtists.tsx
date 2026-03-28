import { useOutletContext, useNavigate } from 'react-router-dom';
import { Star, Search, TrendingUp, Flame, Share2, ShoppingCart, Zap } from 'lucide-react';
import { useState } from 'react';
import { MOCK_ARTIST_GRADES } from '@/data/b2b-mock-data';

const GRADE_CONFIG: Record<string, { label: string; color: string }> = {
  spark: { label: 'Spark', color: '#9CA3AF' },
  react: { label: 'React', color: '#3B82F6' },
  spread: { label: 'Spread', color: '#10B981' },
  intent: { label: 'Intent', color: '#F59E0B' },
  commerce: { label: 'Commerce', color: '#8B5CF6' },
  explosive: { label: 'Explosive', color: '#EF4444' },
};

const B2BArtists = () => {
  const { org } = useOutletContext<{ org: any }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filtered = MOCK_ARTIST_GRADES.filter(a =>
    !search || a.star.display_name.toLowerCase().includes(search.toLowerCase()) || a.star.name_ko?.includes(search)
  );

  return (
    <div className="p-6 max-w-[960px] space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-[#111827] flex items-center gap-2"><Star className="w-5 h-5 text-[#F59E0B]" /> Artists Portfolio</h1>
          <p className="text-[13px] text-[#6B7280] mt-1">모니터링 아티스트 · 등급 현황 · 상세 분석</p>
        </div>
      </div>

      <div className="relative max-w-[320px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="아티스트 검색..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#E5E7EB] bg-white text-[13px] outline-none focus:border-[#93C5FD]" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {filtered.map(artist => {
          const gc = GRADE_CONFIG[artist.grade] || GRADE_CONFIG.spark;
          return (
            <div
              key={artist.id}
              onClick={() => navigate(`/b2b/artist/${artist.star_id}`)}
              className="bg-white rounded-[10px] border border-[#E5E7EB] p-5 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center text-xl font-bold text-white shrink-0">
                  {artist.star.display_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-bold text-[#111827] group-hover:text-[#2563EB] transition-colors">{artist.star.display_name}</div>
                  <div className="text-[11px] text-[#9CA3AF]">{artist.star.name_ko} · {artist.star.agency}</div>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${gc.color}15`, color: gc.color }}>
                  {gc.label}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] text-[#9CA3AF] font-semibold uppercase">Influence</div>
                  <div className="text-[20px] font-extrabold text-[#111827]">{artist.influence_score.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9CA3AF] font-semibold uppercase">Keywords</div>
                  <div className="text-[20px] font-extrabold text-[#2563EB]">{artist.keyword_count}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9CA3AF] font-semibold uppercase">Score</div>
                  <div className="text-[20px] font-extrabold text-[#374151]">{artist.grade_score}</div>
                </div>
              </div>
              <div className="flex gap-1 mt-3">
                {Object.entries(artist.grade_breakdown).map(([g, count]) => {
                  const c = GRADE_CONFIG[g];
                  return (
                    <div key={g} className="flex-1 h-[4px] rounded-full" style={{ backgroundColor: `${c?.color || '#E5E7EB'}`, opacity: 0.6 + (count as number) * 0.1 }} title={`${c?.label}: ${count}`} />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default B2BArtists;
