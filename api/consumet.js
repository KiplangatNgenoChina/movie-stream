// Vercel serverless: fetch streams from Consumet.
// Uses meta/tmdb (lookup by TMDB ID) when possible; falls back to FlixHQ search by title.
// CONSUMET_API_BASE_URL = root of your Consumet API (e.g. https://consumet-xxx.vercel.app)
// If you set .../movies/flixhq we derive the root for meta/tmdb.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getConsumetRoot(base) {
  const b = (base || '').replace(/\/$/, '');
  if (b.includes('/movies/flixhq')) return b.replace(/\/movies\/flixhq\/?$/, '');
  return b;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
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
    (e) => String(e.season ?? e.seasonNumber) === String(season) && String(e.number ?? e.episodeNumber) === String(episode)
  );
  if (eps.length) return eps[0].id;
  return firstEpisodeId(info);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed', streams: [] });
  }

  const base = (process.env.CONSUMET_API_BASE_URL || '').replace(/\/$/, '');
  if (!base) {
    return res.status(503).json({
      error: 'Consumet not configured. Set CONSUMET_API_BASE_URL to your Consumet API root (e.g. https://consumet-xxx.vercel.app).',
      streams: [],
    });
  }

  const { tmdbId, type = 'movie', season, episode } = req.query || {};
  if (!tmdbId) {
    return res.status(400).json({ error: 'Missing tmdbId', streams: [] });
  }

  const safeType = (type === 'tv' || type === 'series') ? 'tv' : 'movie';
  const root = getConsumetRoot(base);
  const allStreams = [];

  try {
    // 1) Prefer meta/tmdb: lookup by TMDB ID (most reliable)
    const infoUrl = `${root}/meta/tmdb/info/${encodeURIComponent(tmdbId)}?type=${safeType}&provider=flixhq`;
    let info;
    try {
      info = await fetchJson(infoUrl);
    } catch (_) {
      info = null;
    }

    if (info && (info.episodes?.length || info.episodeId || info.id)) {
      const mediaId = info.id || tmdbId;
      const episodeId = safeType === 'tv'
        ? findEpisodeId(info, season || 1, episode || 1)
        : firstEpisodeId(info);
      if (episodeId) {
        const watchUrl = `${root}/meta/tmdb/watch/${encodeURIComponent(episodeId)}?id=${encodeURIComponent(mediaId)}&provider=flixhq`;
        try {
          const watchData = await fetchJson(watchUrl);
          const sources = Array.isArray(watchData.sources) ? watchData.sources : [];
          sources.forEach((s, i) => {
            allStreams.push({
              name: s.quality ? `Server · ${s.quality}` : `Source ${i + 1}`,
              title: info.title || info.name,
              url: s.url,
            });
          });
        } catch (_) {}
      }
    }

    // 2) Fallback: FlixHQ search by title (when base is /movies/flixhq)
    if (allStreams.length === 0 && base.includes('/movies/flixhq')) {
      const TMDB_API_KEY = process.env.TMDB_API_KEY || '53197e900dd0dfceb105a636a0d1aa6a';
      const tmdbRes = await fetch(
        `https://api.themoviedb.org/3/${safeType}/${tmdbId}?api_key=${TMDB_API_KEY}`,
        { headers: { Accept: 'application/json' } }
      );
      const tmdbData = await tmdbRes.json().catch(() => ({}));
      const title = (tmdbData.title || tmdbData.name || '').trim();
      const year = (tmdbData.release_date || tmdbData.first_air_date || '').substring(0, 4);
      const queriesToTry = year ? [`${title} ${year}`, title] : [title];
      for (const searchQuery of queriesToTry) {
        if (!searchQuery.trim()) continue;
        try {
          const searchUrl = `${base}/${encodeURIComponent(searchQuery)}`;
          const searchData = await fetchJson(searchUrl);
          const results = Array.isArray(searchData)
            ? searchData
            : (Array.isArray(searchData.results) ? searchData.results : []);
          if (results.length) {
            const mediaId = results[0].id;
            const flixInfo = await fetchJson(`${base}/info?id=${encodeURIComponent(mediaId)}`);
            const epId = safeType === 'tv'
              ? findEpisodeId(flixInfo, season || 1, episode || 1)
              : firstEpisodeId(flixInfo);
            if (epId) {
              const watchQs = `episodeId=${encodeURIComponent(epId)}&mediaId=${encodeURIComponent(mediaId)}`;
              try {
                const watchData = await fetchJson(`${base}/watch?${watchQs}`);
                const sources = Array.isArray(watchData.sources) ? watchData.sources : [];
                sources.forEach((s, i) => {
                  allStreams.push({
                    name: s.quality ? `FlixHQ · ${s.quality}` : `FlixHQ ${i + 1}`,
                    title: flixInfo.title || title,
                    url: s.url,
                  });
                });
              } catch (_) {}
            }
          }
          if (allStreams.length) break;
        } catch (_) {}
      }
    }

    return res.status(200).json({ streams: allStreams });
  } catch (err) {
    console.error('Consumet error:', err);
    return res.status(200).json({ streams: [], error: err.message });
  }
}
