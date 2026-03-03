const API_BASE = 'https://api.sportsrc.org/v2/';
const API_KEY = 'fee04dc9e5d73b10127c1c4f205c6514';
const FOOTBALL_CATEGORY = 'football';

const LEAGUE_PRIORITY = [
  'Premier League',
  'LaLiga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'UEFA Champions League',
  'UEFA Europa League',
  'UEFA Europa Conference League'
];

const state = {
  mode: 'live', // 'live' | 'upcoming'
  matches: [],
  teamFilter: '',
  searchQuery: '',
};

let heroCategoriesClickBound = false;

const elements = {
  navLive: document.getElementById('nav-live'),
  navUpcoming: document.getElementById('nav-upcoming'),
  contentTitle: document.getElementById('content-title'),
  matchesGrid: document.getElementById('matches-grid'),
  homeSections: document.getElementById('home-sections'),
  topLeaguesRow: document.getElementById('top-leagues-row'),
  topTeamsRow: document.getElementById('top-teams-row'),
  matchSearchInput: document.getElementById('match-search-input'),
  heroCategories: document.getElementById('hero-categories'),
  leagueFilter: document.getElementById('league-filter'),
  refreshBtn: document.getElementById('refresh-btn'),
  emptyState: document.getElementById('empty-state'),
  errorState: document.getElementById('error-state'),
  matchCountBadge: document.getElementById('match-count-badge'),
  footerYear: document.getElementById('footer-year'),
  streamModal: document.getElementById('stream-modal'),
  streamModalClose: document.getElementById('stream-modal-close'),
  streamModalTitle: document.getElementById('stream-modal-title'),
  streamModalSubtitle: document.getElementById('stream-modal-subtitle'),
  streamModalStatus: document.getElementById('stream-modal-status'),
  streamWrapper: document.getElementById('stream-wrapper'),
};

function init() {
  if (elements.footerYear) {
    elements.footerYear.textContent = new Date().getFullYear();
  }

  elements.navLive?.addEventListener('click', (e) => {
    e.preventDefault();
    setMode('live');
  });

  elements.navUpcoming?.addEventListener('click', (e) => {
    e.preventDefault();
    setMode('upcoming');
  });

  elements.refreshBtn?.addEventListener('click', () => {
    fetchMatches();
  });

  elements.leagueFilter?.addEventListener('change', () => {
    renderMatches();
  });

  elements.matchSearchInput?.addEventListener('input', (e) => {
    const value = e.target.value || '';
    state.searchQuery = value.trim();
    renderMatches();
  });

  attachModalListeners();
  fetchMatches();
}

function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;

  if (mode === 'live') {
    elements.navLive?.classList.add('active');
    elements.navUpcoming?.classList.remove('active');
    elements.contentTitle.textContent = 'Live matches';
  } else {
    elements.navUpcoming?.classList.add('active');
    elements.navLive?.classList.remove('active');
    elements.contentTitle.textContent = 'Upcoming matches';
  }

  fetchMatches();
}

async function fetchMatches() {
  elements.errorState.hidden = true;
  elements.emptyState.hidden = true;
  elements.matchesGrid.innerHTML = '';
  state.teamFilter = '';
  elements.matchCountBadge.textContent = 'Loading matches…';

  try {
    const params = new URLSearchParams();
    params.set('type', 'matches');
    params.set('sport', FOOTBALL_CATEGORY);

    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(today.getUTCDate()).padStart(2, '0');
    params.set('date', `${yyyy}-${mm}-${dd}`);

    if (state.mode === 'live') {
      params.set('status', 'inprogress');
    } else {
      params.set('status', 'notstarted');
    }
    params.set('api_key', API_KEY);

    const url = `${API_BASE}?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const json = await res.json();
    const groups = Array.isArray(json?.data) ? json.data : [];

    const flat = [];
    for (const group of groups) {
      const leagueInfo = group.league || {};
      const leagueName = leagueInfo.name || leagueInfo.title || '';
      const leagueObj = leagueName ? { name: leagueName, ...leagueInfo } : leagueInfo;

      const matches = Array.isArray(group.matches) ? group.matches : [];
      for (const m of matches) {
        flat.push({
          ...m,
          league: leagueObj,
        });
      }
    }

    state.matches = flat;
    updateHeroCategories(flat);
    populateLeagueFilter(flat);
    renderHomeSections(flat);
    renderMatches();
  } catch (err) {
    console.error('Failed to load matches', err);
    elements.errorState.hidden = false;
    elements.matchCountBadge.textContent = 'Error loading matches';
  }
}

function isLive(match) {
  const status = String(match?.status || '').toLowerCase();
  if (!status) return false;
  if (status === 'inprogress' || status === 'live') return true;
  if (status === 'halftime' || status === 'ht') return true;
  if (status === 'extra_time' || status === 'et') return true;
  if (status === 'penalty' || status === 'penalties') return true;
  return false;
}

function getLeagueName(match) {
  if (!match) return '';
  if (typeof match.league === 'string') return match.league;
  if (match.league && typeof match.league.name === 'string') return match.league.name;
  if (typeof match.competition === 'string') return match.competition;
  if (match.competition && typeof match.competition.name === 'string') return match.competition.name;
  if (typeof match.tournament === 'string') return match.tournament;
  if (match.tournament && typeof match.tournament.name === 'string') return match.tournament.name;
  return '';
}

function populateLeagueFilter(allMatches) {
  const select = elements.leagueFilter;
  if (!select) return;

  const leagues = [
    ...new Set(
      allMatches
        .map((m) => getLeagueName(m))
        .filter(Boolean)
    ),
  ];
  leagues.sort((a, b) => a.localeCompare(b));

  const current = select.value;
  select.innerHTML = '<option value=\"\">All competitions</option>';

  for (const league of leagues) {
    const option = document.createElement('option');
    option.value = league;
    option.textContent = league;
    select.appendChild(option);
  }

  if (leagues.includes(current)) {
    select.value = current;
  }
}

function renderMatches() {
  const grid = elements.matchesGrid;
  if (!grid) return;

  grid.innerHTML = '';

  const leagueFilter = elements.leagueFilter?.value || '';
  let matches = state.matches;

  if (leagueFilter) {
    matches = matches.filter(
      (m) => (getLeagueName(m) || '').toLowerCase() === leagueFilter.toLowerCase()
    );
  }

  const teamFilter = (state.teamFilter || '').toLowerCase();
  if (teamFilter) {
    matches = matches.filter((m) => {
      const homeName = m.teams?.home?.name || '';
      const awayName = m.teams?.away?.name || '';
      return (
        homeName.toLowerCase() === teamFilter ||
        awayName.toLowerCase() === teamFilter
      );
    });
  }

  const q = (state.searchQuery || '').toLowerCase();
  if (q) {
    matches = matches.filter((m) => {
      const league = (getLeagueName(m) || '').toLowerCase();
      const title = (m.title || '').toLowerCase();
      const home = (m.teams?.home?.name || '').toLowerCase();
      const away = (m.teams?.away?.name || '').toLowerCase();
      return (
        league.includes(q) ||
        title.includes(q) ||
        home.includes(q) ||
        away.includes(q)
      );
    });
  }

  elements.matchCountBadge.textContent =
    matches.length === 0 ? 'No matches' : `${matches.length} match${matches.length === 1 ? '' : 'es'}`;

  if (matches.length === 0) {
    elements.emptyState.hidden = false;
    return;
  }

  elements.emptyState.hidden = true;

  const grouped = new Map();
  for (const m of matches) {
    const leagueName = getLeagueName(m) || 'Other';
    if (!grouped.has(leagueName)) grouped.set(leagueName, []);
    grouped.get(leagueName).push(m);
  }

  for (const [leagueName, leagueMatches] of grouped) {
    const section = document.createElement('section');
    section.className = 'league-section';

    const header = document.createElement('div');
    header.className = 'league-header';
    header.innerHTML = `
      <h3 class="league-title">${escapeHtml(leagueName)}</h3>
      <span class="league-count">${leagueMatches.length} match${leagueMatches.length === 1 ? '' : 'es'}</span>
    `;

    const inner = document.createElement('div');
    inner.className = 'league-matches';

    for (const m of leagueMatches) {
      const card = createMatchCard(m);
      inner.appendChild(card);
    }

    section.appendChild(header);
    section.appendChild(inner);
    grid.appendChild(section);
  }
}

function updateHeroCategories(allMatches) {
  const container = elements.heroCategories;
  if (!container) return;

  container.innerHTML = '';

  const counts = new Map();
  for (const m of allMatches) {
    const leagueName = getLeagueName(m) || 'Other';
    counts.set(leagueName, (counts.get(leagueName) || 0) + 1);
  }

  let sortedLeagues = sortLeaguesByPriority(Array.from(counts.entries()))
    .slice(0, 7)
    .map(([league]) => league);

  if (sortedLeagues.length === 0) {
    sortedLeagues = [
      'Premier League',
      'Champions League',
      'La Liga',
      'Serie A',
      'Bundesliga',
      'Ligue 1',
    ];
  }

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'hero-chip active';
  allChip.textContent = 'All competitions';
  allChip.dataset.league = '';
  container.appendChild(allChip);

  for (const league of sortedLeagues) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'hero-chip';
    chip.textContent = league;
    chip.dataset.league = league;
    container.appendChild(chip);
  }

  if (!heroCategoriesClickBound) {
    container.addEventListener('click', onHeroCategoryClick);
    heroCategoriesClickBound = true;
  }
}

function renderHomeSections(allMatches) {
  const leaguesRow = elements.topLeaguesRow;
  const teamsRow = elements.topTeamsRow;
  if (!leaguesRow || !teamsRow) return;

  leaguesRow.innerHTML = '';
  teamsRow.innerHTML = '';

  if (!Array.isArray(allMatches) || allMatches.length === 0) {
    if (elements.homeSections) {
      elements.homeSections.hidden = true;
    }
    return;
  }

  if (elements.homeSections) {
    elements.homeSections.hidden = false;
  }

  // Top leagues by number of matches
  const leagueCounts = new Map();
  for (const m of allMatches) {
    const name = getLeagueName(m) || 'Other';
    leagueCounts.set(name, (leagueCounts.get(name) || 0) + 1);
  }

  const topLeagues = sortLeaguesByPriority(Array.from(leagueCounts.entries()))
    .slice(0, 8);

  for (const [leagueName, count] of topLeagues) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'home-pill';
    pill.innerHTML = `
      <div class="home-pill-title">${escapeHtml(leagueName)}</div>
      <div class="home-pill-sub">League</div>
      <div class="home-pill-meta">${count} match${count === 1 ? '' : 'es'}</div>
    `;
    pill.addEventListener('click', () => {
      if (elements.leagueFilter) {
        elements.leagueFilter.value = leagueName;
      }
      state.teamFilter = '';
      renderMatches();
      elements.matchesGrid?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    leaguesRow.appendChild(pill);
  }

  // Top teams by appearance count
  const teamMap = new Map();
  for (const m of allMatches) {
    const home = m.teams?.home;
    const away = m.teams?.away;
    if (home?.name) {
      const key = home.name;
      const entry = teamMap.get(key) || { name: home.name, badge: home.badge || '', count: 0 };
      entry.count += 1;
      entry.badge = entry.badge || home.badge || '';
      teamMap.set(key, entry);
    }
    if (away?.name) {
      const key = away.name;
      const entry = teamMap.get(key) || { name: away.name, badge: away.badge || '', count: 0 };
      entry.count += 1;
      entry.badge = entry.badge || away.badge || '';
      teamMap.set(key, entry);
    }
  }

  const topTeams = Array.from(teamMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  for (const team of topTeams) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'home-pill';
    pill.innerHTML = `
      <div class="home-pill-title">${escapeHtml(team.name)}</div>
      <div class="home-pill-sub">Team</div>
      <div class="home-pill-meta">${team.count} match${team.count === 1 ? '' : 'es'}</div>
    `;
    pill.addEventListener('click', () => {
      state.teamFilter = team.name;
      if (elements.leagueFilter) {
        elements.leagueFilter.value = '';
      }
      renderMatches();
      elements.matchesGrid?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    teamsRow.appendChild(pill);
  }
}

function sortLeaguesByPriority(entries) {
  return entries.sort((a, b) => {
    const [nameA, countA] = a;
    const [nameB, countB] = b;

    const idxA = LEAGUE_PRIORITY.indexOf(nameA);
    const idxB = LEAGUE_PRIORITY.indexOf(nameB);
    const inA = idxA !== -1;
    const inB = idxB !== -1;

    if (inA && inB) {
      return idxA - idxB;
    }
    if (inA) return -1;
    if (inB) return 1;

    if (countB !== countA) {
      return countB - countA;
    }
    return nameA.localeCompare(nameB);
  });
}

function onHeroCategoryClick(e) {
  const container = elements.heroCategories;
  if (!container) return;

  const target = e.target.closest('.hero-chip');
  if (!target) return;

  const league = target.dataset.league || '';
  if (elements.leagueFilter) {
    elements.leagueFilter.value = league;
  }

  container.querySelectorAll('.hero-chip').forEach((chipEl) => {
    chipEl.classList.toggle(
      'active',
      chipEl === target || (!league && chipEl.dataset.league === '')
    );
  });

  renderMatches();

  elements.matchesGrid?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function createMatchCard(match) {
  const home =
    match.teams?.home?.name ||
    match.home ||
    match.home_team ||
    match.team1 ||
    'Home';
  const away =
    match.teams?.away?.name ||
    match.away ||
    match.away_team ||
    match.team2 ||
    'Away';
  const homeLogo =
    match.teams?.home?.badge ||
    match.home_logo ||
    match.home_badge ||
    match.team1_logo ||
    '';
  const awayLogo =
    match.teams?.away?.badge ||
    match.away_logo ||
    match.away_badge ||
    match.team2_logo ||
    '';
  const league = getLeagueName(match) || 'Football';
  const status = match.status || '';
  const isLiveNow = isLive(match);

  const kickoff =
    match.timestamp ||
    match.kickoff ||
    match.start_time ||
    match.date ||
    match.time ||
    match.match_time ||
    '';
  const score =
    match.score?.display ||
    match.score ||
    (match.home_score != null && match.away_score != null
      ? `${match.home_score} - ${match.away_score}`
      : 'vs');

  const card = document.createElement('article');
  card.className = 'match-card';
  card.dataset.matchId = match.id || match.match_id || '';

  card.innerHTML = `
    <div class="match-top">
      <span class="league-tag">${escapeHtml(league)}</span>
      <span class="time-tag">${escapeHtml(formatKickoff(kickoff))}</span>
    </div>
    <div class="match-center">
      <div class="team-block">
        <div class="team-row">
          ${
            homeLogo
              ? `<img src="${homeLogo}" class="team-logo" alt="${escapeHtml(
                  home
                )} logo">`
              : ''
          }
          <div>
            <div class="team-name">${escapeHtml(home)}</div>
            <div class="team-side">Home</div>
          </div>
        </div>
      </div>
      <div class="score-box">
        <div>${escapeHtml(score)}</div>
        <div class="score-status">${escapeHtml(formatStatus(status, isLiveNow))}</div>
      </div>
      <div class="team-block" style="text-align:right">
        <div class="team-row team-row-right">
          <div>
            <div class="team-name">${escapeHtml(away)}</div>
            <div class="team-side">Away</div>
          </div>
          ${
            awayLogo
              ? `<img src="${awayLogo}" class="team-logo" alt="${escapeHtml(
                  away
                )} logo">`
              : ''
          }
        </div>
      </div>
    </div>
    <div class="match-bottom">
      <div class="chip-row">
        <span class="chip">${state.mode === 'live' ? 'Live' : 'Upcoming'}</span>
        ${isLiveNow ? '<span class="chip">In-Play</span>' : ''}
      </div>
      <button class="btn-watch" type="button">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        <span>Watch</span>
      </button>
    </div>
  `;

  const watchBtn = card.querySelector('.btn-watch');
  watchBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    openStreamForMatch(match);
  });

  card.addEventListener('click', () => {
    openStreamForMatch(match);
  });

  return card;
}

function formatKickoff(raw) {
  if (!raw) return 'Time TBC';

  const timestamp = typeof raw === 'number' ? raw : Number(raw);
  const d = Number.isNaN(timestamp) ? new Date(raw) : new Date(timestamp);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return raw;
}

function formatStatus(status, live) {
  if (!status && live) return 'Live';
  if (!status) return 'Scheduled';
  const lower = String(status).toLowerCase();
  if (lower.includes('ft')) return 'Full time';
  if (lower.includes('ht')) return 'Half-time';
  if (live) return 'Live';
  return status;
}

async function openStreamForMatch(match) {
  const id = match.id || match.match_id;
  if (!id) {
    console.warn('Missing match id for stream detail');
    return;
  }

  elements.streamModalTitle.textContent = `${match.home || match.home_team || match.teams?.home?.name || 'Home'} vs ${
    match.away || match.away_team || match.teams?.away?.name || 'Away'
  }`;
  elements.streamModalSubtitle.textContent = getLeagueName(match);
  elements.streamModalStatus.textContent = isLive(match) ? 'LIVE' : 'UPCOMING';

  elements.streamWrapper.innerHTML =
    '<div class="stream-loading">Loading stream…</div>';
  openModal(elements.streamModal);

  try {
    const params = new URLSearchParams();
    params.set('type', 'detail');
    params.set('id', String(id));
    params.set('api_key', API_KEY);

    const url = `${API_BASE}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Detail error: ${res.status}`);
    const json = await res.json();

    // V2 detail shape: { success, data: { match_info, sources: [ { embedUrl, ... } ], info: {...} } }
    const data = json?.data || {};
    const candidateStreams = Array.isArray(data.sources)
      ? data.sources
      : [];

    const first = candidateStreams[0] || null;
    const embedUrl =
      typeof first === 'string'
        ? first
        : first?.embedUrl ||
          first?.embed ||
          first?.url ||
          first?.src ||
          '';

    if (!embedUrl) {
      elements.streamWrapper.innerHTML =
        '<div class="empty-state"><h3>No stream available</h3><p>Try again closer to kick-off or choose another match.</p></div>';
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.allowFullscreen = true;
    iframe.setAttribute('allow', 'encrypted-media; fullscreen');

    elements.streamWrapper.innerHTML = '';
    elements.streamWrapper.appendChild(iframe);
  } catch (err) {
    console.error('Failed to load stream detail', err);
    elements.streamWrapper.innerHTML =
      '<div class="empty-state"><h3>Unable to load stream</h3><p>We could not retrieve a working embed URL. Please try another match.</p></div>';
  }
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function attachModalListeners() {
  const modal = elements.streamModal;
  if (!modal) return;

  elements.streamModalClose?.addEventListener('click', () => closeModal(modal));

  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
      closeModal(modal);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      closeModal(modal);
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', init);

