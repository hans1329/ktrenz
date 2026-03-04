export type Language = "en" | "ko" | "ja" | "zh";

export const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: "en", label: "EN", flag: "🇺🇸" },
  { code: "ko", label: "KO", flag: "🇰🇷" },
  { code: "ja", label: "JA", flag: "🇯🇵" },
  { code: "zh", label: "ZH", flag: "🇨🇳" },
];

const translations: Record<string, Record<Language, string>> = {
  // ── Common ──
  "common.back": { en: "Back", ko: "뒤로", ja: "戻る", zh: "返回" },
  "common.signIn": { en: "Sign In", ko: "로그인", ja: "ログイン", zh: "登录" },
  "common.signOut": { en: "Sign Out", ko: "로그아웃", ja: "ログアウト", zh: "退出" },
  "common.settings": { en: "Settings", ko: "설정", ja: "設定", zh: "设置" },
  "common.comingSoon": { en: "Coming Soon", ko: "출시 예정", ja: "近日公開", zh: "即将推出" },
  "common.active": { en: "Active", ko: "활성", ja: "有効", zh: "已激活" },
  "common.free": { en: "Free", ko: "무료", ja: "無料", zh: "免费" },
  "common.submit": { en: "Submit", ko: "제출", ja: "送信", zh: "提交" },
  "common.current": { en: "CURRENT", ko: "현재", ja: "現在", zh: "当前" },

  // ── Navigation / Tabs ──
  "nav.trendz": { en: "K-Trenz", ko: "K·트렌즈", ja: "K·トレンズ", zh: "K·趋势" },
  "nav.agent": { en: "Agent", ko: "에이전트", ja: "エージェント", zh: "助手" },
  "nav.notifications": { en: "Alerts", ko: "알림", ja: "通知", zh: "通知" },
  "nav.activity": { en: "Activity", ko: "활동", ja: "アクティビティ", zh: "活动" },
  "nav.fanAgent": { en: "Fan Agent", ko: "팬 에이전트", ja: "ファンエージェント", zh: "粉丝助手" },
  "nav.collapse": { en: "Collapse", ko: "접기", ja: "折りたたむ", zh: "折叠" },
  "nav.myActivity": { en: "My Activity", ko: "나의 활동", ja: "マイ活動", zh: "我的活动" },
  "nav.profile": { en: "Profile", ko: "프로필", ja: "プロフィール", zh: "个人资料" },

  // ── Search ──
  "search.placeholder": { en: "Search artists, groups...", ko: "아티스트, 그룹 검색...", ja: "アーティスト、グループを検索...", zh: "搜索艺人、团体..." },
  "search.noResults": { en: "No results found", ko: "결과 없음", ja: "結果なし", zh: "未找到结果" },

  // ── Rankings ──
  "rankings.live": { en: "🔥 Live Fire", ko: "🔥 실시간 화력", ja: "🔥 リアルタイム火力", zh: "🔥 实时火力" },
  "rankings.subtitle": { en: "Multi-platform trend scores", ko: "멀티 플랫폼 트렌드 점수", ja: "マルチプラットフォームトレンドスコア", zh: "多平台趋势评分" },
  "rankings.updating": { en: "Updating", ko: "업데이트 중", ja: "更新中", zh: "更新中" },
  "rankings.artists": { en: "artists", ko: "아티스트", ja: "アーティスト", zh: "位艺人" },
  "rankings.fullRankings": { en: "Full Rankings", ko: "전체 순위", ja: "全ランキング", zh: "完整排名" },
  "rankings.comingSoon": { en: "Coming Soon", ko: "곧 공개됩니다", ja: "近日公開", zh: "即将推出" },
  "rankings.comingSoonDesc": { en: "Real-time trend scores will appear here.", ko: "실시간 트렌드 점수가 여기에 표시됩니다.", ja: "リアルタイムのトレンドスコアがここに表示されます。", zh: "实时趋势评分将在此显示。" },

  // ── Energy ──
  "energy.explosive": { en: "Explosive", ko: "폭발적", ja: "爆発的", zh: "爆发" },
  "energy.active": { en: "Active", ko: "활발", ja: "活発", zh: "活跃" },
  "energy.normal": { en: "Normal", ko: "보통", ja: "通常", zh: "正常" },
  "energy.low": { en: "Low", ko: "낮음", ja: "低い", zh: "低" },
  "energy.velocity": { en: "Velocity", ko: "속도", ja: "速度", zh: "速度" },
  "energy.intensity": { en: "Intensity", ko: "강도", ja: "強度", zh: "强度" },

  // ── Login ──
  "login.title": { en: "Sign In – KTrenZ", ko: "로그인 – KTrenZ", ja: "ログイン – KTrenZ", zh: "登录 – KTrenZ" },
  "login.subtitle": { en: "Real-time K-Pop Trend Rankings", ko: "실시간 K-Pop 트렌드 랭킹", ja: "リアルタイムK-Popトレンドランキング", zh: "实时K-Pop趋势排名" },
  "login.google": { en: "Continue with Google", ko: "Google로 계속", ja: "Googleで続行", zh: "使用Google继续" },
  "login.email": { en: "Continue with Email", ko: "이메일로 계속", ja: "メールで続行", zh: "使用邮箱继续" },
  "login.emailLabel": { en: "Email", ko: "이메일", ja: "メール", zh: "邮箱" },
  "login.password": { en: "Password", ko: "비밀번호", ja: "パスワード", zh: "密码" },
  "login.createAccount": { en: "Create Account", ko: "회원가입", ja: "アカウント作成", zh: "创建账号" },
  "login.noAccount": { en: "Don't have an account?", ko: "계정이 없으신가요?", ja: "アカウントをお持ちでない方", zh: "没有账号？" },
  "login.hasAccount": { en: "Already have an account?", ko: "이미 계정이 있으신가요?", ja: "すでにアカウントをお持ちの方", zh: "已有账号？" },
  "login.signUp": { en: "Sign up", ko: "회원가입", ja: "登録", zh: "注册" },
  "login.backToRankings": { en: "← Back to Rankings", ko: "← 랭킹으로 돌아가기", ja: "← ランキングに戻る", zh: "← 返回排名" },

  // ── Fan Agent ──
  "agent.signInRequired": { en: "Sign In Required", ko: "로그인 필요", ja: "ログインが必要です", zh: "需要登录" },
  "agent.signInDesc": { en: "Please sign in to use Fan Agent.", ko: "팬 에이전트를 사용하려면 로그인하세요.", ja: "ファンエージェントを使用するにはログインしてください。", zh: "请登录以使用粉丝助手。" },
  "agent.goBack": { en: "← Go Back", ko: "← 돌아가기", ja: "← 戻る", zh: "← 返回" },

  // ── Profile Overlay ──
  "profile.viewPlans": { en: "View plans & upgrade →", ko: "플랜 보기 및 업그레이드 →", ja: "プランを見る →", zh: "查看方案和升级 →" },

  // ── Artist Listing Request ──
  "listing.cantFind": { en: "Can't find your favorite artist?", ko: "찾는 아티스트가 없나요?", ja: "お気に入りのアーティストが見つかりませんか？", zh: "找不到你喜欢的艺人？" },
  "listing.request": { en: "Request Listing", ko: "등록 요청", ja: "リスティングリクエスト", zh: "请求上架" },
  "listing.title": { en: "Request Artist Listing", ko: "아티스트 등록 요청", ja: "アーティストリスティングリクエスト", zh: "请求艺人上架" },
  "listing.officialName": { en: "Official Name", ko: "공식 이름", ja: "公式名", zh: "官方名称" },
  "listing.socialLinks": { en: "Official Social Links", ko: "공식 소셜 링크", ja: "公式ソーシャルリンク", zh: "官方社交链接" },
  "listing.note": { en: "Additional Note", ko: "추가 메모", ja: "追加メモ", zh: "补充说明" },
  "listing.submitRequest": { en: "Submit Request", ko: "요청 제출", ja: "リクエスト送信", zh: "提交请求" },
  "listing.submitting": { en: "Submitting...", ko: "제출 중...", ja: "送信中...", zh: "提交中..." },

  // ── K-Pass ──
  "kpass.title": { en: "K-Pass", ko: "K-Pass", ja: "K-Pass", zh: "K-Pass" },
  "kpass.currentPlan": { en: "Current plan:", ko: "현재 플랜:", ja: "現在のプラン:", zh: "当前方案:" },
  "kpass.premiumSoon": { en: "Premium tiers coming soon. Stay tuned!", ko: "프리미엄 등급이 곧 출시됩니다!", ja: "プレミアムティアは近日公開！", zh: "高级会员即将推出，敬请期待！" },
  "kpass.perMonth": { en: "/month", ko: "/월", ja: "/月", zh: "/月" },

  // ── PWA ──
  "pwa.newVersion": { en: "New version available", ko: "새 버전이 있습니다", ja: "新しいバージョンがあります", zh: "有新版本可用" },
  "pwa.refresh": { en: "Refresh", ko: "새로고침", ja: "更新", zh: "刷新" },

  // ── Treemap / Drawer ──
  "drawer.categoryChanges": { en: "Category Changes (24h)", ko: "카테고리 변동 (24h)", ja: "カテゴリ変動 (24h)", zh: "分类变化 (24h)" },
  "drawer.scoreMomentum": { en: "Score Momentum", ko: "스코어 모멘텀", ja: "スコアモメンタム", zh: "评分趋势" },
  "drawer.energySurging": { en: "Energy Surging", ko: "에너지 급상승", ja: "エネルギー急上昇", zh: "能量飙升" },
  "drawer.fanEnergyInspector": { en: "Fan Energy Inspector", ko: "팬 에너지 분석", ja: "ファンエネルギー分析", zh: "粉丝能量分析" },

  // ── Missions ──
  "mission.todaysMission": { en: "Today's Mission", ko: "Today's Mission", ja: "今日のミッション", zh: "今日任务" },
  "mission.loginForReward": { en: "Sign in to earn mission rewards!", ko: "로그인하면 미션 보상을 받을 수 있어요!", ja: "ログインしてミッション報酬を獲得！", zh: "登录即可获取任务奖励！" },
  "mission.complete": { en: "Mission Complete! 🎉", ko: "미션 완료! 🎉", ja: "ミッション完了！🎉", zh: "任务完成！🎉" },
  "mission.category.youtube": { en: "YouTube", ko: "YouTube", ja: "YouTube", zh: "YouTube" },
  "mission.category.news": { en: "News", ko: "뉴스", ja: "ニュース", zh: "新闻" },
  "mission.category.buzz": { en: "Buzz", ko: "Buzz", ja: "バズ", zh: "热议" },
  "mission.category.music": { en: "Music", ko: "Music", ja: "ミュージック", zh: "音乐" },
  "mission.categoryMission": { en: "Mission", ko: "미션", ja: "ミッション", zh: "任务" },
  "mission.searchOnX": { en: "Search on X", ko: "X에서 검색하기", ja: "Xで検索", zh: "在X上搜索" },
  "mission.latestNews": { en: "Check latest news", ko: "최신 소식 확인", ja: "最新ニュースを確認", zh: "查看最新消息" },
  "mission.postOnX": { en: "Post support on X", ko: "X에 응원 게시글 작성", ja: "Xで応援投稿", zh: "在X发布应援帖" },
  "mission.hashtag": { en: "hashtag", ko: "해시태그", ja: "ハッシュタグ", zh: "话题标签" },
  "mission.spotifyStream": { en: "Spotify Streaming", ko: "Spotify 스트리밍", ja: "Spotifyストリーミング", zh: "Spotify 播放" },
  "mission.melonStream": { en: "Melon Streaming", ko: "멜론 스트리밍", ja: "Melonストリーミング", zh: "Melon 播放" },
  "mission.melonSearch": { en: "Search on Melon", ko: "멜론에서 검색", ja: "Melonで検索", zh: "在Melon搜索" },
  "mission.listenTo": { en: "Listen to", ko: "듣기", ja: "聴く", zh: "收听" },
  "mission.listenLatest": { en: "Listen to latest songs", ko: "최신곡 듣기", ja: "最新曲を聴く", zh: "收听最新歌曲" },
  "mission.enjoyMusic": { en: "Enjoy music", ko: "음악 감상", ja: "音楽を楽しむ", zh: "欣赏音乐" },
  "mission.video": { en: "Video", ko: "영상", ja: "動画", zh: "视频" },
  "mission.latestVideo": { en: "Latest video", ko: "최신 영상", ja: "最新動画", zh: "最新视频" },
  "mission.completed": { en: "Completed: ", ko: "미션 완료: ", ja: "ミッション完了: ", zh: "任务完成: " },
  "mission.allDoneTitle": { en: "All missions complete! 🎉", ko: "오늘의 미션 올클리어! 🎉", ja: "全ミッションクリア！🎉", zh: "全部任务完成！🎉" },
  "mission.allDoneDesc": { en: "Great job! Come back tomorrow for new missions.", ko: "잘 하셨어요! 내일 또 새로운 미션으로 만나요 💪", ja: "お疲れ様でした！明日も新しいミッションでお会いしましょう💪", zh: "做得好！明天再来完成新任务吧💪" },
};

export default translations;
