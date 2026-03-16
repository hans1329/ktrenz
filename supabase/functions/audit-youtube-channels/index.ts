const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'YOUTUBE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Get all tier 1 artists with youtube_channel_id
    const { data: artists, error } = await supabase
      .from('v3_artist_tiers')
      .select('id, display_name, youtube_channel_id')
      .eq('tier', 1)
      .not('youtube_channel_id', 'is', null);

    if (error) throw error;

    const results: any[] = [];

    for (const artist of artists || []) {
      let channelId = artist.youtube_channel_id;

      // If it's a handle (@xxx), resolve it first
      if (channelId.startsWith('@')) {
        const handleUrl = `https://www.googleapis.com/youtube/v3/channels?forHandle=${encodeURIComponent(channelId)}&part=snippet,statistics&key=${apiKey}`;
        const res = await fetch(handleUrl);
        const data = await res.json();
        if (data.items?.[0]) {
          const ch = data.items[0];
          results.push({
            artist: artist.display_name,
            stored_id: artist.youtube_channel_id,
            resolved_id: ch.id,
            channel_name: ch.snippet.title,
            subscribers: parseInt(ch.statistics.subscriberCount || '0'),
            views: parseInt(ch.statistics.viewCount || '0'),
            videos: parseInt(ch.statistics.videoCount || '0'),
            suspect: parseInt(ch.statistics.subscriberCount || '0') < 10000,
          });
        } else {
          results.push({
            artist: artist.display_name,
            stored_id: artist.youtube_channel_id,
            resolved_id: null,
            channel_name: null,
            subscribers: 0,
            suspect: true,
            error: 'Handle not found',
          });
        }
      } else if (/^UC[\w-]{22}$/.test(channelId)) {
        const url = `https://www.googleapis.com/youtube/v3/channels?id=${channelId}&part=snippet,statistics&key=${apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.items?.[0]) {
          const ch = data.items[0];
          results.push({
            artist: artist.display_name,
            stored_id: artist.youtube_channel_id,
            channel_name: ch.snippet.title,
            subscribers: parseInt(ch.statistics.subscriberCount || '0'),
            views: parseInt(ch.statistics.viewCount || '0'),
            videos: parseInt(ch.statistics.videoCount || '0'),
            suspect: parseInt(ch.statistics.subscriberCount || '0') < 10000,
          });
        } else {
          results.push({
            artist: artist.display_name,
            stored_id: artist.youtube_channel_id,
            channel_name: null,
            subscribers: 0,
            suspect: true,
            error: 'Channel ID not found',
          });
        }
      } else {
        results.push({
          artist: artist.display_name,
          stored_id: artist.youtube_channel_id,
          suspect: true,
          error: 'Invalid format (not handle or UC ID)',
        });
      }

      // Rate limit: 100ms between calls
      await new Promise(r => setTimeout(r, 100));
    }

    // Sort: suspects first, then by subscriber count ascending
    results.sort((a, b) => {
      if (a.suspect && !b.suspect) return -1;
      if (!a.suspect && b.suspect) return 1;
      return (a.subscribers || 0) - (b.subscribers || 0);
    });

    const suspects = results.filter(r => r.suspect);

    return new Response(JSON.stringify({
      total: results.length,
      suspects: suspects.length,
      suspect_list: suspects,
      all: results,
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
