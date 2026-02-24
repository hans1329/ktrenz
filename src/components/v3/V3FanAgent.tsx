import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bot, Send, ArrowLeft, Home, Sparkles, TrendingUp, Music2, Bell, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

// ── Types ──────────────────────────────────────────────
type ChatMessage = { role: "user" | "assistant"; content: string };

type AgentMode = "chat" | "trend" | "streaming" | "alert";

interface QuickAction {
  icon: React.ElementType;
  label: string;
  prompt: string;
  mode: AgentMode;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: TrendingUp, label: "실시간 랭킹", prompt: "지금 실시간 트렌드 랭킹 Top 10을 알려줘", mode: "trend", color: "text-blue-400" },
  { icon: Sparkles, label: "트렌드 분석", prompt: "오늘 가장 주목할만한 트렌드 변화를 분석해줘", mode: "trend", color: "text-purple-400" },
  { icon: Music2, label: "스트리밍 팁", prompt: "내 아티스트의 스트리밍 전략을 추천해줘", mode: "streaming", color: "text-green-400" },
  { icon: Bell, label: "알림 설정", prompt: "관심 아티스트의 순위 변동 알림을 설정하고 싶어", mode: "alert", color: "text-amber-400" },
];

// ── Streaming helper ───────────────────────────────────
const CHAT_URL = `https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-fan-agent`;

async function streamChat({
  messages,
  token,
  onDelta,
  onDone,
}: {
  messages: ChatMessage[];
  token: string;
  onDelta: (text: string) => void;
  onDone: () => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Unknown error" }));
    if (resp.status === 429) throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    if (resp.status === 402) throw new Error("크레딧이 부족합니다.");
    throw new Error(err.error || `Error ${resp.status}`);
  }
  if (!resp.body) throw new Error("No response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { onDone(); return; }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content ?? parsed.content;
        if (content) onDelta(content);
      } catch { /* partial chunk, ignore */ }
    }
  }

  // flush remaining
  if (buffer.trim()) {
    for (let raw of buffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content ?? parsed.content;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }
  onDone();
}

// ── Component ──────────────────────────────────────────
interface V3FanAgentProps {
  onBack?: () => void;
}

const V3FanAgent = ({ onBack }: V3FanAgentProps) => {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load chat history from DB
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
      return (data || []).map((d) => ({ role: d.role as "user" | "assistant", content: d.content }));
    },
    enabled: !!user?.id,
  });

  // Sync history into local state on load
  useEffect(() => {
    if (chatHistory && chatHistory.length > 0 && messages.length === 0 && !hasStarted) {
      setMessages(chatHistory);
      setHasStarted(true);
    }
  }, [chatHistory, messages.length, hasStarted]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText || chatInput).trim();
    if (!text || isStreaming || !session?.access_token) return;

    setChatInput("");
    setIsStreaming(true);
    setHasStarted(true);

    const userMsg: ChatMessage = { role: "user", content: text };
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
            return [...prev, { role: "assistant", content: assistantContent }];
          });
        },
        onDone: () => {
          setIsStreaming(false);
          // Invalidate to refetch persisted history
          queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-chat", user?.id] });
        },
      });
    } catch (e: any) {
      setIsStreaming(false);
      toast.error(e.message || "메시지 전송에 실패했습니다");
      // Remove the failed user message
      setMessages((prev) => prev.slice(0, -1));
    }
  }, [chatInput, isStreaming, session, messages, user?.id, queryClient]);

  const handleQuickAction = (action: QuickAction) => {
    handleSend(action.prompt);
  };

  // ── Sub-header ──
  const renderSubHeader = () => (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between h-14 px-4 max-w-screen-lg mx-auto">
        <div className="flex items-center gap-1 min-w-[72px]">
          <Button variant="ghost" size="icon" className="rounded-full w-9 h-9" onClick={() => (onBack ? onBack() : navigate(-1))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Link to="/">
            <Button variant="ghost" size="icon" className="rounded-full w-9 h-9">
              <Home className="w-4 h-4" />
            </Button>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <h1 className="text-base font-bold text-foreground">Fan Agent</h1>
        </div>
        <div className="min-w-[72px]" />
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
          <p className="text-lg font-semibold text-foreground">로그인이 필요합니다</p>
          <p className="text-sm text-muted-foreground">Fan Agent를 활성화하려면 로그인해주세요</p>
        </div>
      </div>
    );
  }

  // ── Welcome / Empty state ──
  const renderWelcome = () => (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center mb-4 border border-primary/20">
        <Bot className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-lg font-bold text-foreground mb-1">KTRENZ Fan Agent</h2>
      <p className="text-sm text-muted-foreground text-center max-w-[280px] mb-6">
        실시간 트렌드 데이터를 기반으로 스트리밍 전략, 트렌드 분석, 팬 활동을 도와드립니다
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
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mr-2 mt-1 shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
          )}
          <div
            className={cn(
              "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed",
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-card border border-border/50 text-foreground rounded-bl-md"
            )}
          >
            {msg.role === "assistant" ? (
              <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
                {isStreaming && i === messages.length - 1 && (
                  <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse rounded-sm" />
                )}
              </div>
            ) : (
              msg.content
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

      {/* Chat area */}
      {!hasStarted || messages.length === 0 ? renderWelcome() : renderMessages()}

      {/* Input area */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-border/30">
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
            placeholder="아티스트, 트렌드, 스트리밍에 대해 물어보세요..."
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
