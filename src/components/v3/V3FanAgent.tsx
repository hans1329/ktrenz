import React, { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bot, Send, ArrowLeft, Sparkles, TrendingUp, Music2, Bell, Loader2, BellRing, Camera, Trash2, Heart, MessageCircle, Plus, Crown, Coins, X, ArrowLeftRight, Lock, Newspaper } from "lucide-react";
import { useAgentSlots } from "@/hooks/useAgentSlots";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useLanguage } from "@/contexts/LanguageContext";
import V3StreamingGuideCards from "@/components/v3/V3StreamingGuideCards";
import KPointsPurchaseDrawer from "@/components/v3/KPointsPurchaseDrawer";
import V3RankingCards, { type RankingEntry } from "@/components/v3/V3RankingCards";
import V3InlineLinkCard from "@/components/v3/V3InlineLinkCard";
import V3BriefingCard, { type BriefingData } from "@/components/v3/V3BriefingCard";
import V3ReportCards, { type ReportCard } from "@/components/v3/V3ReportCards";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";

// ── Types ──────────────────────────────────────────────
type QuickActionCard = {
  emoji: string;
  label: string;
  description: string;
  prompt_hint: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  guideData?: any[] | null;
  rankingData?: RankingEntry[] | null;
  briefingData?: BriefingData | null;
  quickActions?: QuickActionCard[] | null;
  followUps?: string[] | null;
  reportCards?: ReportCard[] | null;
};

type AgentMode = "chat" | "trend" | "streaming" | "alert";
type QuickActionKind = "fanActivity" | "liveRankings" | "trendAnalysis" | "streamingGuide" | "newsBriefing" | "alertSettings";
type QuickActionHint = "live_rankings" | "trend_analysis" | "streaming_guide";

interface QuickAction {
  id: QuickActionKind;
  icon: React.ElementType;
  label: string;
  prompt: string;
  mode: AgentMode;
  color: string;
}

const getQuickActions = (t: (key: string) => string): QuickAction[] => [
  { id: "fanActivity", icon: Heart, label: t("agent.fanActivity"), prompt: t("agent.prompt.fanActivity"), mode: "chat", color: "text-pink-400" },
  { id: "liveRankings", icon: TrendingUp, label: t("agent.liveRankings"), prompt: t("agent.prompt.liveRankings"), mode: "trend", color: "text-blue-400" },
  { id: "trendAnalysis", icon: Sparkles, label: t("agent.trendAnalysis"), prompt: t("agent.prompt.trendAnalysis"), mode: "trend", color: "text-purple-400" },
  { id: "streamingGuide", icon: Music2, label: t("agent.streamingGuide"), prompt: t("agent.prompt.streamingGuide"), mode: "streaming", color: "text-green-400" },
  { id: "newsBriefing", icon: Newspaper, label: t("agent.newsBriefing"), prompt: t("agent.prompt.newsBriefing"), mode: "chat", color: "text-cyan-400" },
  { id: "alertSettings", icon: Bell, label: t("agent.alertSettings"), prompt: t("agent.prompt.alertSettings"), mode: "alert", color: "text-amber-400" },
];

const CHAT_URL = `https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-fan-agent`;

// Helper to get display name for a slot with watched artist fallback
function getSlotDisplayName(
  slot: { slot_index: number; artist_name: string | null } | null | undefined,
  watchedArtists: any[] | undefined,
  hasAlertOn: boolean,
): string {
  if (!slot) return "Agent";
  // For slot 0, if name is generic "New Agent", fall back to watched artist
  if (slot.slot_index === 0 && (!slot.artist_name || slot.artist_name === "New Agent")) {
    if (hasAlertOn && watchedArtists && watchedArtists.length > 0) {
      return `${watchedArtists[0].artist_name} Agent`;
    }
  }
  if (slot.artist_name && slot.artist_name !== "New Agent") {
    return `${slot.artist_name} Agent`;
  }
  return "Agent";
}

// ── Avatar Upload Hook (per-slot) ─────────────────────
function useAgentAvatar(
  activeSlot: { id: string; avatar_url: string | null } | null,
  userId?: string,
  fallbackAvatarUrl?: string | null,
) {
  const queryClient = useQueryClient();

  const avatarUrl = activeSlot?.avatar_url ?? fallbackAvatarUrl ?? null;

  const uploadAvatar = useCallback(async (file: File) => {
    if (!userId || !activeSlot?.id) {
      toast.error("Cannot upload: missing user or agent slot");
      return;
    }

    let webpBlob: Blob;
    try {
      webpBlob = await convertToWebp(file);
    } catch (err) {
      console.error("WebP conversion error:", err);
      toast.error("Image conversion failed. Please try a different image.");
      return;
    }

    const filePath = `${userId}/${activeSlot.id}.webp`;

    const { error: uploadErr } = await supabase.storage
      .from("agent-avatars")
      .upload(filePath, webpBlob, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr);
      toast.error("Image upload failed: " + uploadErr.message);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("agent-avatars")
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

    // Update the slot's avatar_url directly
    const { error: dbErr } = await (supabase as any)
      .from("ktrenz_agent_slots")
      .update({ avatar_url: publicUrl })
      .eq("id", activeSlot.id);

    if (dbErr) {
      console.error("DB update error:", dbErr);
      toast.error("Profile save failed: " + dbErr.message);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-slots", userId] });
    toast.success("Agent profile image updated!");
  }, [userId, activeSlot?.id, queryClient]);

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
  agentSlotId,
  quickActionHint,
  onDelta,
  onMeta,
  onStatus,
  onDone,
}: {
  messages: ChatMessage[];
  token: string;
  agentSlotId?: string | null;
  quickActionHint?: QuickActionHint;
  onDelta: (text: string) => void;
  onMeta?: (meta: any) => void;
  onStatus?: (status: string) => void;
  onDone: () => void;
}) {
  // Queue status updates with minimum display time so rapid SSE events don't overwrite each other
  const statusQueue: string[] = [];
  let statusDraining = false;
  const STATUS_MIN_MS = 600;

  function enqueueStatus(status: string) {
    statusQueue.push(status);
    if (!statusDraining) drainStatus();
  }

  function drainStatus() {
    if (statusQueue.length === 0) { statusDraining = false; return; }
    statusDraining = true;
    const next = statusQueue.shift()!;
    onStatus?.(next);
    setTimeout(() => drainStatus(), STATUS_MIN_MS);
  }
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      language: (window as any).__ktrenz_lang || "ko",
      agent_slot_id: agentSlotId ?? null,
      quick_action: quickActionHint ?? null,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Unknown error" }));
    if (resp.status === 429 && err.error === "daily_limit_exceeded") {
      throw new Error("LIMIT_EXCEEDED");
    }
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
      // Check for status event (step-by-step progress)
      if (parsed.status && onStatus) {
        enqueueStatus(parsed.status);
        return false;
      }
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
const AgentAvatar = forwardRef<HTMLDivElement, {
  avatarUrl: string | null | undefined;
  size?: "sm" | "lg";
}>(({ avatarUrl, size = "sm" }, ref) => {
  const sizeClasses = size === "lg"
    ? "w-10 h-10 rounded-xl"
    : "w-9 h-9 rounded-xl";

  return (
    <div
      ref={ref}
      className={cn(
        sizeClasses,
        "relative overflow-hidden shrink-0 flex items-center justify-center",
        "bg-primary/10 border border-primary/20",
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="Agent" className="w-full h-full object-cover" />
      ) : (
        <Bot className={cn("text-primary", size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5")} />
      )}
    </div>
  );
});

AgentAvatar.displayName = "AgentAvatar";

// Inline number highlighter for chat text
function highlightNumbers(text: string): React.ReactNode[] {
  const pattern = /((?:[+\-]\d[\d,]*\.?\d*%)|(?:\d[\d,]*\.?\d*%)|(?:#\d+(?:위)?)|(?:\d[\d,]*\.?\d*(?:점|위|P|p))|(?:(?:^|(?<=\s|：|:))\d[\d,]*\.?\d*(?=$|\s|,|!|\.|\)|、|，)))/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const val = match[0];
    const isPositive = val.startsWith("+") || (val.includes("%") && !val.startsWith("-") && parseFloat(val) > 0);
    const isNegative = val.startsWith("-");
    const isRank = val.startsWith("#");
    let cls = "inline-flex items-center px-1 py-0.5 rounded font-bold text-[13px] ";
    if (isPositive) cls += "bg-emerald-500/15 text-emerald-400";
    else if (isNegative) cls += "bg-red-500/15 text-red-400";
    else if (isRank) cls += "bg-amber-500/15 text-amber-400";
    else cls += "bg-primary/10 text-primary";
    parts.push(<span key={match.index} className={cls}>{val}</span>);
    lastIndex = match.index + val.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

const MarkdownText = ({ children }: { children: React.ReactNode }) => {
  if (typeof children === "string") return <>{highlightNumbers(children)}</>;
  if (Array.isArray(children)) {
    return <>{children.map((child, i) =>
      typeof child === "string" ? <React.Fragment key={i}>{highlightNumbers(child)}</React.Fragment> : child
    )}</>;
  }
  return <>{children}</>;
};

// Section-aware emoji map for card headers
const SECTION_EMOJI_MAP: Record<string, string> = {
  energy: "⚡", 에너지: "⚡", 점수: "⚡",
  youtube: "▶️", 유튜브: "▶️",
  buzz: "💬", 버즈: "💬", sns: "💬",
  music: "🎵", 뮤직: "🎵", 음악: "🎵", 차트: "🎵",
  album: "💿", 앨범: "💿", 판매: "💿",
  competition: "⚔️", 경쟁: "⚔️", 비교: "⚔️", 아티스트: "🎤",
  ranking: "🏆", 순위: "🏆", 랭킹: "🏆",
  strategy: "🎯", 전략: "🎯", 추천: "💡", 분석: "📊",
  summary: "📋", 요약: "📋", 결론: "✅", 팬: "💜",
};

function getSectionEmoji(title: string): string {
  const lower = title.toLowerCase();
  for (const [keyword, emoji] of Object.entries(SECTION_EMOJI_MAP)) {
    if (lower.includes(keyword)) return emoji;
  }
  return "📌";
}

// Split markdown content into intro + section cards
function splitIntoSections(content: string): { intro: string; sections: { title: string; body: string }[] } {
  // Match section headers: "## Title", "### Title", or "**Title:**" at start of line
  const sectionPattern = /(?:^|\n)(?:#{2,3}\s+(.+)|(?:\*\*(.+?)[:：]\*\*))/g;
  const matches = [...content.matchAll(sectionPattern)];

  if (matches.length < 2) {
    // Not enough sections to card-ify
    return { intro: content, sections: [] };
  }

  const intro = content.slice(0, matches[0].index).trim();
  const sections: { title: string; body: string }[] = [];

  for (let i = 0; i < matches.length; i++) {
    const title = (matches[i][1] || matches[i][2] || "").trim();
    const startIdx = (matches[i].index ?? 0) + matches[i][0].length;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const body = content.slice(startIdx, endIdx).trim();
    if (title) sections.push({ title, body });
  }

  return { intro, sections };
}

// Section card markdown renderer
const SectionCards = ({ content, isLastStreaming }: { content: string; isLastStreaming: boolean }) => {
  const { intro, sections } = splitIntoSections(content);

  const mdComponents = {
    a: MarkdownLink,
    p: ({ children }: any) => <p><MarkdownText>{children}</MarkdownText></p>,
    li: ({ children }: any) => <li><MarkdownText>{children}</MarkdownText></li>,
    strong: ({ children }: any) => <strong><MarkdownText>{children}</MarkdownText></strong>,
    img: ({ src, alt }: any) => (
      <img src={src} alt={alt || ""} className="rounded-lg max-w-full my-1.5 border border-border/20" loading="lazy" />
    ),
  };

  if (sections.length === 0) {
    // No sections — render normally
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none overflow-hidden break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 text-foreground">
        <ReactMarkdown components={mdComponents}>{content}</ReactMarkdown>
        {isLastStreaming && <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse rounded-sm" />}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Intro text */}
      {intro && (
        <div className="prose prose-sm dark:prose-invert max-w-none overflow-hidden break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 text-foreground">
          <ReactMarkdown components={mdComponents}>{intro}</ReactMarkdown>
        </div>
      )}

      {/* Section cards */}
      {sections.map((section, idx) => (
        <div key={idx} className="rounded-xl border border-border/40 bg-secondary/30 p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{getSectionEmoji(section.title)}</span>
            <span className="text-[13px] font-bold text-foreground">{section.title}</span>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none overflow-hidden break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-0.5 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_li]:my-0 text-foreground/80 text-[13px] leading-relaxed">
            <ReactMarkdown components={mdComponents}>{section.body}</ReactMarkdown>
          </div>
        </div>
      ))}

      {isLastStreaming && <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse rounded-sm" />}
    </div>
  );
};

const MarkdownLink = forwardRef<HTMLAnchorElement, any>(({ href, children }, ref) => {
  if (!href) return <a ref={ref}>{children}</a>;
  return <V3InlineLinkCard ref={ref} href={href}>{children}</V3InlineLinkCard>;
});

MarkdownLink.displayName = "MarkdownLink";

// ── Component ──────────────────────────────────────────
interface V3FanAgentProps {
  onBack?: () => void;
}

const V3FanAgent = ({ onBack }: V3FanAgentProps) => {
  const navigate = useNavigate();
  const { user, session, kPoints } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const QUICK_ACTIONS = getQuickActions(t);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { slots, slotsLoading, slotLimit, activeSlot, canAddSlot, canPurchaseSlot, switchSlot, createSlot, purchaseSlot, deleteSlot } = useAgentSlots();
  const { data: legacyAgentAvatarUrl } = useQuery({
    queryKey: ["ktrenz-agent-legacy-avatar", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await (supabase as any)
        .from("ktrenz_agent_profiles")
        .select("avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.avatar_url ?? null;
    },
    enabled: !!user?.id,
  });
  const activeSlotFallbackAvatar = activeSlot?.slot_index === 0 ? legacyAgentAvatarUrl ?? null : null;
  const { avatarUrl, uploadAvatar } = useAgentAvatar(activeSlot, user?.id, activeSlotFallbackAvatar);
  const [briefingTriggered, setBriefingTriggered] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [streamingStatus, setStreamingStatus] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showPointPurchaseDialog, setShowPointPurchaseDialog] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [pendingPurchaseText, setPendingPurchaseText] = useState<string | null>(null);
  const [isPurchasingSlot, setIsPurchasingSlot] = useState(false);
  const [showAddAgentDialog, setShowAddAgentDialog] = useState(false);
  const [showSlotList, setShowSlotList] = useState(false);
  const [showAgentProfileModal, setShowAgentProfileModal] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [showKPointsDrawer, setShowKPointsDrawer] = useState(false);
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

  // Agent daily usage
  const { data: agentUsage, refetch: refetchUsage } = useQuery({
    queryKey: ["ktrenz-agent-usage", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.rpc("ktrenz_get_agent_usage" as any, { _user_id: user.id });
      return data as { used: number; daily_limit: number; remaining: number; tier: string } | null;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 30,
  });

  const hasAlertOn = (watchedArtists?.length ?? 0) > 0;
  // Bias registration is determined by the active slot having a wiki_entry_id
  const hasBiasRegistered = !!activeSlot?.wiki_entry_id;

  const { data: chatHistory, isLoading: isChatHistoryLoading } = useQuery({
    queryKey: ["ktrenz-agent-chat", user?.id, activeSlot?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const queryBuilder = (supabase as any)
        .from("ktrenz_fan_agent_messages")
        .select("role, content, created_at, metadata")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(50);
      if (activeSlot?.id) {
        if (activeSlot.slot_index === 0) {
          queryBuilder.or(`agent_slot_id.eq.${activeSlot.id},agent_slot_id.is.null`);
        } else {
          queryBuilder.eq("agent_slot_id", activeSlot.id);
        }
      }
      const { data, error } = await queryBuilder;
      if (error) {
        console.warn("Chat history load failed:", error.message);
        return [];
      }
      return (data || []).map((d: any) => ({
        role: d.role as "user" | "assistant",
        content: d.content,
        timestamp: d.created_at,
        rankingData: d.metadata?.rankingData ?? null,
        guideData: d.metadata?.guideData ?? null,
        reportCards: d.metadata?.reportCards ?? null,
      }));
    },
    enabled: !!user?.id && !slotsLoading,
    staleTime: 1000 * 10,
    refetchOnWindowFocus: true,
  });

  const shouldShowWelcome = !slotsLoading && !isChatHistoryLoading && !hasStarted && messages.length === 0 && (chatHistory?.length ?? 0) === 0;

  // Auto-create default slot if user has none
  const autoCreatingRef = useRef(false);
  useEffect(() => {
    if (user?.id && slots.length === 0 && !slotsLoading && !autoCreatingRef.current && slotLimit) {
      autoCreatingRef.current = true;
      createSlot("New Agent").finally(() => {
        autoCreatingRef.current = false;
      });
    }
  }, [user?.id, slots.length, slotsLoading, slotLimit, createSlot]);

  // Reset chat state when active slot changes
  const prevSlotIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevSlotIdRef.current !== undefined && prevSlotIdRef.current !== activeSlot?.id) {
      setMessages([]);
      setHasStarted(false);
      setWelcomeSent(false);
      setBriefingTriggered(false);
    }
    prevSlotIdRef.current = activeSlot?.id ?? null;
  }, [activeSlot?.id]);

  useEffect(() => {
    if (chatHistory && chatHistory.length > 0 && !hasStarted) {
      setMessages(chatHistory);
      setHasStarted(true);
    }
  }, [chatHistory, hasStarted]);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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
      !hasBiasRegistered &&
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
  }, [user?.id, watchedArtists, hasBiasRegistered, welcomeSent, isStreaming, chatHistory]);

  // --- AI Prediction Card seed message pickup ---
  useEffect(() => {
    if (!activeSlot?.wiki_entry_id || isStreaming) return;
    try {
      const raw = localStorage.getItem("ktrenz_agent_seed");
      if (!raw) return;
      const seed = JSON.parse(raw);
      // Only use if fresh (< 5 min) and not consumed yet
      if (!seed?.message || Date.now() - seed.createdAt > 5 * 60_000) {
        localStorage.removeItem("ktrenz_agent_seed");
        return;
      }
      localStorage.removeItem("ktrenz_agent_seed");
      // Auto-send the seed as a user question about this artist
      const prompt = `${seed.artistName}: ${seed.message}`;
      setTimeout(() => handleSend(prompt), 500);
    } catch {
      localStorage.removeItem("ktrenz_agent_seed");
    }
  }, [activeSlot?.wiki_entry_id]);

  // --- 관심 아티스트 등록 시 에이전트 슬롯 이름/이미지 동기화 & 프로필 메뉴 열기 ---
  const prevWatchedCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!watchedArtists || !activeSlot || !user?.id) return;
    const prevCount = prevWatchedCountRef.current;
    prevWatchedCountRef.current = watchedArtists.length;
    if (prevCount === null || watchedArtists.length <= prevCount) return;
    const latestArtist = watchedArtists[watchedArtists.length - 1];
    if (!latestArtist) return;
    const syncSlotWithArtist = async () => {
      const updatePayload: Record<string, any> = { artist_name: latestArtist.artist_name };
      if (latestArtist.wiki_entry_id) {
        updatePayload.wiki_entry_id = latestArtist.wiki_entry_id;
        const { data: wiki } = await supabase
          .from("wiki_entries")
          .select("image_url")
          .eq("id", latestArtist.wiki_entry_id)
          .single();
        if (wiki?.image_url) updatePayload.avatar_url = wiki.image_url;
      }
      await (supabase as any)
        .from("ktrenz_agent_slots")
        .update(updatePayload)
        .eq("id", activeSlot.id);
      queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-slots", user.id] });
      setShowMenu(true);
    };
    syncSlotWithArtist();
  }, [watchedArtists, activeSlot?.id, user?.id, queryClient]);

  useEffect(() => {
    if (hasAlertOn && session?.access_token && !briefingTriggered && !isStreaming) {
      setBriefingTriggered(true);
      // 약간의 딜레이 후 브리핑 (채팅 히스토리 로드 후)
      const timer = setTimeout(() => fetchBriefing(), 1000);
      return () => clearTimeout(timer);
    }
  }, [hasAlertOn, session?.access_token, briefingTriggered, isStreaming, fetchBriefing]);

  // --- 알림 ON일 때 하루 1회 최신 뉴스 자동 전달 ---
  const [dailyNewsSent, setDailyNewsSent] = useState(false);
  useEffect(() => {
    if (!hasAlertOn || !activeSlot?.wiki_entry_id || !user?.id || dailyNewsSent || isStreaming) return;
    const today = new Date().toISOString().slice(0, 10);
    const seenKey = `ktrenz-daily-news-seen-${user.id}`;
    if (localStorage.getItem(seenKey) === today) return;

    setDailyNewsSent(true);
    // Fetch latest news snapshot for the bias artist
    (async () => {
      try {
        const { data: snapshots } = await (supabase as any)
          .from("ktrenz_data_snapshots")
          .select("raw_response, collected_at")
          .eq("wiki_entry_id", activeSlot.wiki_entry_id)
          .eq("platform", "naver_news")
          .order("collected_at", { ascending: false })
          .limit(1);

        const snapshot = snapshots?.[0];
        if (!snapshot?.raw_response) return;

        const topItems = snapshot.raw_response?.top_items ?? snapshot.raw_response?.items ?? [];
        if (topItems.length === 0) return;

        // Pick the first news item
        const newsItem = topItems[0];
        const title = (newsItem.title || "").replace(/<[^>]*>/g, "").replace(/\[.*?\]/g, "").trim();
        const link = newsItem.link || newsItem.originallink || "";
        const desc = (newsItem.description || "").replace(/<[^>]*>/g, "").trim();

        if (!title) return;

        const newsMsg: ChatMessage = {
          role: "assistant",
          content: t("agent.dailyNewsIntro").replace("{artist}", activeSlot.artist_name || "") +
            `\n\n📰 **${title}**\n${desc ? desc.slice(0, 100) + "..." : ""}` +
            (link ? `\n\n🔗 [${t("agent.readMore")}](${link})` : ""),
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, newsMsg]);
        setHasStarted(true);

        // Mark as seen
        localStorage.setItem(seenKey, today);
        queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-has-unread", user.id] });
      } catch (e) {
        console.error("Daily news fetch error:", e);
      }
    })();
  }, [hasAlertOn, activeSlot?.wiki_entry_id, activeSlot?.artist_name, user?.id, dailyNewsSent, isStreaming, queryClient, t]);

  // Guide/Ranking data fetching removed — now handled via tool calling in the edge function

  const track = useTrackEvent();
  const handleSend = useCallback(async (
    overrideText?: string,
    bypassPurchaseConfirm = false,
    quickActionHint?: QuickActionHint
  ) => {
    const text = (overrideText || chatInput).trim();
    if (!text || isStreaming || !session?.access_token) return;

    if (!bypassPurchaseConfirm && (agentUsage?.remaining ?? 0) === 0) {
      setPendingPurchaseText(text);
      setShowPointPurchaseDialog(true);
      return;
    }

    track("agent_chat", { mode: "chat" });
    setChatInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
    setIsStreaming(true);
    setStreamingStatus(t("agent.status.thinking")); // initial status until server sends real-time updates
    setHasStarted(true);

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date().toISOString() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    requestAnimationFrame(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }));

    let assistantContent = "";

    try {
      await streamChat({
        messages: updatedMessages,
        token: session.access_token,
        agentSlotId: activeSlot?.id,
        quickActionHint,
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
        onStatus: (status) => setStreamingStatus(status),
        onMeta: (meta) => {
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx]?.role === "assistant") {
              return prev.map((m, i) =>
                i === lastIdx ? {
                  ...m,
                  guideData: meta.guideData ?? m.guideData,
                  rankingData: meta.rankingData ?? m.rankingData,
                  quickActions: meta.quickActions ?? m.quickActions,
                  followUps: meta.followUps ?? m.followUps,
                  reportCards: meta.reportCards ?? m.reportCards,
                } : m
              );
            }
            return prev;
          });
        },
        onDone: async () => {
          setIsStreaming(false);
          setStreamingStatus("");
          // Await invalidation to ensure fresh data before next render
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["ktrenz-watched-artists", user?.id] }),
            queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-slots", user?.id] }),
            queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-chat", user?.id, activeSlot?.id] }),
          ]);
          refetchUsage();
        },
      });
    } catch (e: any) {
      setIsStreaming(false);
      setStreamingStatus("");
      if (e.message === "LIMIT_EXCEEDED") {
        toast.error(t("agent.limitExceeded"));
      } else {
        toast.error(e.message || "Failed to send message");
      }
      setMessages((prev) => prev.slice(0, -1));
    }
  }, [chatInput, isStreaming, session, messages, user?.id, activeSlot?.id, queryClient, refetchUsage, agentUsage, t]);

  const handleBundlePurchase = useCallback(async (bundle: number) => {
    if (!user?.id || isPurchasing) return;
    setIsPurchasing(true);
    try {
      const { data, error } = await supabase.rpc("ktrenz_purchase_agent_messages" as any, {
        _user_id: user.id,
        _bundle: bundle,
      });
      if (error) throw error;
      if (data && !data.success) {
        if (data.reason === "insufficient_points") {
          toast.error(t("agent.insufficientPoints"));
        } else {
          toast.error("구매에 실패했습니다.");
        }
        return;
      }
      toast.success(`${bundle}${t("agent.purchaseSuccess")}`);
      await refetchUsage();
      // 대기 중인 메시지가 있으면 바로 전송
      if (pendingPurchaseText) {
        const textToSend = pendingPurchaseText;
        setShowPointPurchaseDialog(false);
        setPendingPurchaseText(null);
        setTimeout(() => handleSend(textToSend, true), 100);
      } else {
        setShowPointPurchaseDialog(false);
      }
    } catch (e: any) {
      toast.error(e.message || "Purchase failed");
    } finally {
      setIsPurchasing(false);
    }
  }, [user?.id, isPurchasing, pendingPurchaseText, handleSend, refetchUsage, t]);

  const handleQuickAction = (action: QuickAction) => {
    const hintMap: Partial<Record<QuickActionKind, QuickActionHint>> = {
      liveRankings: "live_rankings",
      trendAnalysis: "trend_analysis",
      streamingGuide: "streaming_guide",
    };
    handleSend(action.prompt, false, hintMap[action.id]);
  };

  // ── Sub-header ──
  const handleClearChat = useCallback(async () => {
    if (!user?.id || !session?.access_token || isClearing) return;
    setIsClearing(true);

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ mode: "clear_chat", agent_slot_id: activeSlot?.id ?? null }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Failed to clear chat" }));
        throw new Error(err.error || "Failed to clear chat");
      }

      setMessages([]);
      setHasStarted(false);
      setWelcomeSent(false);
      setBriefingTriggered(false);
      queryClient.setQueryData(["ktrenz-agent-chat", user.id, activeSlot?.id], []);
      queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-chat", user.id, activeSlot?.id] });
      toast.success(t("agent.chatCleared"));
    } catch (e: any) {
      toast.error(e?.message || "Failed to clear chat");
    } finally {
      setIsClearing(false);
    }
  }, [user?.id, session?.access_token, activeSlot?.id, queryClient, t, isClearing]);

  const renderSubHeader = () => (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Left: back + usage */}
        <div className="flex items-center gap-1.5 min-w-[72px]">
          <Button variant="ghost" size="icon" className="rounded-full w-9 h-9" onClick={() => (onBack ? onBack() : navigate(-1))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>

        {/* Center: avatar (popover trigger) + name */}
        <Popover
          modal={false}
          open={showMenu}
          onOpenChange={(open) => {
            setShowMenu(open);
            if (!open) setShowSlotList(false);
          }}
        >
          <PopoverTrigger asChild>
            <button type="button" className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
              <AgentAvatar avatarUrl={avatarUrl} size="lg" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-60 p-1.5 rounded-xl" sideOffset={8}>
            {/* Active agent row + swap button */}
            <div className="px-1 pb-1 border-b border-border/50 mb-1">
              <div className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg bg-primary/10 text-foreground">
                <AgentAvatar avatarUrl={avatarUrl} size="sm" />
                <span className="truncate flex-1 text-left text-sm font-medium">
                  {getSlotDisplayName(activeSlot, watchedArtists, hasAlertOn)}
                </span>
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowSlotList((prev) => !prev)}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors"
                    title={t("agent.manageAgents")}
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    <span className="sr-only">{t("agent.manageAgents")}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Agent slots (swap list) */}
            {showSlotList && (
              <div className="px-1 pb-1 space-y-0.5 border-b border-border/50 mb-1">
                {slots
                  .filter((slot) => !slot.is_active)
                  .map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => {
                        switchSlot(slot.id);
                        setShowMenu(false);
                        setShowSlotList(false);
                        setMessages([]);
                        setHasStarted(false);
                        setWelcomeSent(false);
                        setBriefingTriggered(false);
                      }}
                      className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-sm transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <AgentAvatar avatarUrl={slot.avatar_url ?? (slot.slot_index === 0 ? legacyAgentAvatarUrl : null)} size="sm" />
                      <span className="truncate flex-1 text-left">{getSlotDisplayName(slot, watchedArtists, hasAlertOn)}</span>
                    </button>
                  ))}
              </div>
            )}

            {/* Menu items */}
            <button
              type="button"
              onClick={() => { setShowMenu(false); avatarFileRef.current?.click(); }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Camera className="w-4 h-4 text-muted-foreground" />
              {t("agent.changePhoto")}
            </button>

            {/* Alert toggle */}
            <button
              type="button"
              onClick={async () => {
                setShowMenu(false);
                if (!hasAlertOn) {
                  if (activeSlot?.wiki_entry_id && activeSlot?.artist_name && user?.id) {
                    // Delete existing then insert fresh to avoid conflict issues
                    await supabase
                      .from("ktrenz_watched_artists")
                      .delete()
                      .eq("user_id", user.id);
                    await supabase
                      .from("ktrenz_watched_artists")
                      .insert({
                        user_id: user.id,
                        artist_name: activeSlot.artist_name,
                        wiki_entry_id: activeSlot.wiki_entry_id,
                      });
                    queryClient.invalidateQueries({ queryKey: ["ktrenz-watched-artists", user.id] });
                    // Mark daily news as pending for red dot
                    localStorage.removeItem(`ktrenz-daily-news-seen-${user.id}`);
                    queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-has-unread", user.id] });
                    // Add confirmation message from agent
                    const confirmMsg: ChatMessage = {
                      role: "assistant",
                      content: t("agent.alertsOnMessage").replace("{artist}", activeSlot.artist_name),
                      timestamp: new Date().toISOString(),
                    };
                    setMessages((prev) => [...prev, confirmMsg]);
                    setHasStarted(true);
                  } else {
                    handleSend(t("agent.prompt.alertSetup"));
                  }
                } else if (user?.id) {
                  await supabase
                    .from("ktrenz_watched_artists")
                    .delete()
                    .eq("user_id", user.id);
                  queryClient.invalidateQueries({ queryKey: ["ktrenz-watched-artists", user.id] });
                  const offMsg: ChatMessage = {
                    role: "assistant",
                    content: t("agent.alertsOffMessage"),
                    timestamp: new Date().toISOString(),
                  };
                  setMessages((prev) => [...prev, offMsg]);
                }
              }}
              className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Bell className="w-4 h-4 text-muted-foreground" />
                <span>{t("agent.alertSettings")}</span>
              </div>
              <div className={cn(
                "w-8 h-4.5 rounded-full flex items-center px-0.5 transition-colors",
                hasAlertOn ? "bg-primary justify-end" : "bg-muted-foreground/30 justify-start"
              )}>
                <div className="w-3.5 h-3.5 rounded-full bg-background shadow-sm" />
              </div>
            </button>

            {/* Buy K-Points */}
            <button
              type="button"
              onClick={() => { setShowMenu(false); setShowKPointsDrawer(true); }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Coins className="w-4 h-4 text-amber-500" />
              {t("points.buyPoints")}
            </button>

            {/* Clear chat */}
            {hasStarted && messages.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {t("agent.clearChat")}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("agent.clearChatConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("agent.clearChatConfirmDesc")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("agent.clearChatCancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => { setShowMenu(false); handleClearChat(); }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isClearing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                      {t("agent.clearChatConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Add Agent button under clear chat */}
            <div className="border-t border-border/50 mt-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  setShowAddAgentDialog(true);
                }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                {t("agent.addAgent")}
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Right: usage indicator */}
        <div className="min-w-[72px] flex justify-end">
          {agentUsage && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/80 text-xs font-medium text-muted-foreground">
              <MessageCircle className="w-3 h-3" />
              <span className={cn(
                agentUsage.remaining <= 5 && agentUsage.remaining > 0 && "text-amber-500",
                agentUsage.remaining === 0 && "text-destructive"
              )}>
                {agentUsage.remaining}/{agentUsage.daily_limit}
              </span>
            </div>
          )}
        </div>

        {/* Hidden file input for avatar upload */}
        <input
          ref={avatarFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadAvatar(f);
            e.target.value = "";
          }}
        />
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
      <AgentAvatar avatarUrl={avatarUrl} size="lg" />
      <h2 className="text-lg font-bold text-foreground mb-1 mt-4">KTRENZ {t("agent.title")}</h2>
      <p className="text-sm text-muted-foreground text-center max-w-[280px] mb-6">
        {t("agent.subtitle")}
      </p>

      {/* Register bias artist — prominent CTA */}
      <button
        onClick={() => handleSend(t("agent.prompt.alertSetup"))}
        disabled={isStreaming}
        className="w-full max-w-sm mb-3 flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/30 hover:border-primary/50 hover:from-primary/20 hover:to-primary/10 transition-all text-left group active:scale-[0.98]"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
          <Heart className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-foreground">{t("agent.registerBias")}</div>
          <div className="text-[12px] text-muted-foreground leading-tight">{t("agent.registerBiasDesc")}</div>
        </div>
        <Sparkles className="w-4 h-4 text-primary/50 group-hover:text-primary/80 transition-colors shrink-0" />
      </button>

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
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-3 max-w-[800px] mx-auto w-full scrollbar-hide">
      {messages.map((msg, i) => (
        <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
          {msg.role === "assistant" && (
            <button type="button" onClick={() => setShowAgentProfileModal(true)} className="shrink-0 hover:opacity-80 transition-opacity">
              <AgentAvatar avatarUrl={avatarUrl} size="sm" />
            </button>
          )}
          <div className={cn("flex flex-col max-w-[85%] min-w-0", msg.role === "user" ? "items-end" : "items-start", msg.role === "assistant" && "ml-2")}>
            <div
              className={cn(
                "rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed",
                msg.role === "user"
                  ? "bg-gradient-to-br from-primary/25 to-purple-500/20 text-foreground rounded-br-md"
                  : "bg-card/60 border border-border/30 text-muted-foreground rounded-bl-md"
              )}
            >
              {msg.role === "assistant" ? (
                <SectionCards content={msg.content} isLastStreaming={isStreaming && i === messages.length - 1} />
              ) : (
                msg.content
              )}
            </div>

            {msg.role === "assistant" && msg.briefingData && (
              <V3BriefingCard data={msg.briefingData} />
            )}

            {msg.role === "assistant" && msg.reportCards && msg.reportCards.length > 0 && (
              <V3ReportCards cards={msg.reportCards} />
            )}

            {msg.role === "assistant" && msg.rankingData && msg.rankingData.length > 0 && (
              <V3RankingCards rankings={msg.rankingData} />
            )}

            {msg.role === "assistant" && msg.guideData && msg.guideData.length > 0 && (
              <V3StreamingGuideCards guides={msg.guideData} />
            )}

            {msg.role === "assistant" && msg.quickActions && msg.quickActions.length > 0 && (
              <div className="grid grid-cols-1 gap-2 mt-2 w-full">
                {msg.quickActions.map((qa) => {
                  const promptMap: Record<string, string> = {
                    fan_activity: t("agent.prompt.fanActivity"),
                    rankings: t("agent.prompt.liveRankings"),
                    streaming: t("agent.prompt.streamingGuide"),
                    news: t("agent.prompt.newsBriefing"),
                  };
                  return (
                    <button
                      key={qa.prompt_hint}
                      type="button"
                      disabled={isStreaming}
                      onClick={() => handleSend(promptMap[qa.prompt_hint] || qa.label)}
                      className="flex items-center gap-3 w-full px-3.5 py-3 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/40 hover:from-primary/15 hover:to-primary/10 transition-all text-left group active:scale-[0.98]"
                    >
                      <span className="text-xl shrink-0">{qa.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground">{qa.label}</div>
                        <div className="text-[12px] text-muted-foreground leading-tight">{qa.description}</div>
                      </div>
                      <Sparkles className="w-3.5 h-3.5 text-primary/40 group-hover:text-primary/70 transition-colors shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Follow-up suggestion cards */}
            {msg.role === "assistant" && msg.followUps && msg.followUps.length > 0 && !isStreaming && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {msg.followUps.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(suggestion)}
                    className="px-3 py-1.5 rounded-full text-[13px] font-medium border border-primary/25 bg-primary/5 text-primary hover:bg-primary/15 hover:border-primary/40 transition-all active:scale-[0.97]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {msg.timestamp && (
              <span className="text-[10px] text-muted-foreground/40 mt-0.5 px-1">
                {new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      ))}

      {/* Rainbow progress bar while waiting for agent response */}
      {isStreaming && messages.length > 0 && messages[messages.length - 1].role === "user" && (
         <div className="flex justify-start">
          <AgentAvatar avatarUrl={avatarUrl} size="sm" />
          <div className="ml-2 flex flex-col gap-1.5">
            <div className="w-48 rounded-2xl px-3.5 py-3 bg-card/60 border border-border/30 rounded-bl-md">
              <div className="h-1.5 w-full rounded-full overflow-hidden bg-muted/50">
                <div className="h-full w-full rounded-full bg-gradient-to-r from-red-500 via-yellow-400 via-green-400 via-blue-500 to-purple-500 animate-rainbow-slide" />
              </div>
            </div>
            {streamingStatus && (
              <span className="text-[11px] text-muted-foreground px-1 animate-pulse">
                {streamingStatus}
              </span>
            )}
          </div>
        </div>
      )}

      <div ref={chatEndRef} />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {renderSubHeader()}

      {slotsLoading || isChatHistoryLoading ? null : (shouldShowWelcome ? renderWelcome() : renderMessages())}

      <Drawer open={showPointPurchaseDialog} onOpenChange={(open) => {
        setShowPointPurchaseDialog(open);
        if (!open) setPendingPurchaseText(null);
      }}>
        <DrawerContent className="mx-4 mb-4 rounded-2xl bg-background border-border md:max-w-sm md:mx-auto">
          <DrawerHeader className="pb-1">
            <DrawerTitle>{t("agent.pointPurchaseTitle")}</DrawerTitle>
            <DrawerDescription asChild>
              <div className="space-y-1.5">
                <p>{t("agent.pointPurchaseLine1")}</p>
                
                <p className="text-[#2dd4bf] font-semibold">
                  {t("agent.pointPurchaseBalance")}: {kPoints.toLocaleString()}P
                </p>
              </div>
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-2 px-4 py-2">
            {[5, 10, 20].map((bundle) => (
              <button
                key={bundle}
                disabled={isPurchasing}
                onClick={() => handleBundlePurchase(bundle)}
                className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">{bundle}{t("agent.bundleMessages")}</span>
                  <span className="text-xs text-muted-foreground">{bundle * 5}P</span>
                </div>
                <span className="text-xs font-medium text-primary">{t("agent.bundleBuy")}</span>
              </button>
            ))}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline" disabled={isPurchasing}>{t("agent.clearChatCancel")}</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Add Agent Dialog */}
      <Dialog open={showAddAgentDialog} onOpenChange={setShowAddAgentDialog}>
        <DialogContent className="mx-4 rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("agent.addAgent")}</DialogTitle>
            <DialogDescription>{t("agent.addAgentDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Visual slot grid */}
            {slotLimit && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground px-1">{t("agent.currentSlots")}</p>
                <div className="flex flex-wrap gap-2 px-1">
                  {Array.from({ length: slotLimit.total_slots }).map((_, i) => {
                    const slot = slots[i];
                    const isActive = slot?.id === activeSlot?.id;
                    if (slot) {
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => {
                            if (!isActive) {
                              switchSlot(slot.id);
                              setShowAddAgentDialog(false);
                              setMessages([]);
                              setHasStarted(false);
                              setWelcomeSent(false);
                              setBriefingTriggered(false);
                            }
                          }}
                          className={cn(
                            "w-14 h-14 rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all",
                            isActive
                              ? "border-primary bg-primary/10 shadow-sm"
                              : "border-border hover:border-primary/40 bg-card"
                          )}
                        >
                          <div className="w-7 h-7 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                            {(slot.avatar_url || (slot.slot_index === 0 && legacyAgentAvatarUrl)) ? (
                              <img src={slot.avatar_url || legacyAgentAvatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <span className="text-[9px] leading-tight text-muted-foreground truncate max-w-[48px]">
                            {getSlotDisplayName(slot, watchedArtists, hasAlertOn).replace(" Agent", "")}
                          </span>
                        </button>
                      );
                    }
                    // Empty available slot (purchased but unused) — orange plus
                    return (
                      <div
                        key={`empty-${i}`}
                        className="w-14 h-14 rounded-xl border-2 border-dashed border-orange-400/60 flex items-center justify-center bg-orange-50/30 dark:bg-orange-950/20"
                      >
                        <Plus className="w-4 h-4 text-orange-500" />
                      </div>
                    );
                  })}
                  {/* Next locked slot — not yet purchased */}
                  {canPurchaseSlot && (
                    <div className="w-14 h-14 rounded-xl border-2 border-dashed border-border/30 flex items-center justify-center bg-muted/30 opacity-60">
                      <Lock className="w-4 h-4 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {canAddSlot ? (
              <Button
                className="w-full rounded-xl h-11"
                onClick={async () => {
                  setShowAddAgentDialog(false);
                  const newSlot = await createSlot("New Agent");
                  if (newSlot) {
                    setMessages([]);
                    setHasStarted(false);
                    setWelcomeSent(false);
                    setBriefingTriggered(false);
                    const promptMsg: ChatMessage = {
                      role: "assistant",
                      content: t("agent.newAgentPrompt"),
                      timestamp: new Date().toISOString(),
                    };
                    setTimeout(() => {
                      setMessages([promptMsg]);
                      setHasStarted(true);
                    }, 100);
                  }
                }}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                {t("agent.addNewAgent")}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center">{t("agent.slotsFull")}</p>
                <Button
                  variant="outline"
                  className="w-full rounded-xl h-11 gap-2"
                  onClick={async () => {
                    setIsPurchasingSlot(true);
                    await purchaseSlot();
                    setIsPurchasingSlot(false);
                  }}
                  disabled={isPurchasingSlot}
                >
                  {isPurchasingSlot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4 text-amber-500" />}
                  {t("agent.purchaseSlot")}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full rounded-xl h-10 gap-2 text-sm"
                  onClick={() => { setShowAddAgentDialog(false); navigate("/k-pass"); }}
                >
                  <Crown className="w-4 h-4 text-primary" />
                  {t("agent.upgradeForSlots")}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <KPointsPurchaseDrawer open={showKPointsDrawer} onOpenChange={setShowKPointsDrawer} />

      {/* Input area */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-border/30 max-w-screen-lg mx-auto w-full">
        {hasStarted && messages.length > 0 && !isStreaming && (
          <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-hide pb-1">
            {!hasBiasRegistered && (
              <button
                onClick={() => handleSend(t("agent.prompt.alertSetup"))}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-xs text-primary font-medium hover:bg-primary/20 transition-all shrink-0"
              >
                <Heart className="w-3 h-3" />
                {t("agent.registerBias")}
              </button>
            )}
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
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={t("agent.inputPlaceholder")}
            className="flex-1 bg-transparent text-sm md:text-[15px] text-foreground placeholder:text-muted-foreground/60 outline-none"
            disabled={isStreaming}
          />
          <Button
            size="icon"
            className="rounded-full w-8 h-8 shrink-0"
            onClick={() => handleSend()}
            disabled={!chatInput.trim() || isStreaming}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {/* Agent Profile Modal */}
      <Drawer open={showAgentProfileModal} onOpenChange={setShowAgentProfileModal}>
        <DrawerContent className="max-h-[85dvh] mx-2 rounded-t-2xl">
          <DrawerHeader className="pb-0">
            <DrawerTitle className="text-center text-base">
              {getSlotDisplayName(activeSlot, watchedArtists, hasAlertOn)}
            </DrawerTitle>
            <DrawerDescription className="sr-only">Agent profile</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col items-center gap-4 px-6 pb-6 pt-3">
            {/* Large Avatar — tappable to change photo */}
            <button
              type="button"
              onClick={() => avatarFileRef.current?.click()}
              className="relative group w-48 h-48 rounded-2xl overflow-hidden bg-primary/10 border-2 border-primary/20 flex items-center justify-center hover:border-primary/40 transition-colors"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Agent" className="w-full h-full object-cover" />
              ) : (
                <Bot className="w-14 h-14 text-primary" />
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </button>
            <p className="text-[11px] text-muted-foreground">{t("agent.profile.tapToChange")}</p>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
              <div className="flex flex-col items-center gap-1 rounded-xl bg-card border border-border/50 p-3">
                <MessageCircle className="w-4 h-4 text-primary" />
                <span className="text-lg font-bold text-foreground">{agentUsage?.used ?? 0}</span>
                <span className="text-[10px] text-muted-foreground">{t("agent.profile.chatsToday")}</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-xl bg-card border border-border/50 p-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-lg font-bold text-foreground">{agentUsage?.remaining ?? 0}</span>
                <span className="text-[10px] text-muted-foreground">{t("agent.profile.remaining")}</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-xl bg-card border border-border/50 p-3">
                <Crown className="w-4 h-4 text-purple-400" />
                <span className="text-lg font-bold text-foreground capitalize">{agentUsage?.tier ?? "basic"}</span>
                <span className="text-[10px] text-muted-foreground">{t("agent.profile.tier")}</span>
              </div>
            </div>

            {/* Bias Artist Info */}
            {activeSlot?.wiki_entry_id && (
              <button
                onClick={() => {
                  setShowAgentProfileModal(false);
                  navigate(`/artist/${activeSlot.wiki_entry_id}`);
                }}
                className="w-full max-w-sm flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/20 p-3 hover:bg-primary/10 transition-colors"
              >
                <Heart className="w-4 h-4 text-pink-400 shrink-0" />
                <div className="flex-1 text-left">
                  <p className="text-xs text-muted-foreground">{t("agent.profile.biasArtist")}</p>
                  <p className="text-sm font-semibold text-foreground">{activeSlot.artist_name}</p>
                </div>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </button>
            )}

          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default V3FanAgent;
