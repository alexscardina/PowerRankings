import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useDraftField from './useDraftField';
import matchTeamOwner from './matchTeamOwner';
import orderTeams from './orderTeams';
import buildTeamCardStats, {
  buildMidseasonCardStats
} from './buildTeamCardStats';
import PowerRankingsList from './PowerRankingsList';
import {
  CREATE_TYPE_OPTIONS,
  EDITION_TYPES,
  previousEditionId,
  isDefaultWeekLabel,
  labelForResultWeeks,
  resultWeeksForEdition,
  scoringPeriodForEdition,
  seasonStamp,
  usesEspnMatchup,
  usesEspnSeasonStats
} from './editionUtils';
import './App.css';

const ADMIN_TOKEN_KEY = 'adminToken';

function hasAdminGate() {
  return new URLSearchParams(window.location.search).has('admin');
}

function mergeRemoteEditions(remote, local) {
  const localById = new Map((local || []).map((edition) => [edition.id, edition]));
  return (remote || []).map((edition) => {
    const current = localById.get(edition.id);
    if (!current) return edition;
    return {
      ...edition,
      teamIds: current.teamIds,
      blurbs: current.blurbs,
      names: current.names,
      owners: current.owners,
      meta: current.meta,
      intro: current.intro,
      label: current.label,
      weeks: current.weeks,
      week: current.week
    };
  });
}

function archivalTeams(edition) {
  const names = edition.names || {};
  const owners = edition.owners || {};
  return (edition.teamIds || []).map((id) => ({
    id,
    name: names[String(id)] || names[id] || String(id),
    owner: owners[String(id)] || owners[id] || 'Unknown'
  }));
}

function ResultWeeksEditor({ weeks, onAdd, onRemove }) {
  const canRemove = weeks.length > 1;
  return (
    <div className="result-weeks-edit">
      <span className="week-intro-edit__label">Result weeks</span>
      <div className="result-weeks-edit__row">
        {weeks.map((week) => (
          <button
            key={week}
            type="button"
            className="result-weeks-edit__chip"
            onClick={() => onRemove(week)}
            title={
              canRemove ? `Remove week ${week}` : 'At least one week is required'
            }
            disabled={!canRemove}
          >
            Week {week}
            {canRemove ? ' ×' : ''}
          </button>
        ))}
        <button type="button" className="result-weeks-edit__add" onClick={onAdd}>
          Add week
        </button>
      </div>
    </div>
  );
}

function teamsFromEdition(edition, espnTeams) {
  if (!edition) return [];
  const names = edition.names || {};
  const owners = edition.owners || {};
  const ids = edition.teamIds || [];

  if (espnTeams?.length) {
    const espnIds = new Set(espnTeams.map((team) => String(team.id)));
    const overlap = ids.some((id) => espnIds.has(String(id)));
    // Past seasons use slug ids. Don't substitute this year's ESPN teams
    // when none of the edition's ids belong to the live league.
    if (overlap) {
      return orderTeams(espnTeams, ids).map((team) => ({
        ...team,
        name: names[String(team.id)] || names[team.id] || team.name,
        owner: owners[String(team.id)] || owners[team.id] || team.owner
      }));
    }
  }

  return archivalTeams(edition);
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
  const metaTimer = useRef(null);
  const labelTimer = useRef(null);
  const editionsRef = useRef([]);
  const selectedEditionRef = useRef(null);
  const selectedYearRef = useRef(null);
  const editionsYearRef = useRef(null);
  const savesInFlightRef = useRef(0);
  const liveRef = useRef(true);
  const activeEditionIdRef = useRef(null);

  const hasUnsavedEdits = useCallback(
    () =>
      Boolean(
        blurbTimer.current ||
          introTimer.current ||
          metaTimer.current ||
          labelTimer.current ||
          savesInFlightRef.current > 0
      ),
    []
  );

  const applyRemoteEditions = useCallback(
    (remote, { force = false, year = null } = {}) => {
      setEditions((prev) => {
        const sameYear =
          year == null ||
          editionsYearRef.current == null ||
          Number(year) === Number(editionsYearRef.current);
        const next =
          sameYear && !force && hasUnsavedEdits()
            ? mergeRemoteEditions(remote, prev)
            : remote || [];
        editionsRef.current = next;
        if (year != null) editionsYearRef.current = Number(year);
        return next;
      });
    },
    [hasUnsavedEdits]
  );

  const isAdmin = showAdminGate && Boolean(adminToken);
  const showAdminPanel = showAdminGate;

  const selectedEdition = useMemo(
    () => editions.find((e) => e.id === selectedEditionId) || null,
    [editions, selectedEditionId]
  );

  const visibleEditions = useMemo(() => {
    const sorted = [...editions].sort((a, b) => a.order - b.order);
    if (isAdmin) return sorted;
    return sorted.filter((edition) => edition.published !== false);
  }, [editions, isAdmin]);

  const isUnpublished =
    isAdmin && selectedEdition != null && selectedEdition.published === false;

  const canDeleteSelected =
    isAdmin &&
    selectedEdition != null &&
    (isUnpublished || selectedEdition.type === EDITION_TYPES.week);

  const teams = useMemo(
    () => teamsFromEdition(selectedEdition, live ? espnTeams : null),
    [selectedEdition, live, espnTeams]
  );

  const prevId = previousEditionId(
    editions.filter(
      (edition) =>
        edition.published !== false || edition.id === selectedEditionId
    ),
    selectedEditionId
  );
  const previousTeamIds =
    editions.find((e) => e.id === prevId)?.teamIds || [];

  const teamNames = useMemo(
    () => selectedEdition?.names || {},
    [selectedEdition]
  );
  const blurbs = selectedEdition?.blurbs || {};
  const teamMeta = selectedEdition?.meta || {};
  const editionResetKey = `${selectedYear || ''}:${selectedEditionId || ''}`;
  const [draftIntro, setDraftIntro] = useDraftField(
    selectedEdition?.intro || '',
    editionResetKey
  );
  const [draftTitle, setDraftTitle] = useDraftField(
    selectedEdition?.label || '',
    editionResetKey
  );

  const cardStats = useMemo(() => {
    if (
      !live ||
      !leagueData ||
      !espnTeams.length ||
      rosterEditionId !== selectedEditionId
    ) {
      return null;
    }
    const week = scoringPeriodForEdition(selectedEdition);
    if (usesEspnMatchup(selectedEdition, live)) {
      const weeks = resultWeeksForEdition(selectedEdition);
      return buildTeamCardStats(
        leagueData,
        espnTeams,
        weeks.length ? weeks : week,
        teamNames
      );
    }
    if (usesEspnSeasonStats(selectedEdition, live)) {
      return buildMidseasonCardStats(leagueData, espnTeams, week);
    }
    return null;
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
    selectedYearRef.current = selectedYear;
  }, [selectedYear]);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    activeEditionIdRef.current = activeEditionId;
  }, [activeEditionId]);

  useEffect(() => {
    let cancelled = false;

    async function applyRankingsPayload(rankings) {
      const year = rankings.year;
      const isLive = Boolean(rankings.live);
      const nextEditions = rankings.editions || [];
      const activeId = rankings.activeEditionId;
      setYearList(rankings.years || []);
      setSelectedYear(year);
      setLive(isLive);
      setActiveEditionId(activeId);
      applyRemoteEditions(nextEditions, { year });

      setSelectedEditionId((prev) => {
        if (prev && nextEditions.some((e) => e.id === prev)) return prev;
        return activeId || nextEditions[nextEditions.length - 1]?.id || null;
      });

      return { isLive, nextEditions, activeId };
    }

    async function loadLeague(isLive, nextEditions, activeId) {
      if (!isLive) {
        setLeagueData(null);
        setEspnTeams([]);
        setRosterEditionId(null);
        return;
      }

      const edition =
        nextEditions.find((e) => e.id === (selectedEditionRef.current || activeId)) ||
        nextEditions.find((e) => e.id === activeId) ||
        editionsRef.current.find((e) => e.id === selectedEditionRef.current);
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
    }

    async function load({ includeRankings = true } = {}) {
      try {
        let isLive = liveRef.current;
        let nextEditions = editionsRef.current;
        let activeId = activeEditionIdRef.current;

        if (includeRankings) {
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
        if (
          selectedYearRef.current != null &&
          Number(rankings.year) !== Number(selectedYearRef.current)
        ) {
          return;
        }
        const applied = await applyRankingsPayload(rankings);
          isLive = applied.isLive;
          nextEditions = applied.nextEditions;
          activeId = applied.activeId;
        }

        await loadLeague(isLive, nextEditions, activeId);
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load({ includeRankings: true });
    const id = setInterval(() => {
      // Keep ESPN scores fresh, but do not refetch rankings while editing —
      // a stale GET would restore deleted characters in the text fields.
      load({ includeRankings: !isAdmin });
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    selectedYear,
    selectedEditionId,
    showAdminGate,
    isAdmin,
    applyRemoteEditions
  ]);

  async function saveRankings(payload) {
    savesInFlightRef.current += 1;
    try {
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
      if (payload.create) {
        applyRemoteEditions(data.editions || [], {
          force: true,
          year: selectedYearRef.current
        });
      }
      setActiveEditionId(data.activeEditionId);
      setLive(Boolean(data.live));
      setYearList(data.years || []);
      return data;
    } finally {
      savesInFlightRef.current = Math.max(0, savesInFlightRef.current - 1);
    }
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
        if (patch.label !== undefined) {
          updated.label = patch.label;
        }
        if (patch.weeks !== undefined) {
          updated.weeks = patch.weeks;
        }
        if (patch.week !== undefined) {
          updated.week = patch.week;
        }
        if (patch.published !== undefined) {
          updated.published = patch.published;
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

  function queueEditionSave(timerRef, run) {
    const yearAtEdit = selectedYearRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (Number(selectedYearRef.current) !== Number(yearAtEdit)) return;
      setSaveError(null);
      run();
    }, 500);
  }

  function handleLabelChange(value) {
    const editionId = selectedEditionRef.current;
    updateEditionLocal(editionId, { label: value });
    queueEditionSave(labelTimer, () => {
      const edition = editionsRef.current.find((e) => e.id === editionId);
      saveRankings({
        editionId,
        label: typeof edition?.label === 'string' ? edition.label : value
      }).catch((err) => setSaveError(err.message));
    });
  }

  function takenResultWeeks(exceptEditionId) {
    const taken = new Set();
    for (const edition of editionsRef.current || []) {
      if (edition.id === exceptEditionId) continue;
      if (edition.type === EDITION_TYPES.midseason) {
        taken.add(Number(edition.week) || 7);
        continue;
      }
      if (edition.type === EDITION_TYPES.playoff) {
        taken.add(Number(edition.week) || 14);
        continue;
      }
      if (edition.type !== EDITION_TYPES.week) continue;
      for (const week of resultWeeksForEdition(edition)) {
        taken.add(week);
      }
    }
    return taken;
  }

  function handleResultWeeksChange(nextWeeks) {
    const editionId = selectedEditionRef.current;
    const edition = editionsRef.current.find((e) => e.id === editionId);
    if (!edition) return;

    const weeks = [
      ...new Set(
        (nextWeeks || [])
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0)
      )
    ].sort((a, b) => a - b);
    if (!weeks.length) return;

    const week = weeks[weeks.length - 1];
    const patch = { weeks, week };
    const currentLabel =
      typeof edition.label === 'string' ? edition.label : draftTitle;
    if (isDefaultWeekLabel(currentLabel, resultWeeksForEdition(edition))) {
      patch.label = labelForResultWeeks(weeks);
      setDraftTitle(patch.label);
    }
    updateEditionLocal(editionId, patch);
    queueEditionSave(labelTimer, () => {
      const latest = editionsRef.current.find((e) => e.id === editionId);
      saveRankings({
        editionId,
        weeks: latest?.weeks || weeks,
        week: latest?.week ?? week,
        label: latest?.label
      }).catch((err) => setSaveError(err.message));
    });
  }

  function handleAddResultWeek() {
    const editionId = selectedEditionRef.current;
    const current = resultWeeksForEdition(
      editionsRef.current.find((e) => e.id === editionId)
    );
    const taken = takenResultWeeks(editionId);
    for (const week of current) taken.add(week);
    let next = (current[current.length - 1] || 0) + 1;
    while (taken.has(next) && next < 30) next += 1;
    if (next >= 30) return;
    handleResultWeeksChange([...current, next]);
  }

  function handleRemoveResultWeek(weekToRemove) {
    const editionId = selectedEditionRef.current;
    const current = resultWeeksForEdition(
      editionsRef.current.find((e) => e.id === editionId)
    );
    if (current.length <= 1) return;
    handleResultWeeksChange(current.filter((week) => week !== weekToRemove));
  }

  function handleIntroChange(value) {
    const editionId = selectedEditionRef.current;
    updateEditionLocal(editionId, { intro: value });
    queueEditionSave(introTimer, () => {
      const edition = editionsRef.current.find((e) => e.id === editionId);
      saveRankings({
        editionId,
        intro: typeof edition?.intro === 'string' ? edition.intro : value
      }).catch((err) => setSaveError(err.message));
    });
  }

  function snapshotEspnMeta(edition, statsByTeamId) {
    const next = { ...(edition?.meta || {}) };
    for (const [teamId, stats] of Object.entries(statsByTeamId || {})) {
      const key = String(teamId);
      next[key] = {
        ...(next[key] || {}),
        h2hRecord: stats.h2hRecord,
        medianRecord: stats.medianRecord,
        medianWins: stats.medianWins,
        pointsScored: stats.pointsScored,
        record: stats.recordLabel
      };
    }
    return next;
  }

  function handleMetaChange(teamId, patch) {
    const editionId = selectedEditionRef.current;
    const edition = editionsRef.current.find((e) => e.id === editionId) || {
      meta: {}
    };
    const key = String(teamId);
    const nextMeta = {
      ...edition.meta,
      [key]: {
        ...(edition.meta?.[key] || {}),
        ...patch
      }
    };
    updateEditionLocal(editionId, { meta: nextMeta });
    queueEditionSave(metaTimer, () => {
      const latest = editionsRef.current.find((e) => e.id === editionId);
      saveRankings({
        editionId,
        meta: latest?.meta || nextMeta
      }).catch((err) => setSaveError(err.message));
    });
  }

  function handleBlurbChange(teamId, value) {
    const editionId = selectedEditionRef.current;
    const edition = editionsRef.current.find((e) => e.id === editionId) || {
      blurbs: {}
    };
    const nextBlurbs = { ...edition.blurbs, [String(teamId)]: value };
    updateEditionLocal(editionId, { blurbs: nextBlurbs });
    queueEditionSave(blurbTimer, () => {
      const latest = editionsRef.current.find((e) => e.id === editionId);
      saveRankings({
        editionId,
        blurbs: latest?.blurbs || nextBlurbs
      }).catch((err) => setSaveError(err.message));
    });
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

  function clearEditionTimers() {
    for (const timer of [blurbTimer, introTimer, metaTimer, labelTimer]) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }
  }

  async function handleDeleteEdition() {
    if (!selectedEditionId || !canDeleteSelected) return;
    const edition = editionsRef.current.find((e) => e.id === selectedEditionId);
    if (!edition) return;
    const label = edition.label || 'this rankings tab';
    const confirmed = window.confirm(
      isUnpublished
        ? `Delete “${label}”?`
        : `Delete “${label}”? It will be removed for everyone.`
    );
    if (!confirmed) return;

    const editionId = edition.id;
    const deletedOrder = edition.order;
    clearEditionTimers();
    setSaveError(null);
    try {
      const data = await saveRankings({ remove: true, editionId });
      const remaining = (editionsRef.current || []).filter(
        (item) => item.id !== editionId
      );
      setEditions(remaining);
      editionsRef.current = remaining;
      if (data?.activeEditionId) {
        activeEditionIdRef.current = data.activeEditionId;
      }
      const neighbor =
        [...remaining].reverse().find((item) => item.order < deletedOrder) ||
        [...remaining].sort((a, b) => a.order - b.order)[0];
      setSelectedEditionId(neighbor?.id || data?.activeEditionId || null);
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
      const meta =
        usesEspnSeasonStats(edition, live) && cardStats?.byTeamId
          ? snapshotEspnMeta(edition, cardStats.byTeamId)
          : edition.meta;
      await saveRankings({
        editionId: selectedEditionId,
        teamIds: edition.teamIds,
        blurbs: edition.blurbs,
        names,
        owners: edition.owners,
        meta,
        intro: edition.intro || '',
        activeEditionId: selectedEditionId
      });
      updateEditionLocal(selectedEditionId, { published: true });
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
    selectedYearRef.current = year;
    setLive(false);
    setEspnTeams([]);
    setLeagueData(null);
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
                {canDeleteSelected && (
                  <button
                    type="button"
                    className="danger"
                    onClick={handleDeleteEdition}
                  >
                    {isUnpublished ? 'Delete draft' : 'Delete week'}
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
            const isDraft = isAdmin && edition.published === false;
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
      {!loading && !error && isAdmin && selectedEdition && (
        <>
          <label className="week-intro-edit">
            <span className="week-intro-edit__label">Title</span>
            <input
              className="week-intro-edit__input week-intro-edit__title"
              value={draftTitle}
              placeholder="Week title"
              onChange={(e) => {
                setDraftTitle(e.target.value);
                handleLabelChange(e.target.value);
              }}
            />
          </label>
          {live && selectedEdition.type === EDITION_TYPES.week && (
            <ResultWeeksEditor
              weeks={resultWeeksForEdition(selectedEdition)}
              onAdd={handleAddResultWeek}
              onRemove={handleRemoveResultWeek}
            />
          )}
        </>
      )}
      {!loading && !error && isAdmin && (
        <label className="week-intro-edit">
          <span className="week-intro-edit__label">Edition intro</span>
          <textarea
            className="week-intro-edit__input"
            value={draftIntro}
            placeholder="Optional text above this edition’s rankings…"
            rows={3}
            onChange={(e) => {
              setDraftIntro(e.target.value);
              handleIntroChange(e.target.value);
            }}
          />
        </label>
      )}
      {!loading && !error && !isAdmin && selectedEdition?.intro && (
        <p className="week-intro">{selectedEdition.intro}</p>
      )}
      {!loading && !error && selectedEdition && (
        <PowerRankingsList
          key={`${selectedYear}:${selectedEdition.id}`}
          seasonKey={String(selectedYear || '')}
          teams={teams}
          isAdmin={isAdmin}
          onReorder={handleReorder}
          cardStats={cardStats}
          blurbs={blurbs}
          teamMeta={teamMeta}
          teamNames={teamNames}
          onBlurbChange={handleBlurbChange}
          onMetaChange={
            selectedEdition.type === EDITION_TYPES.midseason ||
            selectedEdition.type === EDITION_TYPES.draft ||
            selectedEdition.type === EDITION_TYPES.playoff ||
            selectedEdition.type === EDITION_TYPES.retrospective
              ? handleMetaChange
              : undefined
          }
          previousTeamIds={previousTeamIds}
          editionType={selectedEdition.type || EDITION_TYPES.week}
          editionLabel={selectedEdition.label || ''}
          live={live}
        />
      )}
    </div>
  );
}
