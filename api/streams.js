// Vercel serverless function to fetch Torrentio streams using a backend-only
// RealDebrid key. The RD key is read from environment variables and never
// exposed to the browser.
//
// Expected env vars:
// - REALDEBRID_KEY: your RealDebrid API key

export default async function handler(req, res) {
  const { REALDEBRID_KEY } = process.env;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, type = 'movie' } = req.query || {};
  if (!id) {
    return res.status(400).json({ error: 'Missing id parameter' });
  }

  const safeType = typeof type === 'string' && (type === 'movie' || type === 'series' || type === 'tv')
    ? type
    : 'movie';

  const encodedId = encodeURIComponent(String(id));
  const streamPath = `stream/${safeType}/${encodedId}.json`;

  const basePath = REALDEBRID_KEY
    ? `realdebrid=${encodeURIComponent(REALDEBRID_KEY)}/${streamPath}`
    : streamPath;

  const url = `https://torrentio.strem.fun/${basePath}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Torrentio error: ${response.status}`,
      });
    }

    const data = await response.json();
    const streams = Array.isArray(data.streams) ? data.streams : [];

    return res.status(200).json({ streams });
  } catch (err) {
    console.error('Error in /api/streams:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

