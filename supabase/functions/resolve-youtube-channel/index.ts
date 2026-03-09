const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { input } = await req.json();
    if (!input || typeof input !== 'string') {
      return new Response(JSON.stringify({ error: 'input is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'YOUTUBE_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let handle = input.trim();

    // Extract handle from various URL formats
    // https://www.youtube.com/@handle
    // https://www.youtube.com/channel/UCxxxx
    // https://www.youtube.com/c/customname
    // or just @handle or handle

    // If it's already a channel ID (starts with UC and is 24 chars)
    if (/^UC[\w-]{22}$/.test(handle)) {
      const info = await fetchChannelById(handle, apiKey);
      if (info) {
        return new Response(JSON.stringify(info), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Channel not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract from URL
    const channelIdMatch = handle.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
    if (channelIdMatch) {
      const info = await fetchChannelById(channelIdMatch[1], apiKey);
      if (info) {
        return new Response(JSON.stringify(info), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Extract handle from URL patterns
    const handleMatch = handle.match(/youtube\.com\/@([\w.-]+)/);
    if (handleMatch) {
      handle = handleMatch[1];
    } else {
      const customMatch = handle.match(/youtube\.com\/c\/([\w.-]+)/);
      if (customMatch) {
        handle = customMatch[1];
      } else {
        // Remove @ prefix if present
        handle = handle.replace(/^@/, '');
      }
    }

    // Use search API to find the channel by handle
    // First try forHandle parameter (YouTube Data API v3)
    const forHandleUrl = `https://www.googleapis.com/youtube/v3/channels?forHandle=@${encodeURIComponent(handle)}&part=snippet&key=${apiKey}`;
    console.log('Trying forHandle:', handle);
    const forHandleRes = await fetch(forHandleUrl);
    const forHandleData = await forHandleRes.json();

    if (forHandleData.items && forHandleData.items.length > 0) {
      const ch = forHandleData.items[0];
      return new Response(JSON.stringify({
        channel_id: ch.id,
        channel_name: ch.snippet.title,
        channel_url: `https://www.youtube.com/channel/${ch.id}`,
        thumbnail_url: ch.snippet.thumbnails?.default?.url || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fallback: search API
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?q=${encodeURIComponent(handle)}&type=channel&part=snippet&maxResults=1&key=${apiKey}`;
    console.log('Falling back to search:', handle);
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.items && searchData.items.length > 0) {
      const ch = searchData.items[0];
      return new Response(JSON.stringify({
        channel_id: ch.snippet.channelId || ch.id.channelId,
        channel_name: ch.snippet.channelTitle || ch.snippet.title,
        channel_url: `https://www.youtube.com/channel/${ch.snippet.channelId || ch.id.channelId}`,
        thumbnail_url: ch.snippet.thumbnails?.default?.url || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Channel not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchChannelById(channelId: string, apiKey: string) {
  const url = `https://www.googleapis.com/youtube/v3/channels?id=${channelId}&part=snippet&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.items && data.items.length > 0) {
    const ch = data.items[0];
    return {
      channel_id: ch.id,
      channel_name: ch.snippet.title,
      channel_url: `https://www.youtube.com/channel/${ch.id}`,
      thumbnail_url: ch.snippet.thumbnails?.default?.url || null,
    };
  }
  return null;
}
