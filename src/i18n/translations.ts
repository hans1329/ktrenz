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
  "agent.title": { en: "Fan Agent", ko: "팬 에이전트", ja: "ファンエージェント", zh: "粉丝助手" },
  "agent.subtitle": { en: "Helps with streaming strategy, trend analysis, and fan activities based on real-time data", ko: "실시간 데이터 기반 스트리밍 전략, 트렌드 분석, 팬 활동을 도와드려요", ja: "リアルタイムデータに基づくストリーミング戦略、トレンド分析、ファン活動をサポート", zh: "基于实时数据的流媒体策略、趋势分析和粉丝活动支持" },
  "agent.liveRankings": { en: "Live Rankings", ko: "실시간 랭킹", ja: "ライブランキング", zh: "实时排名" },
  "agent.trendAnalysis": { en: "Trend Analysis", ko: "트렌드 분석", ja: "トレンド分析", zh: "趋势分析" },
  "agent.streamingGuide": { en: "Streaming Guide", ko: "스밍 가이드", ja: "ストリーミングガイド", zh: "流媒体指南" },
  "agent.alertSettings": { en: "Alert Settings", ko: "알림 설정", ja: "アラート設定", zh: "提醒设置" },
  "agent.inputPlaceholder": { en: "Ask about artists, trends, streaming...", ko: "아티스트, 트렌드, 스트리밍에 대해 물어보세요...", ja: "アーティスト、トレンド、ストリーミングについて質問...", zh: "询问有关艺人、趋势、流媒体的问题..." },
  "agent.signInNotice": { en: "Sign In Required", ko: "로그인 필요", ja: "ログインが必要です", zh: "需要登录" },
  "agent.signInNoticeDesc": { en: "Please sign in to activate Fan Agent", ko: "팬 에이전트를 활성화하려면 로그인하세요", ja: "ファンエージェントを有効にするにはログインしてください", zh: "请登录以激活粉丝助手" },
  "agent.alertsOff": { en: "Alerts turned off", ko: "알림이 해제되었습니다", ja: "アラートがオフになりました", zh: "提醒已关闭" },
  "agent.uploadSuccess": { en: "Agent profile image updated!", ko: "에이전트 프로필 이미지가 업데이트되었습니다!", ja: "エージェントのプロフィール画像が更新されました！", zh: "助手头像已更新！" },
  "agent.clearChat": { en: "Clear chat", ko: "대화 초기화", ja: "チャットをクリア", zh: "清除聊天" },
  "agent.clearChatConfirmTitle": { en: "Clear chat history?", ko: "대화 기록을 삭제할까요?", ja: "チャット履歴を削除しますか？", zh: "清除聊天记录？" },
  "agent.clearChatConfirmDesc": { en: "All messages will be permanently deleted. This cannot be undone.", ko: "모든 대화 내용이 영구적으로 삭제됩니다. 되돌릴 수 없어요.", ja: "すべてのメッセージが完全に削除されます。元に戻すことはできません。", zh: "所有消息将被永久删除，此操作无法撤销。" },
  "agent.clearChatConfirm": { en: "Delete", ko: "삭제", ja: "削除", zh: "删除" },
  "agent.clearChatCancel": { en: "Cancel", ko: "취소", ja: "キャンセル", zh: "取消" },
  "agent.changePhoto": { en: "Change profile photo", ko: "프로필 사진 변경", ja: "プロフィール写真を変更", zh: "更改头像" },
  "agent.limitExceeded": { en: "Daily free limit reached and points are insufficient.", ko: "일일 무료 한도를 초과했고 포인트가 부족해요.", ja: "1日の無料上限を超え、ポイントが不足しています。", zh: "已超出每日免费额度且积分不足。" },
  "agent.pointPurchaseTitle": { en: "Use points for this message?", ko: "포인트로 이 대화를 진행할까요?", ja: "このメッセージにポイントを使いますか？", zh: "要用积分发送这条消息吗？" },
  "agent.pointPurchaseDesc": { en: "Your free daily limit is exhausted. 5 points will be deducted.", ko: "무료 일일 한도를 모두 사용했어요. 5포인트가 차감됩니다.", ja: "無料の日次上限を使い切りました。5ポイントが差し引かれます。", zh: "今日免费额度已用完，将扣除5积分。" },
  "agent.pointPurchaseConfirm": { en: "Use 5 points", ko: "5포인트 사용", ja: "5ポイント使用", zh: "使用5积分" },
  "agent.chatCleared": { en: "Chat history cleared", ko: "대화 기록이 초기화되었습니다", ja: "チャット履歴がクリアされました", zh: "聊天记录已清除" },
  "agent.status.thinking": { en: "Analyzing your question…", ko: "질문을 분석하고 있어요…", ja: "質問を分析中…", zh: "正在分析您的问题…" },
  "agent.status.writing": { en: "Writing response…", ko: "답변을 작성하고 있어요…", ja: "回答を作成中…", zh: "正在撰写回答…" },

  // ── Agent Quick Action Prompts ──
  "agent.prompt.liveRankings": { en: "Show me the live trend rankings Top 10", ko: "실시간 트렌드 랭킹 Top 10 보여줘", ja: "リアルタイムトレンドランキングTop10を見せて", zh: "展示实时趋势排名前10" },
  "agent.prompt.trendAnalysis": { en: "Analyze today's most notable trend changes", ko: "오늘 가장 주목할 만한 트렌드 변화를 분석해줘", ja: "今日の最も注目すべきトレンド変化を分析して", zh: "分析今天最值得关注的趋势变化" },
  "agent.prompt.streamingGuide": { en: "I want a streaming guide for my watched artist.", ko: "내 관심 아티스트 스밍 가이드를 보고 싶어.", ja: "お気に入りアーティストのストリーミングガイドが見たい。", zh: "我想看关注艺人的流媒体指南。" },
  "agent.prompt.alertSettings": { en: "I want to set up ranking change alerts for my favorite artists. Guide me on how to add artists by name.", ko: "관심 아티스트의 랭킹 변동 알림을 설정하고 싶어. 아티스트 이름으로 추가하는 방법을 안내해줘.", ja: "お気に入りアーティストのランキング変動アラートを設定したい。アーティスト名で追加する方法を教えて。", zh: "我想为喜欢的艺人设置排名变动提醒。请指导我如何按名字添加艺人。" },
  "agent.prompt.alertSetup": { en: "How do I set up artist tracking for alerts? Please guide me.", ko: "아티스트 트래킹 알림은 어떻게 설정하나요? 안내해주세요.", ja: "アーティストのトラッキングアラートはどう設定しますか？教えてください。", zh: "如何设置艺人跟踪提醒？请指导我。" },
  "agent.fanActivity": { en: "Today's Activity", ko: "오늘의 팬활동", ja: "今日のファン活動", zh: "今日粉丝活动" },
  "agent.prompt.fanActivity": { en: "Recommend one fan activity I can do right now for my favorite artist!", ko: "지금 바로 할 수 있는 팬활동 하나 추천해줘!", ja: "今すぐできるファン活動を1つ推薦して！", zh: "推荐一个我现在可以做的粉丝活动！" },
  "agent.welcomeNoArtist": { en: "Hello! 🎵\n\nYou haven't registered any favorite artists yet.\n**Who is your favorite artist?** 💜\n\nTell me their name and I'll start providing real-time trend alerts and personalized analysis!", ko: "안녕하세요, 주인님! 🎵\n\n아직 관심 아티스트가 등록되지 않았어요.\n**당신의 최애 아티스트는 누구인가요?** 💜\n\n아티스트 이름을 알려주시면 실시간 트렌드 알림과 맞춤 분석을 시작할게요!", ja: "こんにちは！🎵\n\nまだお気に入りアーティストが登録されていません。\n**あなたの推しアーティストは誰ですか？** 💜\n\nアーティスト名を教えていただければ、リアルタイムトレンドアラートとパーソナル分析を始めます！", zh: "你好！🎵\n\n还没有注册任何关注的艺人。\n**你最喜欢的艺人是谁？** 💜\n\n告诉我名字，我将开始提供实时趋势提醒和个性化分析！" },

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
  "drawer.categoryChanges": { en: "Category Changes", ko: "카테고리 변동", ja: "カテゴリ変動", zh: "分类变化" },
  "drawer.scoreMomentum": { en: "Score Momentum", ko: "스코어 모멘텀", ja: "スコアモメンタム", zh: "评分趋势" },
  "drawer.energySurging": { en: "Energy Surging", ko: "에너지 급상승", ja: "エネルギー急上昇", zh: "能量飙升" },
  "drawer.surgingLocation": { en: "Energy Surging Location", ko: "에너지 급상승 위치", ja: "エネルギー急上昇の位置", zh: "能量飙升位置" },
  "drawer.fanEnergyInspector": { en: "Fan Energy Inspector", ko: "팬 에너지 분석", ja: "ファンエネルギー分析", zh: "粉丝能量分析" },

  "drawer.fesLabel": { en: "Fan Energy Score", ko: "팬 에너지 스코어", ja: "ファンエネルギースコア", zh: "粉丝能量分数" },
  "drawer.change24h": { en: "24h Change", ko: "24시간 변동률", ja: "24時間変動率", zh: "24小时变动率" },

  // ── Missions ──
  "mission.todaysMission": { en: "Today's Mission", ko: "오늘의 미션", ja: "今日のミッション", zh: "今日任务" },
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
