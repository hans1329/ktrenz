import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bot, Send, ArrowLeft, Sparkles, TrendingUp, Music2, Bell, Loader2, BellRing, Camera, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useLanguage } from "@/contexts/LanguageContext";
import V3StreamingGuideCards from "@/components/v3/V3StreamingGuideCards";
import V3RankingCards, { type RankingEntry } from "@/components/v3/V3RankingCards";
import V3BriefingCard, { type BriefingData } from "@/components/v3/V3BriefingCard";

// ── Types ──────────────────────────────────────────────
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  guideData?: any[] | null;
  rankingData?: RankingEntry[] | null;
  briefingData?: BriefingData | null;
};

type AgentMode = "chat" | "trend" | "streaming" | "alert";

interface QuickAction {
  icon: React.ElementType;
  label: string;
  prompt: string;
  mode: AgentMode;
  color: string;
}

const getQuickActions = (t: (key: string) => string): QuickAction[] => [
  { icon: TrendingUp, label: t("agent.liveRankings"), prompt: t("agent.prompt.liveRankings"), mode: "trend", color: "text-blue-400" },
  { icon: Sparkles, label: t("agent.trendAnalysis"), prompt: t("agent.prompt.trendAnalysis"), mode: "trend", color: "text-purple-400" },
  { icon: Music2, label: t("agent.streamingGuide"), prompt: t("agent.prompt.streamingGuide"), mode: "streaming", color: "text-green-400" },
  { icon: Bell, label: t("agent.alertSettings"), prompt: t("agent.prompt.alertSettings"), mode: "alert", color: "text-amber-400" },
];

const CHAT_URL = `https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-fan-agent`;

// ── Avatar Upload Hook ─────────────────────────────────
function useAgentAvatar(userId?: string) {
  const queryClient = useQueryClient();

  const { data: avatarUrl } = useQuery({
    queryKey: ["ktrenz-agent-avatar", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await (supabase as any)
        .from("ktrenz_agent_profiles")
        .select("avatar_url")
        .eq("user_id", userId)
        .maybeSingle();
      return data?.avatar_url ?? null;
    },
    enabled: !!userId,
  });

  const uploadAvatar = useCallback(async (file: File) => {
    if (!userId) return;

    // Convert to webp using canvas
    const webpBlob = await convertToWebp(file);
    const filePath = `${userId}/agent-avatar.webp`;

    // Upload to storage
    const { error: uploadErr } = await supabase.storage
      .from("agent-avatars")
      .upload(filePath, webpBlob, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadErr) {
      toast.error("Image upload failed: " + uploadErr.message);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("agent-avatars")
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

    // Upsert profile
    const { error: dbErr } = await (supabase as any)
      .from("ktrenz_agent_profiles")
      .upsert(
        { user_id: userId, avatar_url: publicUrl, updated_at: new Date().toISOString() } as any,
        { onConflict: "user_id" }
      );

    if (dbErr) {
      toast.error("Profile save failed: " + dbErr.message);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-avatar", userId] });
    toast.success("Agent profile image updated!");
  }, [userId, queryClient]);

  return { avatarUrl, uploadAvatar };
}

async function convertToWebp(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxSize = 256;
      let w = img.width;
      let h = img.height;
      if (w > h) { h = (h / w) * maxSize; w = maxSize; }
      else { w = (w / h) * maxSize; h = maxSize; }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("WebP conversion failed")),
        "image/webp",
        0.85
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ── Streaming helper ───────────────────────────────────
async function streamChat({
  messages,
  token,
  onDelta,
  onMeta,
  onDone,
}: {
  messages: ChatMessage[];
  token: string;
  onDelta: (text: string) => void;
  onMeta?: (meta: any) => void;
  onDone: () => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, language: (window as any).__ktrenz_lang || "ko" }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Unknown error" }));
    if (resp.status === 429) throw new Error("Too many requests. Please try again shortly.");
    if (resp.status === 402) throw new Error("Insufficient credits.");
    throw new Error(err.error || `Error ${resp.status}`);
  }
  if (!resp.body) throw new Error("No response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const processLine = (line: string) => {
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.startsWith(":") || line.trim() === "") return false;
    if (!line.startsWith("data: ")) return false;
    const jsonStr = line.slice(6).trim();
    if (jsonStr === "[DONE]") return true;
    try {
      const parsed = JSON.parse(jsonStr);
      // Check for meta event (structured card data)
      if (parsed.meta && onMeta) {
        onMeta(parsed.meta);
        return false;
      }
      const content = parsed.choices?.[0]?.delta?.content ?? parsed.content;
      if (content) onDelta(content);
    } catch { /* partial chunk, ignore */ }
    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (processLine(line)) { onDone(); return; }
    }
  }

  if (buffer.trim()) {
    for (const raw of buffer.split("\n")) {
      if (raw) processLine(raw);
    }
  }
  onDone();
}

// ── Agent Avatar Component ─────────────────────────────
const AgentAvatar = ({
  avatarUrl,
  size = "sm",
  onUpload,
}: {
  avatarUrl: string | null | undefined;
  size?: "sm" | "lg";
  onUpload?: (file: File) => void;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const sizeClasses = size === "lg"
    ? "w-10 h-10 rounded-xl"
    : "w-9 h-9 rounded-xl";

  return (
    <>
      <button
        type="button"
        onClick={() => onUpload && fileRef.current?.click()}
        className={cn(
          sizeClasses,
          "relative overflow-hidden shrink-0 flex items-center justify-center",
          "bg-primary/10 border border-primary/20",
          onUpload && "cursor-pointer hover:border-primary/40 transition-colors group"
        )}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Agent" className="w-full h-full object-cover" />
        ) : (
          <Bot className={cn("text-primary", size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5")} />
        )}
        {onUpload && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </button>
      {onUpload && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      )}
    </>
  );
};

// ── Component ──────────────────────────────────────────
interface V3FanAgentProps {
  onBack?: () => void;
}

const V3FanAgent = ({ onBack }: V3FanAgentProps) => {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const QUICK_ACTIONS = getQuickActions(t);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { avatarUrl, uploadAvatar } = useAgentAvatar(user?.id);
  const [briefingTriggered, setBriefingTriggered] = useState(false);

  // Check if user has watched artists (alert ON)
  const { data: watchedArtists } = useQuery({
    queryKey: ["ktrenz-watched-artists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("ktrenz_watched_artists")
        .select("id, artist_name, wiki_entry_id")
        .eq("user_id", user.id);
      if (error) console.error("Watched artists fetch error:", error);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const hasAlertOn = (watchedArtists?.length ?? 0) > 0;

  const { data: chatHistory } = useQuery({
    queryKey: ["ktrenz-agent-chat", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("ktrenz_fan_agent_messages")
        .select("role, content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) {
        console.warn("Chat history load failed:", error.message);
        return [];
      }
      return (data || []).map((d) => ({ role: d.role as "user" | "assistant", content: d.content, timestamp: d.created_at }));
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (chatHistory && chatHistory.length > 0 && messages.length === 0 && !hasStarted) {
      setMessages(chatHistory);
      setHasStarted(true);
    }
  }, [chatHistory, messages.length, hasStarted]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- 자동 브리핑 트리거 ---
  const fetchBriefing = useCallback(async () => {
    if (!session?.access_token || !hasAlertOn) return;

    // 오늘 이미 브리핑했는지 localStorage 체크
    const briefingKey = `ktrenz-briefing-${user?.id}`;
    const lastBriefing = localStorage.getItem(briefingKey);
    const today = new Date().toISOString().slice(0, 10);
    if (lastBriefing === today) return;

    // 관심 아티스트의 변동률 확인
    const wikiIds = (watchedArtists ?? [])
      .map((w: any) => w.wiki_entry_id)
      .filter(Boolean);

    if (wikiIds.length === 0) return;

    const { data: scores } = await supabase
      .from("v3_scores_v2" as any)
      .select("wiki_entry_id, energy_change_24h")
      .in("wiki_entry_id", wikiIds);

    const hasSignificantChange = (scores as any[] ?? []).some(
      (s: any) => Math.abs(s.energy_change_24h ?? 0) >= 5
    );

    if (!hasSignificantChange) {
      // 변동 없어도 하루에 한번은 기록
      localStorage.setItem(briefingKey, today);
      return;
    }

    // 브리핑 요청
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ mode: "briefing", language: (window as any).__ktrenz_lang || "ko" }),
      });

      if (!resp.ok) return;
      const data = await resp.json();

      if (data.briefing) {
        const briefingMsg: ChatMessage = {
          role: "assistant",
          content: data.summary || "📊 오늘의 브리핑이에요, 주인님!",
          timestamp: new Date().toISOString(),
          briefingData: data.briefing,
        };
        setMessages((prev) => [briefingMsg, ...prev]);
        setHasStarted(true);
        localStorage.setItem(briefingKey, today);
      }
    } catch (e) {
      console.error("Briefing fetch error:", e);
    }
  }, [session?.access_token, hasAlertOn, watchedArtists, user?.id]);

  // --- 관심 아티스트 없을 때 자동 첫 메시지 ---
  const [welcomeSent, setWelcomeSent] = useState(false);
  useEffect(() => {
    if (
      user?.id &&
      watchedArtists !== undefined &&
      !hasAlertOn &&
      !welcomeSent &&
      !isStreaming &&
      chatHistory !== undefined
    ) {
      setWelcomeSent(true);
      const welcomeMsg: ChatMessage = {
        role: "assistant",
        content: t("agent.welcomeNoArtist"),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, welcomeMsg]);
      setHasStarted(true);
    }
  }, [user?.id, watchedArtists, hasAlertOn, welcomeSent, isStreaming, chatHistory]);

  useEffect(() => {
    if (hasAlertOn && session?.access_token && !briefingTriggered && !isStreaming) {
      setBriefingTriggered(true);
      // 약간의 딜레이 후 브리핑 (채팅 히스토리 로드 후)
      const timer = setTimeout(() => fetchBriefing(), 1000);
      return () => clearTimeout(timer);
    }
  }, [hasAlertOn, session?.access_token, briefingTriggered, isStreaming, fetchBriefing]);

  // Guide/Ranking data fetching removed — now handled via tool calling in the edge function

  const track = useTrackEvent();
  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText || chatInput).trim();
    if (!text || isStreaming || !session?.access_token) return;

    track("agent_chat", { mode: "chat" });
    setChatInput("");
    setIsStreaming(true);
    setHasStarted(true);

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date().toISOString() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    let assistantContent = "";

    try {
      await streamChat({
        messages: updatedMessages,
        token: session.access_token,
        onDelta: (chunk) => {
          assistantContent += chunk;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, content: assistantContent } : m
              );
            }
            return [...prev, { role: "assistant" as const, content: assistantContent, timestamp: new Date().toISOString() }];
          });
        },
        onMeta: (meta) => {
          // Attach structured data (guideData, rankingData) to the last assistant message
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx]?.role === "assistant") {
              return prev.map((m, i) =>
                i === lastIdx ? { ...m, guideData: meta.guideData ?? m.guideData, rankingData: meta.rankingData ?? m.rankingData } : m
              );
            }
            return prev;
          });
        },
        onDone: () => {
          setIsStreaming(false);
          queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-chat", user?.id] });
          queryClient.invalidateQueries({ queryKey: ["ktrenz-watched-artists", user?.id] });
        },
      });
    } catch (e: any) {
      setIsStreaming(false);
      toast.error(e.message || "Failed to send message");
      setMessages((prev) => prev.slice(0, -1));
    }
  }, [chatInput, isStreaming, session, messages, user?.id, queryClient, hasAlertOn]);

  const handleQuickAction = (action: QuickAction) => {
    handleSend(action.prompt);
  };

  // ── Sub-header ──
  const handleClearChat = useCallback(async () => {
    if (!user?.id) return;
    // Delete from DB
    await supabase
      .from("ktrenz_fan_agent_messages" as any)
      .delete()
      .eq("user_id", user.id);
    setMessages([]);
    setHasStarted(false);
    setWelcomeSent(false);
    setBriefingTriggered(false);
    queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-chat", user.id] });
    toast.success(t("agent.chatCleared"));
  }, [user?.id, queryClient, t]);

  const renderSubHeader = () => (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-1 min-w-[72px]">
          <Button variant="ghost" size="icon" className="rounded-full w-9 h-9" onClick={() => (onBack ? onBack() : navigate(-1))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          {hasStarted && messages.length > 0 && (
            <Button variant="ghost" size="icon" className="rounded-full w-9 h-9 text-muted-foreground hover:text-destructive" onClick={handleClearChat} title={t("agent.clearChat")}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
          <AgentAvatar avatarUrl={avatarUrl} size="lg" onUpload={uploadAvatar} />
          <h1 className="text-base font-bold text-foreground">
            {hasAlertOn ? `${(watchedArtists as any[])[0]?.artist_name} Agent` : t("agent.title")}
          </h1>
        </div>
        <div className="flex items-center gap-2 min-w-[72px] justify-end">
          {hasAlertOn && <BellRing className="w-4 h-4 text-amber-400" />}
          <button
            type="button"
            onClick={async () => {
              if (!hasAlertOn) {
                handleSend(t("agent.prompt.alertSetup"));
              } else if (user?.id) {
                await supabase
                  .from("ktrenz_watched_artists")
                  .delete()
                  .eq("user_id", user.id);
                queryClient.invalidateQueries({ queryKey: ["ktrenz-watched-artists", user.id] });
                toast.success(t("agent.alertsOff"));
              }
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
              hasAlertOn ? "bg-primary" : "bg-muted"
            )}
          >
            <span
              className={cn(
                "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                hasAlertOn ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>
    </header>
  );

  // ── Not signed in ──
  if (!user) {
    return (
      <div className="pt-[calc(3.5rem+env(safe-area-inset-top,0px))]">
        {renderSubHeader()}
        <div className="px-4 py-12 text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-10 h-10 text-primary/40" />
          </div>
          <p className="text-lg font-semibold text-foreground">{t("agent.signInNotice")}</p>
          <p className="text-sm text-muted-foreground">{t("agent.signInNoticeDesc")}</p>
        </div>
      </div>
    );
  }

  // ── Welcome / Empty state ──
  const renderWelcome = () => (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8">
      <AgentAvatar avatarUrl={avatarUrl} size="lg" onUpload={uploadAvatar} />
      <h2 className="text-lg font-bold text-foreground mb-1 mt-4">KTRENZ {t("agent.title")}</h2>
      <p className="text-sm text-muted-foreground text-center max-w-[280px] mb-6">
        {t("agent.subtitle")}
      </p>

      <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action)}
              disabled={isStreaming}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-card border border-border/50 hover:border-primary/30 hover:bg-card/80 transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                <Icon className={cn("w-4 h-4", action.color)} />
              </div>
              <span className="text-sm font-medium text-foreground leading-tight">{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Chat messages ──
  const renderMessages = () => (
    <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
      {messages.map((msg, i) => (
        <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
          {msg.role === "assistant" && (
            <AgentAvatar avatarUrl={avatarUrl} size="sm" />
          )}
          <div className={cn("flex flex-col max-w-[85%]", msg.role === "user" ? "items-end" : "items-start", msg.role === "assistant" && "ml-2")}>
            <div
              className={cn(
                "rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed",
                msg.role === "user"
                  ? "bg-gradient-to-br from-primary/25 to-purple-500/20 text-foreground rounded-br-md"
                  : "bg-card/60 border border-border/30 text-muted-foreground rounded-bl-md"
              )}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 text-foreground">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                  {isStreaming && i === messages.length - 1 && (
                    <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse rounded-sm" />
                  )}
                </div>
              ) : (
                msg.content
              )}
            </div>

            {msg.role === "assistant" && msg.briefingData && (
              <V3BriefingCard data={msg.briefingData} />
            )}

            {msg.role === "assistant" && msg.rankingData && msg.rankingData.length > 0 && (
              <V3RankingCards rankings={msg.rankingData} />
            )}

            {msg.role === "assistant" && msg.guideData && msg.guideData.length > 0 && (
              <V3StreamingGuideCards guides={msg.guideData} />
            )}

            {msg.timestamp && (
              <span className="text-[10px] text-muted-foreground/40 mt-0.5 px-1">
                {new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      ))}
      <div ref={chatEndRef} />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {renderSubHeader()}

      {!hasStarted || messages.length === 0 ? renderWelcome() : renderMessages()}

      {/* Input area */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-border/30 max-w-screen-lg mx-auto w-full">
        {hasStarted && messages.length > 0 && !isStreaming && (
          <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-hide pb-1">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-muted/50 border border-border/30 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all shrink-0"
                >
                  <Icon className={cn("w-3 h-3", action.color)} />
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2 bg-card border border-border/50 rounded-2xl px-4 py-2.5 focus-within:border-primary/40 transition-colors">
          <input
            ref={inputRef}
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={t("agent.inputPlaceholder")}
            className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/60 outline-none"
            disabled={isStreaming}
          />
          <Button
            size="icon"
            className="rounded-full w-8 h-8 shrink-0"
            onClick={() => handleSend()}
            disabled={!chatInput.trim() || isStreaming}
          >
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default V3FanAgent;
