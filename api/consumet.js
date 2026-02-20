// Vercel serverless: fetch streams from Consumet.
// Uses meta/tmdb (lookup by TMDB ID) when possible; falls back to FlixHQ search by title.
// Providers tried: FlixHQ, HiMovies, Goku, SFlix, DramaCool (api.consumet.org has no 111movies route).
// When a provider returns 0 sources we retry watch with server=vidcloud, upcloud.
// CONSUMET_API_BASE_URL = root of your Consumet API (e.g. https://consumet-xxx.vercel.app)

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

function pushSources(watchData, title, label, allStreams) {
  const sources = Array.isArray(watchData?.sources) ? watchData.sources : [];
  sources.forEach((s, i) => {
    allStreams.push({
      name: s.quality ? `${label} · ${s.quality}` : `${label} ${i + 1}`,
      title,
      url: s.url,
    });
  });
}

// Try watch with default server, then vidcloud, upcloud when first returns no sources
function tryWatchServers(root, episodeId, mediaId, provider, title, label, allStreams) {
  const servers = [null, 'vidcloud', 'upcloud'];
  for (const server of servers) {
    const q = server ? `&server=${encodeURIComponent(server)}` : '';
    const watchUrl = `${root}/meta/tmdb/watch/${encodeURIComponent(episodeId)}?id=${encodeURIComponent(mediaId)}&provider=${provider}${q}`;
    try {
      const watchData = await fetchJson(watchUrl);
      const sources = Array.isArray(watchData.sources) ? watchData.sources : [];
      if (sources.length) {
        pushSources(watchData, title, label, allStreams);
        return true;
      }
    } catch (_) {}
  }
  return false;
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
        tryWatchServers(root, episodeId, mediaId, 'flixhq', info.title || info.name, 'FlixHQ', allStreams);
      }
    }

    // 2) Fallback: FlixHQ search by title (always try when meta/tmdb returns no streams)
    const flixhqBase = `${root}/movies/flixhq`;
    if (allStreams.length === 0) {
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
          const searchUrl = `${flixhqBase}/${encodeURIComponent(searchQuery)}`;
          const searchData = await fetchJson(searchUrl);
          const results = Array.isArray(searchData)
            ? searchData
            : (Array.isArray(searchData.results) ? searchData.results : []);
          if (results.length) {
            const mediaId = results[0].id;
            const flixInfo = await fetchJson(`${flixhqBase}/info?id=${encodeURIComponent(mediaId)}`);
            const epId = safeType === 'tv'
              ? findEpisodeId(flixInfo, season || 1, episode || 1)
              : firstEpisodeId(flixInfo);
            if (epId) {
              const servers = [null, 'vidcloud', 'upcloud'];
              for (const server of servers) {
                const watchQs = `episodeId=${encodeURIComponent(epId)}&mediaId=${encodeURIComponent(mediaId)}${server ? `&server=${encodeURIComponent(server)}` : ''}`;
                try {
                  const watchData = await fetchJson(`${flixhqBase}/watch?${watchQs}`);
                  const sources = Array.isArray(watchData.sources) ? watchData.sources : [];
                  if (sources.length) {
                    pushSources(watchData, flixInfo.title || title, 'FlixHQ', allStreams);
                    break;
                  }
                } catch (_) {}
              }
            }
          }
          if (allStreams.length) break;
        } catch (_) {}
      }
    }

    // 3) More Consumet providers: meta/tmdb + himovies, goku, sflix, dramacool (when flixhq still returns nothing)
    // 111movies is in consumet.ts library but not exposed in api.consumet.org routes (only flixhq, dramacool, goku, sflix, himovies)
    const extraProviders = [
      { name: 'himovies', label: 'HiMovies' },
      { name: 'goku', label: 'Goku' },
      { name: 'sflix', label: 'SFlix' },
      { name: 'dramacool', label: 'DramaCool' },
    ];
    for (const { name: provider, label } of extraProviders) {
      if (allStreams.length > 0) break;
      try {
        const infoUrlP = `${root}/meta/tmdb/info/${encodeURIComponent(tmdbId)}?type=${safeType}&provider=${provider}`;
        const infoP = await fetchJson(infoUrlP).catch(() => null);
        if (infoP && (infoP.episodes?.length || infoP.episodeId || infoP.id)) {
          const mediaId = infoP.id || tmdbId;
          const episodeId = safeType === 'tv'
            ? findEpisodeId(infoP, season || 1, episode || 1)
            : firstEpisodeId(infoP);
          if (episodeId) {
            tryWatchServers(root, episodeId, mediaId, provider, infoP.title || infoP.name, label, allStreams);
          }
        }
      } catch (_) {}
    }

    return res.status(200).json({ streams: allStreams });
  } catch (err) {
    console.error('Consumet error:', err);
    return res.status(200).json({ streams: [], error: err.message });
  }
}
