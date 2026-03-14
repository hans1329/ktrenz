import SEO from "@/components/SEO";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Radar, Tag, MessageCircle, Eye, ShieldCheck, Layers, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

const SignalRadar = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Signal Radar – KTrenZ Proprietary Data Infrastructure"
        description="Signal Radar builds a defensible data moat by collecting exclusive event labels, fandom signals, and attention data that competitors cannot replicate."
        path="/signal"
      />

      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Radar className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Signal Radar</h1>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">

        {/* Hero */}
        <section className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <Radar className="w-3.5 h-3.5" />
            Internal Project
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground leading-tight">
            Project: Signal Radar
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            KTrenZ 플랫폼 내부에서만 생성되는 독점 시그널을 수집·집계하여,
            FES 예측 정확도와 기획사 대시보드의 전략적 가치를 비약적으로 높이는 데이터 인프라 프로젝트.
          </p>
          <p className="text-sm text-muted-foreground italic">
            "경쟁자가 크롤링할 수 없는 데이터만이 진정한 해자(Moat)가 된다."
          </p>
        </section>

        {/* Architecture */}
        <section className="space-y-4">
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Architecture Overview
          </h3>
          <div className="rounded-xl border border-border bg-card p-5 font-mono text-xs leading-relaxed text-muted-foreground overflow-x-auto">
            <pre>{`┌─────────────────────────────────────────────┐
│          FES Predictor v4 (Enhanced)        │
│  기존 5축 + Event Context + Fandom Heat     │
│  + Attention Signal = 8-Dimensional Model   │
└──────────┬──────────┬──────────┬────────────┘
           │          │          │
  ┌────────┴───┐ ┌────┴────┐ ┌──┴───────────┐
  │ Signal-A   │ │Signal-B │ │  Signal-C    │
  │ Event Label│ │ Fandom  │ │  Attention   │
  │ "왜 움직임"│ │ Pulse   │ │  Map         │
  │            │ │"뭘 궁금"│ │ "뭘 봤는지"  │
  └─────┬──────┘ └────┬────┘ └──┬───────────┘
        │             │         │
        └─────────────┼─────────┘
                      │
           ┌──────────┴──────────┐
           │   Pattern DB        │
           │  (Learning Asset)   │
           └─────────────────────┘`}</pre>
          </div>
        </section>

        {/* Signal-A */}
        <section className="space-y-4">
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            Signal-A: Event Label
          </h3>
          <p className="text-sm text-muted-foreground">
            FES 변동의 <strong>원인</strong>(컴백, 예능 출연, 바이럴 등)을 구조화하여 원인-결과 패턴 DB를 구축합니다.
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
                <tr><td className="px-3 py-1.5 font-mono">event_type</td><td className="px-3 py-1.5">enum</td><td className="px-3 py-1.5 text-muted-foreground">comeback, mv_release, album_release, festival, variety_show, award_show, viral_moment, scandal, concert_tour</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">event_date</td><td className="px-3 py-1.5">date</td><td className="px-3 py-1.5 text-muted-foreground">이벤트 발생일</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">event_title</td><td className="px-3 py-1.5">text</td><td className="px-3 py-1.5 text-muted-foreground">이벤트 제목</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">impact_window_days</td><td className="px-3 py-1.5">int</td><td className="px-3 py-1.5 text-muted-foreground">영향 지속 기간 (기본 7일)</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">labeled_by</td><td className="px-3 py-1.5">text</td><td className="px-3 py-1.5 text-muted-foreground">admin / ai_auto / fan_report</td></tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Use Cases</h4>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex gap-2"><span className="text-primary">▸</span> FES 차트 위 이벤트 마커 오버레이 → "이 시점에 컴백이 있었다"</li>
              <li className="flex gap-2"><span className="text-primary">▸</span> 이벤트 ROI 분석 — 어떤 활동이 FES에 가장 큰 영향?</li>
              <li className="flex gap-2"><span className="text-primary">▸</span> Predictor 연동: "컴백 D-7" 컨텍스트 주입 → 예측 정확도 ↑</li>
              <li className="flex gap-2"><span className="text-primary">▸</span> 과거 N회 컴백 패턴 → 카테고리별 리드타임 학습</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Data Pipeline</h4>
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 font-mono">
              Phase 1: Admin 수동 등록<br />
              Phase 2: Naver News AI 자동 분류 → Admin 승인<br />
              Phase 3: Fan Agent 대화 이벤트 감지 → 자동 후보
            </div>
          </div>
        </section>

        {/* Signal-B */}
        <section className="space-y-4">
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            Signal-B: Fandom Pulse
          </h3>
          <p className="text-sm text-muted-foreground">
            Fan Agent 대화에서 추출한 의도/감정을 일별 집계하여 <strong>팬덤 열기 지표</strong>를 생성합니다.
            이 데이터는 플랫폼 내부에서만 생성되므로 경쟁자가 복제할 수 없습니다.
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
                <tr><td className="px-3 py-1.5 font-mono">total_queries</td><td className="px-3 py-1.5">int</td><td className="px-3 py-1.5 text-muted-foreground">일별 총 질의 수</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">unique_users</td><td className="px-3 py-1.5">int</td><td className="px-3 py-1.5 text-muted-foreground">고유 유저 수</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">intent_distribution</td><td className="px-3 py-1.5">jsonb</td><td className="px-3 py-1.5 text-muted-foreground">{`{ranking_check: 45, streaming: 30, news: 15}`}</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">sentiment_avg</td><td className="px-3 py-1.5">numeric</td><td className="px-3 py-1.5 text-muted-foreground">평균 감정 (-1 ~ 1)</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">hot_topics</td><td className="px-3 py-1.5">jsonb</td><td className="px-3 py-1.5 text-muted-foreground">팬 관심 키워드 배열</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">avg_session_depth</td><td className="px-3 py-1.5">numeric</td><td className="px-3 py-1.5 text-muted-foreground">평균 대화 턴 수</td></tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Use Cases</h4>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex gap-2"><span className="text-primary">▸</span> <strong>선행 지표</strong>: 팬 질의 급증 → 48시간 후 FES 상승 패턴 발견</li>
              <li className="flex gap-2"><span className="text-primary">▸</span> <strong>FES 6번째 축</strong>: fandom_heat를 에너지 계산에 반영</li>
              <li className="flex gap-2"><span className="text-primary">▸</span> <strong>위기 감지</strong>: 감정이 negative로 급변 → 스캔들 조기 알림</li>
              <li className="flex gap-2"><span className="text-primary">▸</span> Event Label 자동화 트리거 (Signal-A와 연동)</li>
            </ul>
          </div>

          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 font-mono">
            ktrenz_agent_intents (already exists)<br />
            &nbsp;&nbsp;↓ Daily Cron Edge Function<br />
            ktrenz_fandom_signals (daily per artist)<br />
            &nbsp;&nbsp;↓<br />
            FES Predictor / Agency Dashboard
          </div>
        </section>

        {/* Signal-C */}
        <section className="space-y-4">
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Signal-C: Attention Map
          </h3>
          <p className="text-sm text-muted-foreground">
            유저 행동 로그(트리맵 클릭, 상세 조회, 외부 링크)를 아티스트 단위로 집계하여
            <strong> 실제 관심도 지표</strong>를 생성합니다.
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
                <tr><td className="px-3 py-1.5 font-mono">treemap_clicks</td><td className="px-3 py-1.5">int</td><td className="px-3 py-1.5 text-muted-foreground">트리맵 클릭 수</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">detail_views</td><td className="px-3 py-1.5">int</td><td className="px-3 py-1.5 text-muted-foreground">상세 페이지 조회 수</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">detail_sections</td><td className="px-3 py-1.5">jsonb</td><td className="px-3 py-1.5 text-muted-foreground">{`{youtube: 20, music: 15, buzz: 10}`}</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">unique_viewers</td><td className="px-3 py-1.5">int</td><td className="px-3 py-1.5 text-muted-foreground">고유 조회 유저 수</td></tr>
                <tr><td className="px-3 py-1.5 font-mono">ranking_card_clicks</td><td className="px-3 py-1.5">int</td><td className="px-3 py-1.5 text-muted-foreground">랭킹 카드 클릭 수</td></tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Use Cases</h4>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex gap-2"><span className="text-primary">▸</span> <strong>숨은 관심 아티스트</strong>: FES 낮지만 클릭 급증 → 주목 대상 발굴</li>
              <li className="flex gap-2"><span className="text-primary">▸</span> <strong>섹션 관심 분포</strong>: 팬들이 YouTube 섹션 집중 → 마케팅 근거</li>
              <li className="flex gap-2"><span className="text-primary">▸</span> <strong>이벤트 임팩트 정량화</strong>: 이벤트 전후 조회수 변화 측정</li>
              <li className="flex gap-2"><span className="text-primary">▸</span> <strong>Tier 자동 승격</strong>: attention 지속 상승 → Tier 2→1 추천</li>
            </ul>
          </div>

          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 font-mono">
            ktrenz_user_events (already exists)<br />
            &nbsp;&nbsp;↓ Daily Cron Edge Function<br />
            ktrenz_attention_signals (daily per artist)<br />
            &nbsp;&nbsp;↓<br />
            FES Predictor / Agency Dashboard / Tier Engine
          </div>
        </section>

        {/* Pipeline Guard */}
        <section className="space-y-4">
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Pipeline Guard
          </h3>
          <p className="text-sm text-muted-foreground">
            수집 파이프라인의 데이터 품질을 실시간으로 검증하는 독립 게이트.
            이상치가 감지되면 스냅샷에 <code className="bg-muted px-1 rounded text-xs">guard_flagged=true</code>를 마킹하여
            다운스트림 계산(Energy, FES)에서 제외합니다.
          </p>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Guard Rules (10개)</h4>
            <div className="grid gap-2 text-xs">
              {[
                { module: "YouTube", rules: ["조회수 50%+ 하락 → WARN", "구독자 20%+ 하락 → BLOCK", "조회수 0 반환 → BLOCK"] },
                { module: "Music", rules: ["점수 0 반환 → BLOCK", "Last.fm 리스너 0 → WARN"] },
                { module: "Buzz", rules: ["점수 10배+ 급등 → WARN", "점수 0 반환 → BLOCK"] },
                { module: "Social", rules: ["Instagram 팔로워 30%+ 하락 → BLOCK", "X 팔로워 30%+ 하락 → BLOCK"] },
                { module: "Hanteo", rules: ["판매량 음수/비정상 → BLOCK"] },
              ].map(({ module, rules }) => (
                <div key={module} className="flex gap-3">
                  <span className="font-medium text-foreground w-16 shrink-0">{module}</span>
                  <div className="text-muted-foreground">{rules.join(" · ")}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 font-mono">
            [Collection Module] → [Raw Data] → 🛡️ Guard Check → [Store + Flag]<br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├─ PASS → 정상 저장<br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├─ WARN → 저장 + 플래그<br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└─ BLOCK → 저장 + 플래그 + 다운스트림 제외
          </div>
        </section>

        {/* Roadmap */}
        <section className="space-y-4">
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Roadmap
          </h3>
          <div className="space-y-3">
            {[
              { phase: "Phase 1", status: "✅", title: "Pipeline Guard", desc: "Guard 테이블 + Edge Function + Admin UI + data-engine 통합" },
              { phase: "Phase 2", status: "✅", title: "Event Label System", desc: "ktrenz_artist_events 테이블 + Admin 등록 UI (/admin/signal-events)" },
              { phase: "Phase 3", status: "✅", title: "Fandom Pulse Aggregator", desc: "ktrenz_fandom_signals 테이블 + Daily Cron (04:30 UTC)" },
              { phase: "Phase 4", status: "✅", title: "Attention Map Aggregator", desc: "ktrenz_attention_signals 테이블 + Daily Cron (04:35 UTC)" },
              { phase: "Phase 5", status: "⬜", title: "FES Predictor v4", desc: "Signal Layer 데이터를 예측 모델에 주입 → 8차원 예측" },
            ].map(({ phase, status, title, desc }) => (
              <div key={phase} className="flex gap-3 items-start">
                <div className="text-sm w-7 shrink-0">{status}</div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    <span className="text-muted-foreground font-normal mr-2">{phase}</span>
                    {title}
                  </div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Final Goal */}
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-2">
          <h3 className="text-lg font-bold text-foreground">🎯 Final Goal</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            "아티스트 X가 D일 후 컴백할 때, 현재 팬덤 열기와 유저 관심도를 기반으로
            YouTube · Music · Buzz 각각의 예상 변동폭을 정량적으로 예측"
          </p>
          <div className="text-xs text-muted-foreground mt-2 space-y-1">
            <p><strong>Events</strong> → 과거 컴백 카테고리별 변화 패턴 N개 축적</p>
            <p><strong>Fandom Pulse</strong> → 컴백 전 팬 관심 수준 ↑ → Music 초동 +X%</p>
            <p><strong>Attention Map</strong> → 상세페이지 조회 급증 → YouTube D+1 조회수 +Y%</p>
          </div>
        </section>

        <div className="h-16" />
      </div>
    </div>
  );
};

export default SignalRadar;
