import React, { useEffect, useMemo, useRef, useState } from 'react';
import matchTeamOwner from './matchTeamOwner';
import orderTeams from './orderTeams';
import buildTeamCardStats from './buildTeamCardStats';
import PowerRankingsList from './PowerRankingsList';
import {
  CREATE_TYPE_OPTIONS,
  EDITION_TYPES,
  previousEditionId,
  scoringPeriodForEdition,
  seasonStamp,
  usesEspnMatchup
} from './editionUtils';
import './App.css';

const ADMIN_TOKEN_KEY = 'adminToken';

function hasAdminGate() {
  return new URLSearchParams(window.location.search).has('admin');
}

function teamsFromEdition(edition, espnTeams) {
  if (!edition) return [];
  const names = edition.names || {};
  const owners = edition.owners || {};
  const ids = edition.teamIds || [];

  if (espnTeams?.length) {
    return orderTeams(espnTeams, ids).map((team) => ({
      ...team,
      name: names[String(team.id)] || names[team.id] || team.name,
      owner: owners[String(team.id)] || owners[team.id] || team.owner
    }));
  }

  return ids.map((id) => ({
    id,
    name: names[String(id)] || names[id] || String(id),
    owner: owners[String(id)] || owners[id] || 'Unknown'
  }));
}

export default function App() {
  const [espnTeams, setEspnTeams] = useState([]);
  const [leagueData, setLeagueData] = useState(null);
  const [rosterEditionId, setRosterEditionId] = useState(null);
  const [yearList, setYearList] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [live, setLive] = useState(true);
  const [editions, setEditions] = useState([]);
  const [activeEditionId, setActiveEditionId] = useState(null);
  const [selectedEditionId, setSelectedEditionId] = useState(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem(ADMIN_TOKEN_KEY) || ''
  );
  const [showAdminGate] = useState(hasAdminGate);
  const [password, setPassword] = useState('');
  const [adminError, setAdminError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const blurbTimer = useRef(null);
  const introTimer = useRef(null);
  const editionsRef = useRef([]);
  const selectedEditionRef = useRef(null);

  const isAdmin = showAdminGate && Boolean(adminToken);
  const showAdminPanel = showAdminGate;

  const selectedEdition = useMemo(
    () => editions.find((e) => e.id === selectedEditionId) || null,
    [editions, selectedEditionId]
  );

  const activeOrder = useMemo(() => {
    const active = editions.find((e) => e.id === activeEditionId);
    return active?.order ?? -1;
  }, [editions, activeEditionId]);

  const visibleEditions = useMemo(() => {
    if (isAdmin) {
      return [...editions].sort((a, b) => a.order - b.order);
    }
    return editions
      .filter((e) => e.order <= activeOrder)
      .sort((a, b) => a.order - b.order);
  }, [editions, activeOrder, isAdmin]);

  const isUnpublished =
    isAdmin &&
    selectedEdition != null &&
    selectedEdition.order > activeOrder;

  const teams = useMemo(
    () => teamsFromEdition(selectedEdition, live ? espnTeams : null),
    [selectedEdition, live, espnTeams]
  );

  const prevId = previousEditionId(editions, selectedEditionId);
  const previousTeamIds =
    editions.find((e) => e.id === prevId)?.teamIds || [];

  const teamNames = useMemo(
    () => selectedEdition?.names || {},
    [selectedEdition]
  );
  const blurbs = selectedEdition?.blurbs || {};
  const teamMeta = selectedEdition?.meta || {};

  const cardStats = useMemo(() => {
    if (
      !usesEspnMatchup(selectedEdition, live) ||
      !leagueData ||
      !espnTeams.length ||
      rosterEditionId !== selectedEditionId
    ) {
      return null;
    }
    const week = scoringPeriodForEdition(selectedEdition);
    return buildTeamCardStats(leagueData, espnTeams, week, teamNames);
  }, [
    selectedEdition,
    live,
    leagueData,
    espnTeams,
    rosterEditionId,
    selectedEditionId,
    teamNames
  ]);

  function snapshotTeamNames(teamList = espnTeams) {
    return Object.fromEntries(
      teamList.map((team) => [String(team.id), team.name])
    );
  }

  useEffect(() => {
    editionsRef.current = editions;
  }, [editions]);

  useEffect(() => {
    selectedEditionRef.current = selectedEditionId;
  }, [selectedEditionId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const yearQuery =
          selectedYear != null ? `?year=${selectedYear}` : '';
        const rankingsRes = await fetch(`/api/rankings${yearQuery}`);
        if (!rankingsRes.ok) {
          let message = 'Failed to load rankings';
          try {
            const body = await rankingsRes.json();
            if (body?.error) message = body.error;
            if (body?.details) message = `${message}: ${body.details}`;
          } catch {
            // ignore
          }
          throw new Error(message);
        }

        const rankings = await rankingsRes.json();
        if (cancelled) return;

        const year = rankings.year;
        const isLive = Boolean(rankings.live);
        const nextEditions = rankings.editions || [];
        const activeId = rankings.activeEditionId;
        setYearList(rankings.years || []);
        setSelectedYear(year);
        setLive(isLive);
        setActiveEditionId(activeId);
        setEditions(nextEditions);
        editionsRef.current = nextEditions;

        setSelectedEditionId((prev) => {
          if (prev && nextEditions.some((e) => e.id === prev)) return prev;
          return activeId || nextEditions[nextEditions.length - 1]?.id || null;
        });

        if (isLive) {
          const edition =
            nextEditions.find((e) => e.id === (selectedEditionRef.current || activeId)) ||
            nextEditions.find((e) => e.id === activeId);
          const scoringPeriodId = scoringPeriodForEdition(edition);
          const leagueUrl =
            scoringPeriodId != null
              ? `/api/league?scoringPeriodId=${scoringPeriodId}`
              : '/api/league';
          const leagueRes = await fetch(leagueUrl);
          if (!leagueRes.ok) {
            let message = 'Failed to load league data';
            try {
              const body = await leagueRes.json();
              if (body?.error) message = body.error;
              if (body?.details) message = `${message}: ${body.details}`;
            } catch {
              // ignore
            }
            throw new Error(message);
          }
          const data = await leagueRes.json();
          if (cancelled) return;
          const members = (data.members || []).map((member) => ({
            id: member.id,
            firstName: member.firstName,
            lastName: member.lastName
          }));
          setLeagueData(data);
          setEspnTeams(matchTeamOwner(data.teams || [], members));
          setRosterEditionId(edition?.id || activeId);
        } else {
          setLeagueData(null);
          setEspnTeams([]);
          setRosterEditionId(null);
        }

        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (blurbTimer.current) clearTimeout(blurbTimer.current);
      if (introTimer.current) clearTimeout(introTimer.current);
    };
  }, [selectedYear, selectedEditionId, showAdminGate]);

  async function saveRankings(payload) {
    const res = await fetch('/api/rankings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ year: selectedYear, ...payload })
    });

    if (!res.ok) {
      if (res.status === 401) {
        handleLock();
        throw new Error('Admin session expired. Log in again.');
      }
      let message = 'Failed to save rankings';
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
        if (body?.details) message = `${message}: ${body.details}`;
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    const data = await res.json();
    setEditions(data.editions || []);
    editionsRef.current = data.editions || [];
    setActiveEditionId(data.activeEditionId);
    setLive(Boolean(data.live));
    setYearList(data.years || []);
    return data;
  }

  function updateEditionLocal(editionId, patch) {
    setEditions((prev) => {
      const next = prev.map((edition) => {
        if (edition.id !== editionId) return edition;
        const updated = {
          ...edition,
          teamIds: patch.teamIds ?? edition.teamIds,
          blurbs: patch.blurbs ?? edition.blurbs,
          names: patch.names ?? edition.names,
          owners: patch.owners ?? edition.owners,
          meta: patch.meta ?? edition.meta
        };
        if (patch.intro !== undefined) {
          updated.intro = patch.intro;
        }
        return updated;
      });
      editionsRef.current = next;
      return next;
    });
  }

  async function handleLogin(event) {
    event.preventDefault();
    setAdminError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok) throw new Error('Invalid password');
      const data = await res.json();
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setAdminToken(data.token);
      setPassword('');
    } catch (err) {
      setAdminError(err.message);
    }
  }

  function handleLock() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken('');
    setAdminError(null);
    setSaveError(null);
    setShowTypePicker(false);
    if (activeEditionId) setSelectedEditionId(activeEditionId);
  }

  async function handleReorder(nextTeams) {
    const editionId = selectedEditionRef.current;
    const teamIds = nextTeams.map((team) => team.id);
    updateEditionLocal(editionId, { teamIds });
    setSaveError(null);
    try {
      const payload = { editionId, teamIds };
      if (activeEditionId && editionId === activeEditionId) {
        payload.activeEditionId = activeEditionId;
      }
      await saveRankings(payload);
    } catch (err) {
      setSaveError(err.message);
    }
  }

  function handleSelectEdition(editionId) {
    setSelectedEditionId(editionId);
    setShowTypePicker(false);
  }

  function handleIntroChange(value) {
    const editionId = selectedEditionRef.current;
    updateEditionLocal(editionId, { intro: value });
    if (introTimer.current) clearTimeout(introTimer.current);
    introTimer.current = setTimeout(() => {
      setSaveError(null);
      const edition = editionsRef.current.find((e) => e.id === editionId);
      saveRankings({
        editionId,
        intro: typeof edition?.intro === 'string' ? edition.intro : value
      }).catch((err) => setSaveError(err.message));
    }, 500);
  }

  function handleBlurbChange(teamId, value) {
    const editionId = selectedEditionRef.current;
    const edition = editionsRef.current.find((e) => e.id === editionId) || {
      blurbs: {}
    };
    const nextBlurbs = { ...edition.blurbs, [String(teamId)]: value };
    updateEditionLocal(editionId, { blurbs: nextBlurbs });
    if (blurbTimer.current) clearTimeout(blurbTimer.current);
    blurbTimer.current = setTimeout(() => {
      setSaveError(null);
      const latest = editionsRef.current.find((e) => e.id === editionId);
      saveRankings({
        editionId,
        blurbs: latest?.blurbs || nextBlurbs
      }).catch((err) => setSaveError(err.message));
    }, 500);
  }

  async function handleCreateEdition(type) {
    setSaveError(null);
    setShowTypePicker(false);
    try {
      const active = editionsRef.current.find((e) => e.id === activeEditionId);
      const data = await saveRankings({
        create: true,
        type,
        teamIds: active?.teamIds?.length
          ? active.teamIds
          : espnTeams.map((t) => t.id),
        names: live ? snapshotTeamNames() : active?.names || {},
        owners: active?.owners || {},
        blurbs: {}
      });
      const created = [...(data.editions || [])].sort(
        (a, b) => b.order - a.order
      )[0];
      if (created) {
        setSelectedEditionId(created.id);
      }
    } catch (err) {
      setSaveError(err.message);
    }
  }

  async function handleReleaseEdition() {
    if (!selectedEditionId) return;
    const edition = editionsRef.current.find((e) => e.id === selectedEditionId);
    if (!edition) return;
    setSaveError(null);
    try {
      const names = live
        ? { ...edition.names, ...snapshotTeamNames() }
        : edition.names || {};
      await saveRankings({
        editionId: selectedEditionId,
        teamIds: edition.teamIds,
        blurbs: edition.blurbs,
        names,
        owners: edition.owners,
        intro: edition.intro || '',
        activeEditionId: selectedEditionId
      });
      setActiveEditionId(selectedEditionId);
    } catch (err) {
      setSaveError(err.message);
    }
  }

  function handleYearChange(year) {
    setLoading(true);
    setShowTypePicker(false);
    setSelectedEditionId(null);
    setSelectedYear(year);
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__title-block">
          <h1>Lakewood Legends Power Rankings</h1>
          {yearList.length > 0 && (
            <div className="season-stamp" role="group" aria-label="Season">
              {yearList.map((entry) => (
                <button
                  key={entry.year}
                  type="button"
                  className={[
                    'season-stamp__btn',
                    entry.year === selectedYear ? 'is-active' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleYearChange(entry.year)}
                >
                  {entry.label || seasonStamp(entry.year)}
                </button>
              ))}
            </div>
          )}
        </div>
        {showAdminPanel && (
          <div className="admin-panel">
            {isAdmin ? (
              <>
                <p className="admin-panel__status">
                  Editing {selectedEdition?.label || 'edition'}
                  {isUnpublished ? ' (unpublished)' : ''}
                </p>
                {live && (
                  <button
                    type="button"
                    onClick={() => setShowTypePicker((v) => !v)}
                  >
                    New edition
                  </button>
                )}
                {isUnpublished && (
                  <button type="button" onClick={handleReleaseEdition}>
                    Release
                  </button>
                )}
                <button type="button" className="secondary" onClick={handleLock}>
                  Lock
                </button>
              </>
            ) : (
              showAdminGate && (
                <form onSubmit={handleLogin}>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Admin password"
                    aria-label="Admin password"
                  />
                  <button type="submit">Edit rankings</button>
                </form>
              )
            )}
            {adminError && (
              <p className="admin-panel__status admin-panel__error">
                {adminError}
              </p>
            )}
            {saveError && (
              <p className="admin-panel__status admin-panel__error">
                {saveError}
              </p>
            )}
          </div>
        )}
      </header>

      {isAdmin && showTypePicker && (
        <div className="edition-type-picker" role="dialog" aria-label="New edition type">
          <p className="edition-type-picker__label">Create next rankings as:</p>
          <div className="edition-type-picker__options">
            {CREATE_TYPE_OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                onClick={() => handleCreateEdition(option.type)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && (
        <nav className="week-nav" aria-label="Power ranking editions">
          {visibleEditions.map((edition) => {
            const isDraft = isAdmin && edition.order > activeOrder;
            return (
              <button
                key={edition.id}
                type="button"
                className={[
                  'week-nav__btn',
                  edition.id === selectedEditionId ? 'is-active' : '',
                  isDraft ? 'is-draft' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleSelectEdition(edition.id)}
              >
                {edition.label}
                {isDraft ? ' (draft)' : ''}
              </button>
            );
          })}
        </nav>
      )}

      {loading && <p>Loading…</p>}
      {error && <p>Error: {error}</p>}
      {!loading && !error && isAdmin && (
        <label className="week-intro-edit">
          <span className="week-intro-edit__label">Edition intro</span>
          <textarea
            className="week-intro-edit__input"
            value={selectedEdition?.intro || ''}
            placeholder="Optional text above this edition’s rankings…"
            rows={3}
            onChange={(e) => handleIntroChange(e.target.value)}
          />
        </label>
      )}
      {!loading && !error && !isAdmin && selectedEdition?.intro && (
        <p className="week-intro">{selectedEdition.intro}</p>
      )}
      {!loading && !error && selectedEdition && (
        <PowerRankingsList
          teams={teams}
          isAdmin={isAdmin}
          onReorder={handleReorder}
          cardStats={cardStats}
          blurbs={blurbs}
          teamMeta={teamMeta}
          teamNames={teamNames}
          onBlurbChange={handleBlurbChange}
          previousTeamIds={previousTeamIds}
          editionType={selectedEdition.type || EDITION_TYPES.week}
          editionLabel={selectedEdition.label || ''}
          live={live}
        />
      )}
    </div>
  );
}
