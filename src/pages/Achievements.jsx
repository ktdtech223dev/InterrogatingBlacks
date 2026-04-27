import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Achievements() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [me, setMe] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [stats, setStats] = useState(null);
  const [standings, setStandings] = useState([]);
  const [cosmetics, setCosmetics] = useState([]);
  const [tab, setTab] = useState('achievements');

  useEffect(() => {
    axios.get('/api/players').then(r => {
      setPlayers(r.data);
      if (r.data.length) setMe(r.data[0].id);
    });
    axios.get('/api/standings').then(r => setStandings(r.data));
    axios.get('/api/cosmetics').then(r => setCosmetics(r.data));
  }, []);

  useEffect(() => {
    if (!me) return;
    axios.get(`/api/players/${me}/achievements`).then(r => setAchievements(r.data));
    axios.get(`/api/players/${me}/stats`).then(r => setStats(r.data));
  }, [me]);

  const player = players.find(p => p.id === me);

  const setActive = async (type, id) => {
    if (!player) return;
    const updates = {
      title: player.title,
      cosmetic_theme: player.cosmetic_theme,
      cosmetic_buttons: player.cosmetic_buttons
    };
    if (type === 'theme') updates.cosmetic_theme = id;
    if (type === 'buttons') updates.cosmetic_buttons = id;
    if (type === 'title') updates.title = id;
    await axios.put(`/api/players/${me}`, updates);
    axios.get('/api/players').then(r => setPlayers(r.data));
  };

  const unlockedIds = achievements.filter(a => a.unlocked).map(a => a.id);

  return (
    <div className="min-h-screen p-6">
      <div className="flex justify-between mb-4">
        <h1 className="font-bebas text-5xl text-yellow-400">🏆 ACHIEVEMENTS</h1>
        <button onClick={() => navigate('/')} className="btn">← Menu</button>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
        {players.map(p => (
          <button key={p.id} onClick={() => setMe(p.id)}
            className="p-3 rounded text-left"
            style={{ background: me === p.id ? p.color : 'var(--bg3)', borderLeft: `6px solid ${p.color}` }}>
            <div className="font-bebas text-lg">{p.display_name}</div>
            <div className="text-xs text-gray-300">{p.title}</div>
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {['achievements', 'cosmetics', 'standings'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`btn ${tab === t ? 'btn-primary' : ''}`}>{t.toUpperCase()}</button>
        ))}
      </div>

      {tab === 'achievements' && (
        <>
          {stats && (
            <div className="bg-gray-900 p-4 rounded mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>Games: <span className="font-bebas text-xl text-yellow-400">{stats.games_played}</span></div>
              <div>Wins: <span className="font-bebas text-xl text-yellow-400">{stats.games_won}</span></div>
              <div>Solo runs: <span className="font-bebas text-xl text-yellow-400">{stats.solo_games}</span></div>
              <div>Best solo: <span className="font-bebas text-xl text-yellow-400">{stats.solo_best_time_ms ? Math.round(stats.solo_best_time_ms / 1000) + 's' : '—'}</span></div>
              <div>Correct: <span className="font-bebas text-xl text-green-400">{stats.total_correct}</span></div>
              <div>Wrong: <span className="font-bebas text-xl text-red-400">{stats.total_wrong}</span></div>
              <div>Bets won: <span className="font-bebas text-xl">{stats.total_bets_won}</span></div>
              <div>Sabotages: <span className="font-bebas text-xl">{stats.sabotages_used}</span></div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {achievements.map(a => (
              <div key={a.id} className={`p-4 rounded border-2 rarity-${a.rarity}`}
                style={{ background: a.unlocked ? 'var(--bg3)' : 'var(--bg2)', opacity: a.unlocked ? 1 : 0.5 }}>
                <div className="text-4xl text-center">{a.icon}</div>
                <div className="font-bebas text-lg text-center mt-1 text-white">{a.name}</div>
                <div className="text-xs text-gray-300 text-center mt-1">{a.description}</div>
                <div className={`text-xs text-center mt-1 uppercase rarity-${a.rarity}`}>{a.rarity}</div>
                {a.unlocked && <div className="text-xs text-center text-green-400 mt-1">✓ UNLOCKED</div>}
                {!a.unlocked && <div className="text-xs text-center text-gray-500 mt-1">🔒 LOCKED</div>}
                {a.unlocks_title && <div className="text-xs text-center text-yellow-400 mt-1">Unlocks title: {a.unlocks_title}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'cosmetics' && (
        <div className="space-y-4">
          {['theme', 'buttons'].map(type => (
            <div key={type}>
              <h3 className="font-bebas text-2xl text-yellow-400 mb-2">{type.toUpperCase()}S</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {cosmetics.filter(c => c.type === type).map(c => {
                  const unlocked = c.unlock_requirement === 'default' || unlockedIds.includes(c.unlock_requirement);
                  const active = (type === 'theme' && player?.cosmetic_theme === c.id) ||
                                 (type === 'buttons' && player?.cosmetic_buttons === c.id);
                  return (
                    <div key={c.id} className={`p-3 rounded border ${unlocked ? 'border-yellow-500' : 'border-gray-700 opacity-50'}`}>
                      <div className="font-bebas text-lg">{c.name}</div>
                      {unlocked ? (
                        <button onClick={() => setActive(type, c.id)} className={`btn mt-2 text-xs ${active ? 'btn-primary' : ''}`}>
                          {active ? 'ACTIVE' : 'SET ACTIVE'}
                        </button>
                      ) : (
                        <div className="text-xs text-gray-500 mt-1">Unlock: {c.unlock_requirement}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'standings' && (
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-800 text-left">
                <th className="p-3 font-bebas">Rank</th>
                <th className="p-3 font-bebas">Player</th>
                <th className="p-3 font-bebas">Wins</th>
                <th className="p-3 font-bebas">Points</th>
                <th className="p-3 font-bebas">Games</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.id} className="border-t border-gray-800">
                  <td className="p-3 font-bebas text-yellow-400">#{i + 1}</td>
                  <td className="p-3 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full" style={{ background: s.color }} />
                    {s.display_name}
                  </td>
                  <td className="p-3">{s.wins}</td>
                  <td className="p-3">{s.points}</td>
                  <td className="p-3">{s.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
