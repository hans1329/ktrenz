import { useOutletContext } from 'react-router-dom';
import { GitCompare, TrendingUp, ArrowUp, ArrowDown, Minus } from 'lucide-react';

const MOCK_BENCHMARK = [
  { artist: 'SEVENTEEN', influence: 8.72, keywords: 12, commerce: 4, grade: 'Explosive', vs: '+2.3' },
  { artist: 'BLACKPINK', influence: 8.15, keywords: 10, commerce: 3, grade: 'Explosive', vs: '+1.8' },
  { artist: 'aespa', influence: 7.45, keywords: 9, commerce: 3, grade: 'Commerce', vs: '+1.2' },
  { artist: 'IVE', influence: 6.31, keywords: 7, commerce: 2, grade: 'Intent', vs: '+0.4' },
  { artist: 'NewJeans', influence: 5.88, keywords: 8, commerce: 1, grade: 'Spread', vs: '-0.3' },
  { artist: 'BOYNEXTDOOR', influence: 4.23, keywords: 5, commerce: 0, grade: 'React', vs: '+0.8' },
  { artist: 'Byeon Wooseok', influence: 5.12, keywords: 6, commerce: 2, grade: 'Commerce', vs: '+1.5' },
];

const B2BBenchmark = () => {
  const max = Math.max(...MOCK_BENCHMARK.map(b => b.influence));

  return (
    <div className="p-6 max-w-[960px] space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-[#111827] flex items-center gap-2"><GitCompare className="w-5 h-5 text-[#2563EB]" /> Competitive Benchmark</h1>
        <p className="text-[13px] text-[#6B7280] mt-1">아티스트 간 영향력 비교 · 등급 분포 · 상업 전환율 비교</p>
      </div>

      <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-5">
        <div className="text-[12px] font-bold text-[#374151] mb-4">Influence Score 비교</div>
        <div className="space-y-3">
          {MOCK_BENCHMARK.map(b => (
            <div key={b.artist} className="flex items-center gap-3">
              <span className="text-[13px] font-bold text-[#111827] w-32 shrink-0">{b.artist}</span>
              <div className="flex-1 bg-[#F3F4F6] rounded-full h-6 relative overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED] flex items-center justify-end pr-2"
                  style={{ width: `${(b.influence / max) * 100}%` }}
                >
                  <span className="text-[10px] font-bold text-white">{b.influence.toFixed(2)}</span>
                </div>
              </div>
              <span className={`text-[11px] font-bold w-10 text-right ${parseFloat(b.vs) >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                {b.vs}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#F3F4F6]">
          <span className="text-[14px] font-bold text-[#111827]">상세 비교표</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB]">
              {['Artist', 'Influence', 'Keywords', 'Commerce', 'Grade', 'vs 지난주'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-[#9CA3AF] uppercase tracking-[0.5px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_BENCHMARK.map(b => (
              <tr key={b.artist} className="border-b border-[#F9FAFB] hover:bg-[#F9FAFB]">
                <td className="px-4 py-3 text-[13px] font-bold text-[#111827]">{b.artist}</td>
                <td className="px-4 py-3 text-[16px] font-extrabold text-[#111827]">{b.influence.toFixed(2)}</td>
                <td className="px-4 py-3 text-[13px] text-[#374151]">{b.keywords}</td>
                <td className="px-4 py-3 text-[13px] font-bold text-[#8B5CF6]">{b.commerce}</td>
                <td className="px-4 py-3 text-[11px] font-semibold text-[#374151]">{b.grade}</td>
                <td className="px-4 py-3">
                  <span className={`text-[12px] font-bold ${parseFloat(b.vs) >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                    {parseFloat(b.vs) >= 0 ? <ArrowUp className="w-3 h-3 inline" /> : <ArrowDown className="w-3 h-3 inline" />}
                    {b.vs}
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

export default B2BBenchmark;
