import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

let socket;

export default function Lobby() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState({ players: [], hostId: null, spectators: 0 });
  const [boardCount, setBoardCount] = useState(3);

  useEffect(() => {
    axios.get('/api/players').then(r => setPlayers(r.data));
    if (!socket) socket = io();
    socket.on('state', (s) => setState(s));
    socket.on('game_started', (s) => {
      setState(s);
      navigate('/game');
    });
    return () => {
      socket?.off('state');
      socket?.off('game_started');
    };
  }, []);

  const join = (playerId) => {
    setSelectedId(playerId);
    socket.emit('join', { playerId, room: 'ngames' });
    setJoined(true);
    sessionStorage.setItem('myPlayerId', playerId);
    sessionStorage.setItem('mySocketId', socket.id);
  };

  const spectate = () => {
    socket.emit('join', { room: 'ngames', spectate: true });
    navigate('/spectate');
  };

  const start = () => {
    socket.emit('start', { boardCount });
  };

  const isHost = state.hostId === socket?.id;

  return (
    <div className="min-h-screen p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-bebas text-5xl text-yellow-400">LOBBY</h1>
        <div className="text-gray-400">Room: <span className="font-bebas text-white">NGAMES</span></div>
      </div>

      <h2 className="font-bebas text-2xl mb-3">PICK YOUR CREW MEMBER</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {players.map(p => {
          const inGame = state.players?.find(sp => sp.playerId === p.id);
          const isMe = selectedId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => !inGame && !joined && join(p.id)}
              disabled={joined || !!inGame}
              className="p-4 rounded-lg transition-all text-left"
              style={{
                background: isMe ? p.color : 'var(--bg3)',
                borderLeft: `6px solid ${p.color}`,
                opacity: inGame && !isMe ? 0.5 : 1
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center font-bebas text-2xl"
                     style={{ background: p.color, color: 'white', border: '2px solid white' }}>
                  {p.avatar_initial}
                </div>
                <div>
                  <div className="font-bebas text-2xl">{p.display_name}</div>
                  <div className="text-xs text-gray-300">{p.title}</div>
                  {inGame && <div className="text-xs text-green-400 font-bold mt-1">✓ READY</div>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-gray-900 p-4 rounded-lg mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bebas text-xl text-yellow-400">👁️ SPECTATING: {state.spectators || 0}</div>
            <div className="text-xs text-gray-400">Watch without playing</div>
          </div>
          <button onClick={spectate} className="btn">Join as Spectator</button>
        </div>
      </div>

      <div className="bg-gray-900 p-4 rounded-lg mb-4">
        <label className="block font-bebas text-xl mb-2">BOARDS PER GAME: {boardCount}</label>
        <input type="range" min="1" max="5" value={boardCount}
               onChange={e => setBoardCount(+e.target.value)} className="w-full" />
      </div>

      {isHost && (
        <div className="bg-yellow-900/30 border-2 border-yellow-500 p-4 rounded-lg mb-4">
          <div className="font-bebas text-xl text-yellow-400 mb-2">⚙ HOST CONTROLS</div>
          <div className="text-sm text-gray-300">You can skip questions, extend timers, close shop, and veto categories during the game.</div>
        </div>
      )}

      <button
        onClick={start}
        disabled={!isHost || (state.players?.length || 0) < 1}
        className="btn btn-primary w-full text-3xl py-6"
      >
        START GAME ({state.players?.length || 0} players)
      </button>
      <button onClick={() => navigate('/')} className="btn w-full mt-2">← Back to Menu</button>
    </div>
  );
}
