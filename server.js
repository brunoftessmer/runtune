require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback';
const SCOPES = 'user-top-read user-read-private user-library-read';
const IS_PROD = process.env.NODE_ENV === 'production';

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000
};

function setCookies(res, accessToken, refreshToken, expiresIn) {
  const expiry = Date.now() + expiresIn * 1000;
  res.cookie('rt_access', accessToken, { ...COOKIE_OPTS, maxAge: expiresIn * 1000 });
  res.cookie('rt_refresh', refreshToken, { ...COOKIE_OPTS, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.cookie('rt_expiry', String(expiry), { ...COOKIE_OPTS, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

app.get('/auth/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect(`/?error=spotify_${error}`);
  if (!code) return res.redirect('/?error=no_code');
  try {
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      }),
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    setCookies(res, tokenRes.data.access_token, tokenRes.data.refresh_token, tokenRes.data.expires_in);
    res.redirect('/app');
  } catch (err) {
    const detail = err?.response?.data?.error || err.message || 'unknown';
    res.redirect(`/?error=token_${detail}`);
  }
});

app.get('/auth/status', (req, res) => {
  res.json({ authenticated: !!req.cookies.rt_access });
});

app.get('/auth/logout', (req, res) => {
  res.clearCookie('rt_access');
  res.clearCookie('rt_refresh');
  res.clearCookie('rt_expiry');
  res.redirect('/');
});

app.get('/app', (req, res) => {
  if (!req.cookies.rt_access) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// ─── Middleware ────────────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const accessToken = req.cookies.rt_access;
  const refreshToken = req.cookies.rt_refresh;
  const tokenExpiry = parseInt(req.cookies.rt_expiry || '0');

  if (!accessToken) return res.status(401).json({ error: 'Not authenticated' });

  if (Date.now() > tokenExpiry - 60_000) {
    try {
      const tokenRes = await axios.post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      setCookies(res, tokenRes.data.access_token, refreshToken, tokenRes.data.expires_in);
      req.accessToken = tokenRes.data.access_token;
    } catch {
      return res.status(401).json({ error: 'Session expired' });
    }
  } else {
    req.accessToken = accessToken;
  }
  next();
}

async function spotifyGet(token, endpoint, params = {}) {
  const url = new URL(`https://api.spotify.com/v1${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await axios.get(url.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}

// ─── API ──────────────────────────────────────────────────────────────────────

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const data = await spotifyGet(req.accessToken, '/me');
    res.json({ name: data.display_name, image: data.images?.[0]?.url || null });
  } catch {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.get('/api/genres', requireAuth, async (req, res) => {
  try {
    const data = await spotifyGet(req.accessToken, '/me/top/artists', { limit: 20, time_range: 'medium_term' });
    const count = {};
    data.items.forEach(artist => {
      artist.genres.forEach(g => { count[g] = (count[g] || 0) + 1; });
    });
    const genres = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
    res.json({ genres: genres.length > 0 ? genres : ['pop', 'rock', 'electronic'] });
  } catch {
    res.json({ genres: ['pop', 'rock', 'electronic'] });
  }
});

const ENERGETIC = ['hip hop', 'rap', 'trap', 'funk', 'electronic', 'edm', 'house', 'techno', 'metal', 'punk', 'drum', 'dance', 'reggaeton', 'dancehall', 'bass', 'rock', 'hardcore'];
const CALM     = ['jazz', 'folk', 'acoustic', 'ambient', 'bossa', 'mpb', 'classical', 'lo-fi', 'soul', 'blues', 'indie folk', 'new age', 'samba', 'pagode'];

function energyScore(genres) {
  let score = 0;
  for (const g of genres) {
    const gl = g.toLowerCase();
    if (ENERGETIC.some(k => gl.includes(k))) score++;
    if (CALM.some(k => gl.includes(k)))     score--;
  }
  return score;
}

app.post('/api/suggestions', requireAuth, async (req, res) => {
  const { durationMinutes, mood = 'random' } = req.body;
  if (!durationMinutes || durationMinutes < 5) return res.status(400).json({ error: 'Duração inválida' });

  const targetMs = durationMinutes * 60_000;
  try {
    const [saved1, saved2, topTracksMed, topTracksShort, topTracksLong, topArtistsData] = await Promise.all([
      spotifyGet(req.accessToken, '/me/albums', { limit: 50, offset: 0 }),
      spotifyGet(req.accessToken, '/me/albums', { limit: 50, offset: 50 }),
      spotifyGet(req.accessToken, '/me/top/tracks', { limit: 50, time_range: 'medium_term' }),
      spotifyGet(req.accessToken, '/me/top/tracks', { limit: 50, time_range: 'short_term' }),
      spotifyGet(req.accessToken, '/me/top/tracks', { limit: 50, time_range: 'long_term' }),
      spotifyGet(req.accessToken, '/me/top/artists', { limit: 50, time_range: 'medium_term' })
    ]);

    const savedData = { items: [...(saved1.items || []), ...(saved2.items || [])] };
    const artistGenres = {};
    topArtistsData.items.forEach(a => { artistGenres[a.id] = a.genres || []; });

    const genreCount = {};
    topArtistsData.items.forEach(a => (a.genres || []).forEach(g => { genreCount[g] = (genreCount[g] || 0) + 1; }));
    const topGenres = new Set(
      Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([g]) => g)
    );

    function buildEntry(album, totalMs, exact) {
      const genres = artistGenres[album.artists[0]?.id] || [];
      return { album, totalMs, exact, score: energyScore(genres), inTopGenre: genres.some(g => topGenres.has(g)) };
    }

    const savedAlbums = (savedData.items || [])
      .filter(item => item.album?.tracks?.items?.length > 0)
      .map(item => {
        const album = item.album;
        const totalMs = album.tracks.items.reduce((s, t) => s + (t.duration_ms || 0), 0);
        return buildEntry(album, totalMs, true);
      })
      .filter(({ totalMs }) => totalMs > 0);

    const savedAlbumIds = new Set(savedAlbums.map(e => e.album.id));
    const tracksByAlbum = {};
    [...topTracksMed.items, ...topTracksShort.items, ...topTracksLong.items].forEach(track => {
      if (savedAlbumIds.has(track.album.id)) return;
      if (!tracksByAlbum[track.album.id]) {
        tracksByAlbum[track.album.id] = { album: track.album, durations: [], totalTracks: track.album.total_tracks || 10 };
      }
      tracksByAlbum[track.album.id].durations.push(track.duration_ms);
    });

    const estimatedAlbums = Object.values(tracksByAlbum)
      .filter(({ durations }) => durations.length >= 2)
      .map(({ album, durations, totalTracks }) => {
        const avgMs = durations.reduce((s, d) => s + d, 0) / durations.length;
        return buildEntry(album, avgMs * totalTracks, false);
      });

    const tiers = [
      { label: 'gêneros favoritos',   pool: savedAlbums.filter(a => a.inTopGenre) },
      { label: 'biblioteca completa', pool: savedAlbums },
      { label: 'músicas favoritas',   pool: [...savedAlbums, ...estimatedAlbums] }
    ];

    let result = [], tierLabel = '';
    outer:
    for (const { label, pool } of tiers) {
      for (const tol of [0.20, 0.35, 0.50]) {
        const matching = pool.filter(({ totalMs }) => totalMs >= targetMs * (1 - tol) && totalMs <= targetMs * (1 + tol));
        if (matching.length >= 10) { result = matching; tierLabel = label; break outer; }
      }
    }

    if (result.length === 0) {
      return res.status(404).json({ error: `Nenhum álbum encontrado para ${durationMinutes} minutos. Tente outro tempo ou salve mais álbuns no Spotify.` });
    }

    if (mood === 'motivated')        result.sort((a, b) => a.score - b.score);
    else if (mood === 'unmotivated') result.sort((a, b) => b.score - a.score);
    else                             result.sort(() => Math.random() - 0.5);

    console.log(`[suggestions] tier "${tierLabel}" — ${result.length} candidatos`);

    res.json({
      suggestions: result.slice(0, 10).map(({ album, totalMs }) => ({
        id: album.id,
        name: album.name,
        artist: album.artists[0]?.name || 'Artista desconhecido',
        image: album.images?.[0]?.url || null,
        durationMin: Math.round(totalMs / 60_000),
        spotifyUrl: album.external_urls?.spotify
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar sugestões' });
  }
});

app.listen(PORT, () => {
  console.log(`RunTune rodando em http://localhost:${PORT}`);
});
