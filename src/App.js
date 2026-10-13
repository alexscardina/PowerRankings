import React, { useEffect, useState } from 'react';
import matchTeamOwner from './matchTeamOwner';
import orderTeams, { mergeTeamsByOrder } from './orderTeams';
import PowerRankingsList from './PowerRankingsList';
import './App.css';

const ADMIN_TOKEN_KEY = 'adminToken';

function hasAdminGate() {
  return new URLSearchParams(window.location.search).has('admin');
}

export default function App() {
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem(ADMIN_TOKEN_KEY) || ''
  );
  const [showAdminGate] = useState(hasAdminGate);
  const [password, setPassword] = useState('');
  const [adminError, setAdminError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const isAdmin = Boolean(adminToken);
  const showAdminPanel = showAdminGate || isAdmin;

  useEffect(() => {
    let cancelled = false;

    async function loadLeague() {
      try {
        const [leagueRes, rankingsRes] = await Promise.all([
          fetch('/league'),
          fetch('/rankings')
        ]);

        if (!leagueRes.ok) throw new Error('Failed to load league data');
        if (!rankingsRes.ok) throw new Error('Failed to load rankings');

        const data = await leagueRes.json();
        const rankings = await rankingsRes.json();
        if (cancelled) return;

        const members = (data.members || []).map((member) => ({
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName
        }));
        const mapped = matchTeamOwner(data.teams || [], members);

        setTeams((prev) => {
          const savedIds = rankings.teamIds || [];
          if (!prev.length) {
            return orderTeams(mapped, savedIds);
          }
          // Admins keep local order while editing; viewers sync from server
          if (localStorage.getItem(ADMIN_TOKEN_KEY)) {
            return mergeTeamsByOrder(prev, mapped);
          }
          return orderTeams(mapped, savedIds);
        });
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
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setAdminError(null);

    try {
      const res = await fetch('/admin/login', {
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
  }

  async function handleReorder(nextTeams) {
    setTeams(nextTeams);
    setSaveError(null);

    try {
      const res = await fetch('/rankings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          teamIds: nextTeams.map((team) => team.id)
        })
      });

      if (!res.ok) {
        if (res.status === 401) {
          handleLock();
          throw new Error('Admin session expired. Log in again.');
        }
        throw new Error('Failed to save rankings');
      }
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
                <p className="admin-panel__status">Editing unlocked</p>
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

      {loading && <p>Loading league…</p>}
      {error && <p>Error: {error}</p>}
      {!loading && !error && (
        <PowerRankingsList
          teams={teams}
          isAdmin={isAdmin}
          onReorder={handleReorder}
        />
      )}
    </div>
  );
}
