import React, { useEffect, useMemo, useRef, useState } from 'react';
import matchTeamOwner from './matchTeamOwner';
import orderTeams from './orderTeams';
import buildTeamCardStats, { getCompletedWeek } from './buildTeamCardStats';
import { availableWeeks } from './rankUtils';
import PowerRankingsList from './PowerRankingsList';
import './App.css';

const ADMIN_TOKEN_KEY = 'adminToken';

function hasAdminGate() {
  return new URLSearchParams(window.location.search).has('admin');
}

function resolveWeeks(rankings, completedWeek) {
  const weeks = { ...(rankings.weeks || {}) };

  if (
    rankings.legacy &&
    (rankings.legacy.teamIds?.length ||
      Object.keys(rankings.legacy.blurbs || {}).length ||
      Object.keys(rankings.legacy.names || {}).length)
  ) {
    const key = String(completedWeek);
    if (!weeks[key]) {
      weeks[key] = {
        teamIds: rankings.legacy.teamIds || [],
        blurbs: rankings.legacy.blurbs || {},
        names: rankings.legacy.names || {}
      };
    }
  }

  return weeks;
}

export default function App() {
  const [allTeams, setAllTeams] = useState([]);
  const [leagueData, setLeagueData] = useState(null);
  const [rosterWeek, setRosterWeek] = useState(null);
  const [weeks, setWeeks] = useState({});
  const [activeWeek, setActiveWeek] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
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
  const weeksRef = useRef({});
  const selectedWeekRef = useRef(null);

  const isAdmin = Boolean(adminToken);
  const showAdminPanel = showAdminGate || isAdmin;

  const weekKeys = useMemo(() => availableWeeks(weeks), [weeks]);
  const draftWeek = activeWeek != null ? activeWeek + 1 : null;
  const visibleWeekKeys = useMemo(() => {
    const released =
      activeWeek == null
        ? weekKeys
        : weekKeys.filter((week) => week <= activeWeek);

    if (!isAdmin || draftWeek == null) {
      return released;
    }

    if (released.includes(draftWeek)) {
      return released;
    }

    return [...released, draftWeek].sort((a, b) => a - b);
  }, [weekKeys, activeWeek, isAdmin, draftWeek]);

  const weekData = weeks[String(selectedWeek)] || {
    teamIds: [],
    blurbs: {},
    names: {}
  };
  const isDraftWeek =
    isAdmin && draftWeek != null && selectedWeek === draftWeek;
  const teams = useMemo(
    () => orderTeams(allTeams, weekData.teamIds || []),
    [allTeams, weekData.teamIds]
  );
  const previousTeamIds = weeks[String(selectedWeek - 1)]?.teamIds || [];
  const teamNames = useMemo(
    () => weekData.names || {},
    [weekData.names]
  );
  const cardStats = useMemo(
    () =>
      leagueData && allTeams.length && rosterWeek === selectedWeek
        ? buildTeamCardStats(leagueData, allTeams, selectedWeek, teamNames)
        : null,
    [leagueData, allTeams, selectedWeek, rosterWeek, teamNames]
  );

  function snapshotTeamNames(teamList = allTeams) {
    return Object.fromEntries(
      teamList.map((team) => [String(team.id), team.name])
    );
  }

  useEffect(() => {
    weeksRef.current = weeks;
  }, [weeks]);

  useEffect(() => {
    selectedWeekRef.current = selectedWeek;
  }, [selectedWeek]);

  useEffect(() => {
    let cancelled = false;

    async function loadLeague() {
      try {
        const leagueUrl =
          selectedWeek != null
            ? `/api/league?scoringPeriodId=${selectedWeek}`
            : '/api/league';

        const [leagueRes, rankingsRes] = await Promise.all([
          fetch(leagueUrl),
          fetch('/api/rankings')
        ]);

        if (!leagueRes.ok) {
          let message = 'Failed to load league data';
          try {
            const body = await leagueRes.json();
            if (body?.error) message = body.error;
            if (body?.details) message = `${message}: ${body.details}`;
          } catch {
            // ignore JSON parse errors
          }
          throw new Error(message);
        }
        if (!rankingsRes.ok) {
          let message = 'Failed to load rankings';
          try {
            const body = await rankingsRes.json();
            if (body?.error) message = body.error;
            if (body?.details) message = `${message}: ${body.details}`;
          } catch {
            // ignore JSON parse errors
          }
          throw new Error(message);
        }

        const data = await leagueRes.json();
        const rankings = await rankingsRes.json();
        if (cancelled) return;

        const members = (data.members || []).map((member) => ({
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName
        }));
        const mapped = matchTeamOwner(data.teams || [], members);
        const completedWeek = getCompletedWeek(data);
        const nextWeeks = resolveWeeks(rankings, completedWeek);
        const keys = availableWeeks(nextWeeks);
        const initialWeek =
          rankings.activeWeek && nextWeeks[String(rankings.activeWeek)]
            ? rankings.activeWeek
            : keys.length
              ? keys[keys.length - 1]
              : completedWeek;

        if (!nextWeeks[String(initialWeek)]) {
          nextWeeks[String(initialWeek)] = { teamIds: [], blurbs: {} };
        }

        setLeagueData(data);
        setAllTeams(mapped);
        setActiveWeek(
          rankings.activeWeek != null ? Number(rankings.activeWeek) : initialWeek
        );
        if (selectedWeek != null) {
          setRosterWeek(selectedWeek);
        }

        if (!localStorage.getItem(ADMIN_TOKEN_KEY)) {
          setWeeks(nextWeeks);
        } else {
          setWeeks((prev) => {
            const next = Object.keys(prev).length ? prev : nextWeeks;
            weeksRef.current = next;
            return next;
          });
        }

        setSelectedWeek((prev) => prev ?? initialWeek);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLeague();
    const id = setInterval(loadLeague, 60_000);

    return () => {
      cancelled = true;
      clearInterval(id);
      if (blurbTimer.current) clearTimeout(blurbTimer.current);
    };
  }, [selectedWeek]);

  async function saveRankings(payload) {
    const res = await fetch('/api/rankings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      if (res.status === 401) {
        handleLock();
        throw new Error('Admin session expired. Log in again.');
      }
      throw new Error('Failed to save rankings');
    }

    return res.json();
  }

  function updateWeekLocal(week, patch) {
    setWeeks((prev) => {
      const key = String(week);
      const current = prev[key] || { teamIds: [], blurbs: {}, names: {} };
      const next = {
        ...prev,
        [key]: {
          teamIds: patch.teamIds ?? current.teamIds,
          blurbs: patch.blurbs ?? current.blurbs,
          names: patch.names ?? current.names
        }
      };
      weeksRef.current = next;
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

      if (!res.ok) {
        throw new Error('Invalid password');
      }

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
    if (draftWeek != null && selectedWeek === draftWeek && activeWeek != null) {
      setSelectedWeek(activeWeek);
    }
  }

  async function handleReorder(nextTeams) {
    const week = selectedWeekRef.current;
    const teamIds = nextTeams.map((team) => team.id);
    updateWeekLocal(week, { teamIds });
    setSaveError(null);

    try {
      // Don't auto-release draft weeks to the public
      const payload = { week, teamIds };
      if (activeWeek != null && week <= activeWeek) {
        payload.activeWeek = activeWeek;
      }
      await saveRankings(payload);
    } catch (err) {
      setSaveError(err.message);
    }
  }

  function handleSelectWeek(week) {
    if (
      isAdmin &&
      draftWeek != null &&
      week === draftWeek &&
      !weeksRef.current[String(week)]
    ) {
      const prev = weeksRef.current[String(activeWeek)] || {
        teamIds: allTeams.map((team) => team.id),
        blurbs: {},
        names: {}
      };
      updateWeekLocal(week, {
        teamIds: prev.teamIds?.length
          ? prev.teamIds
          : allTeams.map((team) => team.id),
        blurbs: {},
        names: snapshotTeamNames()
      });
    }
    setSelectedWeek(week);
  }

  function handleBlurbChange(teamId, value) {
    const week = selectedWeekRef.current;
    const key = String(week);
    const current = weeksRef.current[key] || { teamIds: [], blurbs: {} };
    const blurbs = { ...current.blurbs, [String(teamId)]: value };
    updateWeekLocal(week, { blurbs });

    if (blurbTimer.current) clearTimeout(blurbTimer.current);
    blurbTimer.current = setTimeout(() => {
      setSaveError(null);
      saveRankings({
        week,
        blurbs: weeksRef.current[key]?.blurbs || blurbs
      }).catch((err) => {
        setSaveError(err.message);
      });
    }, 500);
  }

  async function handleReleaseWeek() {
    if (selectedWeek == null) return;
    const key = String(selectedWeek);
    const names = snapshotTeamNames();
    const current = weeksRef.current[key] || {
      teamIds: teams.map((team) => team.id),
      blurbs: {},
      names: {}
    };
    updateWeekLocal(selectedWeek, { names });
    setSaveError(null);

    try {
      await saveRankings({
        week: selectedWeek,
        teamIds: current.teamIds,
        blurbs: current.blurbs,
        names,
        activeWeek: selectedWeek
      });
      setActiveWeek(selectedWeek);
    } catch (err) {
      setSaveError(err.message);
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>Lakewood Legends Power Rankings</h1>
        {showAdminPanel && (
          <div className="admin-panel">
            {isAdmin ? (
              <>
                <p className="admin-panel__status">
                  Editing week {selectedWeek}
                  {isDraftWeek ? ' (unpublished draft)' : ''}
                </p>
                {isDraftWeek && (
                  <button type="button" onClick={handleReleaseWeek}>
                    Release week
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
              <p className="admin-panel__status admin-panel__error">{adminError}</p>
            )}
            {saveError && (
              <p className="admin-panel__status admin-panel__error">{saveError}</p>
            )}
          </div>
        )}
      </header>

      {!loading && !error && (
        <nav className="week-nav" aria-label="Power ranking weeks">
          {visibleWeekKeys.map((week) => {
            const isDraft = isAdmin && draftWeek != null && week === draftWeek;
            return (
              <button
                key={week}
                type="button"
                className={[
                  'week-nav__btn',
                  week === selectedWeek ? 'is-active' : '',
                  isDraft ? 'is-draft' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleSelectWeek(week)}
              >
                Week {week}
                {isDraft ? ' (draft)' : ''}
              </button>
            );
          })}
        </nav>
      )}

      {loading && <p>Loading league…</p>}
      {error && <p>Error: {error}</p>}
      {!loading && !error && (
        <PowerRankingsList
          teams={teams}
          isAdmin={isAdmin}
          onReorder={handleReorder}
          cardStats={cardStats}
          blurbs={weekData.blurbs || {}}
          teamNames={teamNames}
          onBlurbChange={handleBlurbChange}
          previousTeamIds={previousTeamIds}
        />
      )}
    </div>
  );
}
