import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Music2, BarChart3, MessageSquare, Headphones, Lock, Send, Bell, ArrowLeft, Home } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const AGENT_FEATURES = [
  { icon: Music2, title: "Streaming Guide", description: "Optimized streaming schedules & playlist tips", requiredLevel: 1, color: "text-green-500" },
  { icon: BarChart3, title: "Trend Analysis", description: "Real-time trend insights & predictions", requiredLevel: 2, color: "text-blue-500" },
  { icon: MessageSquare, title: "Fan Activity", description: "Auto-vote & community engagement", requiredLevel: 3, color: "text-purple-500" },
  { icon: Headphones, title: "Premium Alerts", description: "Comeback, chart & concert alerts", requiredLevel: 4, color: "text-amber-500" },
  { icon: Bot, title: "Full Auto Agent", description: "Autonomous fan activities", requiredLevel: 5, color: "text-primary" },
];

const CHAT_URL = `https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/fan-agent-chat`;

async function streamChat({ message, token, onDelta, onDone }: {
  message: string; token: string; onDelta: (text: string) => void; onDone: () => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  });
  if (!resp.ok) { const err = await resp.json().catch(() => ({ error: "Unknown error" })); throw new Error(err.error || `Error ${resp.status}`); }
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
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { onDone(); return; }
      try { const parsed = JSON.parse(jsonStr); if (parsed.content) onDelta(parsed.content); } catch {}
    }
  }
  onDone();
}

type ChatMessage = { role: "user" | "assistant"; content: string };

interface V3FanAgentProps { onBack?: () => void; }

const V3FanAgent = ({ onBack }: V3FanAgentProps) => {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessages, setStreamingMessages] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: chatHistory } = useQuery({
    queryKey: ["v3-agent-chat", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("v3_agent_chat_messages").select("role, content, created_at")
        .eq("user_id", user.id).order("created_at", { ascending: true }).limit(50);
      if (error) throw error;
      return (data || []) as ChatMessage[];
    },
    enabled: !!user?.id,
  });

  const displayMessages = [...(chatHistory || []), ...streamingMessages];

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [displayMessages.length, streamingMessages]);

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || isStreaming || !session?.access_token) return;
    setChatInput(""); setIsStreaming(true);
    const userMsg: ChatMessage = { role: "user", content: text };
    setStreamingMessages(prev => [...prev, userMsg]);
    let assistantContent = "";
    try {
      await streamChat({
        message: text, token: session.access_token,
        onDelta: (chunk) => {
          assistantContent += chunk;
          setStreamingMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
            return [...prev, { role: "assistant", content: assistantContent }];
          });
        },
        onDone: () => { setIsStreaming(false); setStreamingMessages([]); },
      });
    } catch (e: any) { setIsStreaming(false); toast.error(e.message || "Failed to send message"); setStreamingMessages([]); }
  };

  const renderSubHeader = () => (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between h-14 px-4 max-w-screen-lg mx-auto">
        <div className="flex items-center gap-1 min-w-[72px]">
          <Button variant="ghost" size="icon" className="rounded-full w-9 h-9" onClick={() => onBack ? onBack() : navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Link to="/"><Button variant="ghost" size="icon" className="rounded-full w-9 h-9"><Home className="w-4 h-4" /></Button></Link>
        </div>
        <h1 className="text-base font-bold text-foreground">Fan Agent</h1>
        <div className="min-w-[72px]" />
      </div>
    </header>
  );

  if (!user) {
    return (
      <div className="pt-[calc(3.5rem+env(safe-area-inset-top,0px))]">
        {renderSubHeader()}
        <div className="px-4 py-4 space-y-4">
          <Card className="p-6 text-center bg-card">
            <Bot className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground mb-3">Sign in to activate your fan agent</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] pt-[calc(3.5rem+env(safe-area-inset-top,0px))]">
      {renderSubHeader()}
      <div className="flex-shrink-0 overflow-auto max-h-[45%] px-4 py-4 space-y-3">
        <Card className="p-3 bg-gradient-to-br from-primary/5 via-card to-orange-500/5 border-primary/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl">🤖</div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-foreground">Fan Agent</p>
              <p className="text-xs text-muted-foreground">AI-powered fan activities</p>
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-5 gap-1.5">
          {AGENT_FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-muted/30 opacity-50">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted">
                  <Lock className="w-3 h-3 text-muted-foreground" />
                </div>
                <span className="text-xs text-center text-muted-foreground font-medium leading-tight">{f.title.split(" ")[0]}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-h-0 border-t border-border">
        <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
          {displayMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Bot className="w-12 h-12 text-primary/30 mb-2" />
              <p className="text-base font-medium text-foreground mb-1">Ask your Fan Agent</p>
              <p className="text-sm text-muted-foreground max-w-[260px]">Get streaming tips, trend insights, and fan activity guidance</p>
              <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
                {["📊 Today's rankings?", "🎧 Streaming tips", "🔥 Trending artists"].map((q) => (
                  <button key={q} onClick={() => { setChatInput(q); inputRef.current?.focus(); }}
                    className="text-sm px-3 py-1.5 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">{q}</button>
                ))}
              </div>
            </div>
          ) : displayMessages.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-base leading-relaxed",
                msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md")}>
                {msg.content}
                {isStreaming && i === displayMessages.length - 1 && msg.role === "assistant" && (
                  <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse" />
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="flex-shrink-0 px-4 pb-4 pt-2">
          <div className="flex items-center gap-2 bg-muted rounded-full px-4 py-2">
            <input ref={inputRef} type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Ask your fan agent..."
              className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground outline-none" disabled={isStreaming} />
            <Button size="icon" className="rounded-full w-8 h-8 shrink-0" onClick={handleSend} disabled={!chatInput.trim() || isStreaming}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default V3FanAgent;
