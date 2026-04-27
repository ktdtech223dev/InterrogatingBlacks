import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import Scoreboard from '../components/Scoreboard';

let socket;

export default function Spectator() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [event, setEvent] = useState('Watching...');

  useEffect(() => {
    if (!socket) socket = io();
    socket.emit('join', { room: 'ngames', spectate: true });
    socket.on('spectating', s => setState(s));
    socket.on('state', s => setState(s));
    socket.on('media_phase', () => setEvent('🎬 Media phase'));
    socket.on('question_started', q => setEvent(`❓ ${q.question.category}: ${q.question.question}`));
    socket.on('player_locked', d => setEvent(`🔒 ${d.name} locked in`));
    socket.on('bet_phase', () => setEvent('💰 Bet phase'));
    socket.on('revealed', r => setEvent(`✅ Answer: ${r.correctAnswer}`));
    socket.on('shop_opened', () => setEvent('🛒 Shop opened'));
    socket.on('item_bought', d => setEvent(`💸 ${d.buyerName} bought ${d.item.name}`));
    socket.on('game_over', () => setEvent('🏆 Game Over'));
    return () => socket?.removeAllListeners();
  }, []);

  return (
    <div className="min-h-screen p-4">
      <div className="flex justify-between mb-4">
        <h1 className="font-bebas text-4xl text-yellow-400">👁 SPECTATING</h1>
        <button onClick={() => navigate('/')} className="btn">← Menu</button>
      </div>
      <div className="bg-yellow-900/30 border border-yellow-500 p-3 rounded mb-4">
        <div className="text-xs text-gray-300">CURRENT EVENT</div>
        <div className="font-bebas text-xl">{event}</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
        <div>
          <div className="font-bebas text-2xl mb-2">PHASE: {state?.phase || 'idle'}</div>
          {state?.board && (
            <div className="grid grid-cols-5 gap-2">
              {state.board.map((cat, ci) => (
                <div key={ci} className="cell text-center p-2 font-bebas text-xs">{cat.category}</div>
              ))}
              {[0,1,2,3,4].map(qi =>
                state.board.map((cat, ci) => {
                  const q = cat.questions[qi];
                  if (!q) return <div key={`${ci}-${qi}`} />;
                  return (
                    <div key={`${ci}-${qi}`}
                      className={`cell p-3 font-bebas text-xl ${q.answered ? 'answered' : 'text-yellow-400'}`}>
                      {q.answered ? '—' : `$${q.point_value}`}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
        <Scoreboard players={state?.players || []} hostId={state?.hostId} />
      </div>
      <div className="fixed top-2 right-2 bg-purple-700 px-3 py-1 rounded text-xs font-bebas">SPECTATING</div>
    </div>
  );
}
