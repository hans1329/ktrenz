import { TrendingUp, TrendingDown, Minus, Youtube, MessageCircle, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BriefingArtistData {
  artist_name: string;
  image_url?: string | null;
  rank: number;
  prev_rank?: number | null;
  energy_score: number;
  energy_change_24h: number;
  youtube_score: number;
  buzz_score: number;
  total_score: number;
  top_mention?: string | null;
  latest_video_title?: string | null;
}

export interface BriefingCompetitor {
  artist_name: string;
  rank: number;
  energy_score: number;
  energy_change_24h: number;
  total_score: number;
}

export interface BriefingData {
  watched_artists: BriefingArtistData[];
  competitors: BriefingCompetitor[];
  highlight?: string;
}

const ChangeIndicator = ({ value }: { value: number }) => {
  if (value > 0) return (
    <span className="inline-flex items-center gap-0.5 text-green-400 text-xs font-semibold">
      <TrendingUp className="w-3 h-3" />+{value.toFixed(1)}%
    </span>
  );
  if (value < 0) return (
    <span className="inline-flex items-center gap-0.5 text-red-400 text-xs font-semibold">
      <TrendingDown className="w-3 h-3" />{value.toFixed(1)}%
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
      <Minus className="w-3 h-3" />0%
    </span>
  );
};

const RankBadge = ({ rank, prevRank }: { rank: number; prevRank?: number | null }) => {
  const rankDiff = prevRank != null ? prevRank - rank : 0;
  return (
    <div className="flex items-center gap-1">
      <span className={cn(
        "text-lg font-black",
        rank === 1 ? "text-yellow-400" : rank === 2 ? "text-slate-300" : rank === 3 ? "text-amber-600" : "text-foreground"
      )}>
        #{rank}
      </span>
      {rankDiff !== 0 && (
        <span className={cn("text-[10px] font-bold", rankDiff > 0 ? "text-green-400" : "text-red-400")}>
          {rankDiff > 0 ? `▲${rankDiff}` : `▼${Math.abs(rankDiff)}`}
        </span>
      )}
    </div>
  );
};

export const V3BriefingCard = ({ data }: { data: BriefingData }) => {
  return (
    <div className="w-full mt-2 space-y-2">
      {/* Watched Artists Cards */}
      {data.watched_artists.map((artist) => (
        <div
          key={artist.artist_name}
          className="rounded-xl bg-card/80 border border-border/50 p-3 space-y-2"
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            {artist.image_url && (
              <img
                src={artist.image_url}
                alt={artist.artist_name}
                className="w-10 h-10 rounded-lg object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground truncate">{artist.artist_name}</span>
                <RankBadge rank={artist.rank} prevRank={artist.prev_rank} />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <ChangeIndicator value={artist.energy_change_24h} />
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 text-primary">
                <Zap className="w-3.5 h-3.5" />
                <span className="text-lg font-black">{Math.round(artist.energy_score)}°</span>
              </div>
              <span className="text-[10px] text-muted-foreground">°</span>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg bg-muted/30 px-2 py-1.5 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <Youtube className="w-3 h-3 text-red-400" />
                <span className="text-[10px]">YouTube</span>
              </div>
              <span className="text-sm font-bold text-foreground">{artist.youtube_score.toLocaleString()}</span>
            </div>
            <div className="flex-1 rounded-lg bg-muted/30 px-2 py-1.5 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <MessageCircle className="w-3 h-3 text-blue-400" />
                <span className="text-[10px]">Buzz</span>
              </div>
              <span className="text-sm font-bold text-foreground">{artist.buzz_score.toLocaleString()}</span>
            </div>
            <div className="flex-1 rounded-lg bg-muted/30 px-2 py-1.5 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <Users className="w-3 h-3 text-purple-400" />
                <span className="text-[10px]">Total</span>
              </div>
              <span className="text-sm font-bold text-foreground">{Math.round(artist.total_score).toLocaleString()}</span>
            </div>
          </div>

          {/* Latest Video */}
          {artist.latest_video_title && (
            <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg px-2 py-1.5">
              🎬 최신: <span className="text-foreground">{artist.latest_video_title}</span>
            </div>
          )}

          {/* Top Mention */}
          {artist.top_mention && (
            <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg px-2 py-1.5">
              🔥 화제: <span className="text-foreground">{artist.top_mention}</span>
            </div>
          )}
        </div>
      ))}

      {/* Competitor Comparison */}
      {data.competitors.length > 0 && (
        <div className="rounded-xl bg-card/60 border border-border/30 p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <Users className="w-3 h-3" /> 경쟁 아티스트 비교
          </p>
          <div className="space-y-1">
            {data.competitors.map((c) => (
              <div key={c.artist_name} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground/70">#{c.rank}</span> {c.artist_name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-medium">{Math.round(c.energy_score)}°</span>
                  <ChangeIndicator value={c.energy_change_24h} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default V3BriefingCard;
