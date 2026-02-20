// Vercel serverless: fetch streams from Consumet (FlixHQ) as a free alternative to StremThru/Real-Debrid.
// Requires CONSUMET_API_BASE_URL = your self-hosted Consumet API base (e.g. https://your-consumet.vercel.app/movies/flixhq).
// See https://github.com/consumet/api.consumet.org — public API is deprecated; self-host on Vercel/Railway/Render.

const TMDB_BASE = 'https://api.themoviedb.org/3';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchConsumet(base, path, qs = '') {
  const url = `${base.replace(/\/$/, '')}${path}${qs ? (path.includes('?') ? '&' : '?') + qs : ''}`;
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Consumet ${res.status}`);
  return data;
}

function firstEpisodeId(info) {
  const eps = info.episodes || [];
  if (eps.length) return eps[0].id;
  if (info.episodeId) return info.episodeId;
  return null;
}

function findEpisodeId(info, season, episode) {
  const eps = (info.episodes || []).filter(
    (e) => String(e.season || e.seasonNumber) === String(season) && String(e.number || e.episodeNumber) === String(episode)
  );
  if (eps.length) return eps[0].id;
  const first = firstEpisodeId(info);
  return first;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed', streams: [] });
  }

  const base = (process.env.CONSUMET_API_BASE_URL || '').replace(/\/$/, '');
  if (!base) {
    return res.status(503).json({
      error: 'Consumet not configured. Set CONSUMET_API_BASE_URL to your self-hosted Consumet API base (e.g. .../movies/flixhq).',
      streams: [],
    });
  }

  const { tmdbId, type = 'movie', season, episode } = req.query || {};
  if (!tmdbId) {
    return res.status(400).json({ error: 'Missing tmdbId', streams: [] });
  }

  const TMDB_API_KEY = process.env.TMDB_API_KEY || '53197e900dd0dfceb105a636a0d1aa6a';
  if (!TMDB_API_KEY) {
    return res.status(503).json({ error: 'TMDB_API_KEY required for Consumet lookup.', streams: [] });
  }

  try {
    const path = (type === 'tv' || type === 'series') ? `tv/${tmdbId}` : `movie/${tmdbId}`;
    const tmdbRes = await fetch(`${TMDB_BASE}/${path}?api_key=${TMDB_API_KEY}`, {
      headers: { Accept: 'application/json' },
    });
    const tmdbData = await tmdbRes.json().catch(() => ({}));
    const title = (tmdbData.title || tmdbData.name || '').trim();
    if (!tmdbRes.ok || !title) return res.status(200).json({ streams: [] });
    const year = tmdbData.release_date || tmdbData.first_air_date || '';
    const searchQuery = year ? `${title} ${year.substring(0, 4)}` : title;
    if (!searchQuery) return res.status(200).json({ streams: [] });

    const searchPath = `/${encodeURIComponent(searchQuery)}`;
    const searchData = await fetchConsumet(base, searchPath);
    const results = Array.isArray(searchData.results) ? searchData.results : [];
    if (!results.length) return res.status(200).json({ streams: [] });

    const mediaId = results[0].id;
    const info = await fetchConsumet(base, '/info', `id=${encodeURIComponent(mediaId)}`);
    const episodeId = type === 'tv' || type === 'series'
      ? findEpisodeId(info, season || 1, episode || 1)
      : firstEpisodeId(info);
    if (!episodeId) return res.status(200).json({ streams: [] });

    const watchQs = `episodeId=${encodeURIComponent(episodeId)}&mediaId=${encodeURIComponent(mediaId)}`;
    let servers = [];
    try {
      const serversData = await fetchConsumet(base, '/servers', watchQs);
      servers = Array.isArray(serversData) ? serversData : (Array.isArray(serversData.servers) ? serversData.servers : []);
    } catch (_) {
      servers = [];
    }

    const allStreams = [];
    if (servers.length) {
      for (let i = 0; i < servers.length; i++) {
        const srv = servers[i];
        const serverName = (srv.name || srv.server || `Server ${i + 1}`).replace(/\s+/g, ' ');
        try {
          const watchData = await fetchConsumet(base, '/watch', watchQs + (serverName ? `&server=${encodeURIComponent(serverName)}` : ''));
          const sources = Array.isArray(watchData.sources) ? watchData.sources : [];
          sources.forEach((s, j) => {
            allStreams.push({
              name: s.quality ? `Server ${i + 1} · ${serverName} · ${s.quality}` : `Server ${i + 1} · ${serverName}`,
              title: info.title || title,
              url: s.url,
            });
          });
        } catch (_) {
          // skip failed server
        }
      }
    }
    if (!allStreams.length) {
      const watchData = await fetchConsumet(base, '/watch', watchQs);
      const sources = Array.isArray(watchData.sources) ? watchData.sources : [];
      sources.forEach((s, i) => {
        allStreams.push({
          name: s.quality ? `Consumet ${s.quality}` : `Consumet Source ${i + 1}`,
          title: info.title || title,
          url: s.url,
        });
      });
    }

    return res.status(200).json({ streams: allStreams });
  } catch (err) {
    console.error('Consumet error:', err);
    return res.status(200).json({ streams: [], error: err.message });
  }
}
