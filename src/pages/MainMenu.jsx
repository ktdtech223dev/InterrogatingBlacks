import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function MainMenu() {
  const navigate = useNavigate();
  const [standings, setStandings] = useState([]);
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    axios.get('/api/standings').then(r => setStandings(r.data)).catch(() => {});
    axios.get('/api/players').then(r => setPlayers(r.data)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-10">
      <h1 className="font-bebas text-7xl text-yellow-400 text-center" style={{ textShadow: '0 0 30px rgba(255,215,0,0.5)' }}>
        INTERROGATING BLACKS
      </h1>
      <div className="text-gray-400 mb-12">N Games · Season 1</div>

      <div className="grid grid-cols-2 gap-4 max-w-3xl w-full">
        <button onClick={() => navigate('/lobby')} className="btn btn-primary text-3xl py-8">🎮 MULTIPLAYER</button>
        <button onClick={() => navigate('/solo')} className="btn text-3xl py-8" style={{ background: '#1a1a3e' }}>🐺 SOLO MODE</button>
        <button onClick={() => navigate('/editor')} className="btn text-3xl py-8" style={{ background: '#1a3e1a' }}>✏️ QUESTION EDITOR</button>
        <button onClick={() => navigate('/achievements')} className="btn text-3xl py-8" style={{ background: '#3e1a1a' }}>🏆 ACHIEVEMENTS</button>
      </div>

      <button onClick={() => navigate('/spectate')} className="btn mt-4 text-sm" style={{ background: '#222' }}>👁️ Spectate Active Game</button>

      <div className="mt-12 w-full max-w-3xl">
        <h2 className="font-bebas text-3xl text-yellow-400 mb-3">SEASON 1 STANDINGS</h2>
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-800 text-left">
                <th className="p-2 font-bebas">Player</th>
                <th className="p-2 font-bebas">Wins</th>
                <th className="p-2 font-bebas">Points</th>
                <th className="p-2 font-bebas">Games</th>
              </tr>
            </thead>
            <tbody>
              {(standings.length ? standings : players.map(p => ({ ...p, wins: 0, points: 0, games: 0 }))).map((p, i) => (
                <tr key={i} className="border-t border-gray-800">
                  <td className="p-2 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full" style={{ background: p.color }} />
                    {p.display_name}
                  </td>
                  <td className="p-2 font-bebas text-yellow-400">{p.wins || 0}</td>
                  <td className="p-2">{p.points || 0}</td>
                  <td className="p-2">{p.games || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
