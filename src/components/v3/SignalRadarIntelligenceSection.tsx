import { TrendingUp, DollarSign, ArrowRight, BarChart3 } from "lucide-react";

const SignalRadarIntelligenceSection = () => {
  return (
    <>
      {/* FES Intelligence Framework */}
      <section className="space-y-4">
        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          FES Intelligence Framework
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          모든 데이터를 <strong>Buzz(관심)</strong>와 <strong>Performance(매출)</strong>로 분리하고,
          시간 축으로 <strong>A Data(현재)</strong>와 <strong>B Data(예측)</strong>를 구분하여
          "관심이 돈으로 전환되는 구조"를 정량화합니다.
        </p>

        {/* 2x2 Matrix */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
            <div className="text-xs font-medium text-primary">A Data × Buzz</div>
            <div className="text-sm font-semibold text-foreground">현재 관심도</div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• YouTube 조회수/구독자</li>
              <li>• X(Twitter) Mentions</li>
              <li>• Naver News 노출</li>
              <li>• SNS 팔로워 변동</li>
            </ul>
            <div className="text-[10px] text-muted-foreground/60 mt-1">
              → Signal-B, Signal-C 매핑
            </div>
          </div>

          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-2">
            <div className="text-xs font-medium text-accent-foreground">A Data × Performance</div>
            <div className="text-sm font-semibold text-foreground">현재 매출 성과</div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Hanteo 판매량</li>
              <li>• Apple Music Charts</li>
              <li>• Billboard Charts</li>
              <li>• Deezer / Last.fm</li>
            </ul>
            <div className="text-[10px] text-muted-foreground/60 mt-1">
              → Signal-D 매핑 (신규)
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">B Data × Buzz</div>
            <div className="text-sm font-semibold text-foreground">관심 예측</div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• FES Predictor: YouTube/Buzz 예측</li>
              <li>• 이벤트 기반 관심 변동 예상</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">B Data × Performance</div>
            <div className="text-sm font-semibold text-foreground">매출 예측</div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• FES Predictor: Music/Sales 예측</li>
              <li>• 컴백 시 초동 판매 추정</li>
            </ul>
          </div>
        </div>

        {/* Conversion Flow */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">Buzz → Performance Conversion</h4>
          <div className="flex items-center justify-center gap-2 text-xs">
            <div className="px-3 py-2 rounded-lg bg-primary/10 text-primary font-medium">
              Buzz ↑
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <div className="px-3 py-2 rounded-lg bg-muted text-muted-foreground font-medium">
              팬덤 활성화
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <div className="px-3 py-2 rounded-lg bg-accent/10 text-accent-foreground font-medium">
              Performance ↑
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            이 전환율이 높으면 "효율적 팬덤", 낮으면 "미전환 잠재력" → 기획사 전략 근거
          </p>
        </div>
      </section>

      {/* Signal-D: Revenue Pulse */}
      <section className="space-y-4">
        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          Signal-D: Revenue Pulse
        </h3>
        <p className="text-sm text-muted-foreground">
          매출 연동 데이터(Hanteo, Apple Music Charts, Billboard)를 일별 집계하여
          <strong> Buzz 대비 실제 수익 전환율</strong>을 정량화합니다.
          관심(Buzz)과 성과(Performance)의 괴리를 발견하는 핵심 시그널입니다.
        </p>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Field</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground">
              <tr><td className="px-3 py-1.5 font-mono">wiki_entry_id</td><td className="px-3 py-1.5">uuid FK</td><td className="px-3 py-1.5 text-muted-foreground">아티스트</td></tr>
              <tr><td className="px-3 py-1.5 font-mono">snapshot_date</td><td className="px-3 py-1.5">date</td><td className="px-3 py-1.5 text-muted-foreground">집계 날짜</td></tr>
              <tr><td className="px-3 py-1.5 font-mono">hanteo_daily_sales</td><td className="px-3 py-1.5">int</td><td className="px-3 py-1.5 text-muted-foreground">한터 일별 판매량</td></tr>
              <tr><td className="px-3 py-1.5 font-mono">apple_chart_position</td><td className="px-3 py-1.5">int</td><td className="px-3 py-1.5 text-muted-foreground">Apple Music 차트 순위 (null = 미진입)</td></tr>
              <tr><td className="px-3 py-1.5 font-mono">billboard_position</td><td className="px-3 py-1.5">int</td><td className="px-3 py-1.5 text-muted-foreground">Billboard 차트 순위</td></tr>
              <tr><td className="px-3 py-1.5 font-mono">music_score</td><td className="px-3 py-1.5">numeric</td><td className="px-3 py-1.5 text-muted-foreground">FES Music Score (종합)</td></tr>
              <tr><td className="px-3 py-1.5 font-mono">buzz_to_perf_ratio</td><td className="px-3 py-1.5">numeric</td><td className="px-3 py-1.5 text-muted-foreground">Buzz Score ÷ Performance Score (전환율)</td></tr>
              <tr><td className="px-3 py-1.5 font-mono">conversion_tier</td><td className="px-3 py-1.5">text</td><td className="px-3 py-1.5 text-muted-foreground">high / medium / low / dormant</td></tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Use Cases</h4>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">▸</span> <strong>미전환 잠재력 발견</strong>: Buzz 상위 but Performance 하위 → 마케팅 타겟</li>
            <li className="flex gap-2"><span className="text-primary">▸</span> <strong>ROI 벤치마크</strong>: 컴백 이벤트 전후 전환율 변화 측정</li>
            <li className="flex gap-2"><span className="text-primary">▸</span> <strong>기획사 리포트</strong>: "이 아티스트는 관심 대비 매출 전환이 업계 평균의 X배"</li>
            <li className="flex gap-2"><span className="text-primary">▸</span> <strong>Predictor 연동</strong>: 과거 전환율 패턴으로 B Data Performance 예측 정확도 ↑</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Data Pipeline</h4>
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 font-mono">
            ktrenz_data_snapshots (hanteo, apple, billboard already collected)<br />
            &nbsp;&nbsp;↓ Daily Cron Edge Function<br />
            ktrenz_revenue_signals (daily per artist)<br />
            &nbsp;&nbsp;↓ buzz_to_perf_ratio 계산<br />
            FES Predictor / Agency Dashboard
          </div>
        </div>
      </section>

      {/* Buzz vs Performance Insight */}
      <section className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Why Buzz ≠ Performance
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <div className="font-semibold text-foreground">High Buzz, Low Performance</div>
            <p className="text-xs text-muted-foreground">
              바이럴/밈으로 관심은 폭발하지만 음원·음반 매출이 낮음.
              팬덤 전환 전략이 필요한 아티스트.
            </p>
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-foreground">Low Buzz, High Performance</div>
            <p className="text-xs text-muted-foreground">
              소셜 노출은 적지만 코어 팬덤이 강해 판매가 꾸준함.
              마케팅 투자 시 폭발 가능성 높음.
            </p>
          </div>
        </div>
      </section>
    </>
  );
};

export default SignalRadarIntelligenceSection;
