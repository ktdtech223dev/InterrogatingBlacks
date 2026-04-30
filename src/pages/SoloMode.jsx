import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import MediaDisplay from '../components/MediaDisplay';
import Timer from '../components/Timer';
import { SOUNDS } from '../components/SoundEngine';

let socket;

function fmtTime(ms) {
  if (!ms) return '--:--';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0').slice(0, 2)}`;
}

function fmtTimeShort(ms) {
  if (!ms) return '--:--';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function fmtScore(score) {
  if (!score) return '$0';
  return '$' + Number(score).toLocaleString();
}

function Leaderboard({ data, currentPlayerId }) {
  if (!data || data.length === 0) {
    return <div className="text-center text-gray-500 py-6">No runs yet. Be the first!</div>;
  }
  const overallCrown  = data.find(p => p.has_overall_crown);
  const speedCrown    = data.find(p => p.has_speed_crown);
  const accuracyCrown = data.find(p => p.has_accuracy_crown);

  return (
    <div className="leaderboard-wrap">
      <div className="lb-title"><span>🏆</span><span>CREW LEADERBOARD</span></div>
      <div className="lb-subtitle">Ranked by Efficiency Score (accuracy 60% · speed 40%)</div>

      <div className="crown-row">
        <div className="crown-card">
          <div className="crown-icon">👑</div>
          <div className="crown-label">OVERALL</div>
          <div className="crown-player" style={{ color: overallCrown?.color }}>{overallCrown?.display_name || '--'}</div>
          <div className="crown-stat">{fmtScore(overallCrown?.best_efficiency)}</div>
        </div>
        <div className="crown-card">
          <div className="crown-icon">⚡</div>
          <div className="crown-label">SPEED</div>
          <div className="crown-player" style={{ color: speedCrown?.color }}>{speedCrown?.display_name || '--'}</div>
          <div className="crown-stat">{fmtTimeShort(speedCrown?.best_raw_time)}</div>
        </div>
        <div className="crown-card">
          <div className="crown-icon">🎯</div>
          <div className="crown-label">ACCURACY</div>
          <div className="crown-player" style={{ color: accuracyCrown?.color }}>{accuracyCrown?.display_name || '--'}</div>
          <div className="crown-stat">{accuracyCrown?.best_accuracy || 0}%</div>
        </div>
      </div>

      <div className="lb-table">
        <div className="lb-header">
          <div className="col-rank">#</div>
          <div className="col-player">PLAYER</div>
          <div className="col-score">EFF. SCORE</div>
          <div className="col-time">TIME</div>
          <div className="col-acc">ACC</div>
          <div className="col-ranks">RANKS</div>
        </div>
        {data.map((player, idx) => {
          const isMe = currentPlayerId && player.player_id === currentPlayerId;
          const accColor = player.best_accuracy >= 80 ? 'var(--correct)'
                         : player.best_accuracy >= 60 ? 'var(--gold)'
                         : 'var(--wrong)';
          const eff = player.best_efficiency || 0;
          const base = player.best_eff_points || 1;
          const mult = (eff / base).toFixed(2);
          return (
            <div key={player.player_id}
              className={`lb-row ${idx === 0 ? 'lb-first' : ''} ${isMe ? 'lb-me' : ''}`}
              style={{ borderLeft: `3px solid ${player.color}` }}>
              <div className="col-rank">
                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
              </div>
              <div className="col-player">
                <div className="player-avatar" style={{ background: player.color, color: '#000' }}>
                  {player.avatar_initial}
                </div>
                <div className="player-info">
                  <div className="player-name" style={{ color: player.color }}>
                    {player.display_name}
                    {player.has_overall_crown && <span className="crown">👑</span>}
                  </div>
                  <div className="player-title">{player.title}</div>
                </div>
              </div>
              <div className="col-score">
                <div className="eff-score">{fmtScore(player.best_efficiency)}</div>
                <div className="eff-mult">×{mult}</div>
              </div>
              <div className="col-time">
                <div className="time-val">{fmtTimeShort(player.best_raw_time)}</div>
                {player.has_speed_crown && <div className="speed-crown">⚡</div>}
              </div>
              <div className="col-acc">
                <div className="acc-val" style={{ color: accColor }}>{player.best_accuracy || 0}%</div>
                {player.has_accuracy_crown && <div className="acc-crown">🎯</div>}
              </div>
              <div className="col-ranks">
                <div className="rank-pill speed">⚡#{player.speed_rank || '-'}</div>
                <div className="rank-pill acc">🎯#{player.accuracy_rank || '-'}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="lb-legend">
        <span>👑 Overall Champion — highest efficiency score</span>
        <span>⚡ Speed Crown — fastest board clear</span>
        <span>🎯 Accuracy Crown — most questions correct</span>
      </div>
    </div>
  );
}

export default function SoloMode() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [me, setMe] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [phase, setPhase] = useState('select');
  const [board, setBoard] = useState(null);
  const [score, setScore] = useState(0);
  const [question, setQuestion] = useState(null);
  const [media, setMedia] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [results, setResults] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [timerKey, setTimerKey] = useState(0);

  useEffect(() => {
    axios.get('/api/players').then(r => setPlayers(r.data));
    axios.get('/api/solo/leaderboard').then(r => setLeaderboard(r.data));
    if (!socket) socket = io();
    socket.on('solo_started', d => { setBoard(d.board); setPhase('board'); setStartTime(Date.now()); });
    socket.on('solo_media', m => { setPhase('media'); setMedia(m); setTimerKey(k=>k+1); });
    socket.on('solo_question', q => { setPhase('question'); setQuestion(q); setMedia(null); setTimerKey(k=>k+1); });
    socket.on('solo_reveal', r => {
      setPhase('reveal'); setReveal(r); setScore(r.total_score);
      if (r.is_correct) SOUNDS.correct(); else SOUNDS.wrong();
    });
    socket.on('solo_board', d => { setPhase('board'); setBoard(d.board); setScore(d.score); });
    socket.on('solo_finished', d => {
      setPhase('done'); setResults(d);
      if (d.is_pb) SOUNDS.pb(); else SOUNDS.game_over();
      // Refresh the rich leaderboard so the results screen shows full crown/rank data
      axios.get('/api/solo/leaderboard').then(r => setLeaderboard(r.data)).catch(() => {});
    });
    return () => socket?.removeAllListeners();
  }, []);

  useEffect(() => {
    if (!startTime || phase === 'done') return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [startTime, phase]);

  const start = () => {
    if (!me) return;
    socket.emit('solo_start', { playerId: me });
  };

  if (phase === 'select') {
    return (
      <div className="min-h-screen p-6">
        <h1 className="font-bebas text-5xl text-yellow-400 mb-6">🐺 SOLO MODE</h1>
        <div className="max-w-2xl bg-gray-900 p-4 rounded-lg mb-6">
          <div className="font-bebas text-xl mb-2">RACE THE CLOCK</div>
          <ul className="text-sm text-gray-300 list-disc pl-5 space-y-1">
            <li>Clear the entire board as fast as possible</li>
            <li>Faster correct answers = more points (50% time bonus)</li>
            <li>No penalty for wrong answers</li>
            <li>Perfect run (zero wrong) unlocks Flawless achievement</li>
          </ul>
        </div>

        <h2 className="font-bebas text-2xl mb-2">PICK YOUR CHARACTER</h2>
        <div className="grid grid-cols-3 gap-3 mb-6 max-w-2xl">
          {players.map(p => (
            <button key={p.id} onClick={() => setMe(p.id)} className="p-3 rounded text-left"
              style={{ background: me === p.id ? p.color : 'var(--bg3)', borderLeft: `6px solid ${p.color}` }}>
              <div className="font-bebas text-xl">{p.display_name}</div>
              <div className="text-xs text-gray-300">{p.title}</div>
            </button>
          ))}
        </div>

        <div className="max-w-3xl mb-6">
          <Leaderboard data={leaderboard} currentPlayerId={me} />
        </div>

        <button onClick={start} disabled={!me} className="btn btn-primary text-2xl py-4">START SOLO RUN</button>
        <button onClick={() => navigate('/')} className="btn ml-2">← Back</button>
      </div>
    );
  }

  if (phase === 'done' && results) {
    const total = results.total_questions || 25;
    const baseScore = results.score || 0;
    const eff = results.efficiency_score || 0;
    const mult = results.efficiency_multiplier || 1;
    const accPct = results.accuracy_pct || 0;
    const timeBonusPct = results.time_bonus_pct || 0;
    return (
      <div className="min-h-screen p-6">
        <h1 className="font-bebas text-5xl text-yellow-400 text-center mb-4">RUN COMPLETE</h1>
        {results.is_world_record && <div className="text-center font-bebas text-3xl text-yellow-300 pop-in">🏆 NEW CREW RECORD!</div>}
        {results.is_pb && !results.is_world_record && <div className="text-center font-bebas text-3xl text-green-400 pop-in">🌟 NEW PERSONAL BEST!</div>}
        {results.is_perfect && <div className="text-center font-bebas text-3xl text-yellow-400 pop-in">✨ FLAWLESS!</div>}

        <div className="text-center my-6">
          <div className="text-gray-400 text-sm">⏱ TIME · {fmtTime(results.total_time_ms)}</div>
          <div className="text-gray-400 text-sm">Correct: {results.correct}/{total} · Wrong: {results.wrong}</div>
          <div className="mt-3 text-gray-400 text-sm">RAW SCORE</div>
          <div className="font-bebas text-3xl text-white">{fmtScore(baseScore)}</div>
        </div>

        <div className="max-w-xl mx-auto bg-gray-900 p-5 rounded-lg border-2 border-yellow-500 mb-6 text-center">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">⭐ Efficiency Score</div>
          <div className="font-bebas text-6xl text-yellow-400">{fmtScore(eff)}</div>
          <div className="text-sm text-gray-400 mt-2">
            {fmtScore(baseScore)} × {mult.toFixed(2)} multiplier
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
            <div className="bg-gray-800 rounded py-2">
              <div className="text-gray-400 text-xs">Accuracy bonus</div>
              <div className="font-bebas text-lg text-green-400">+{Math.round(accPct * 0.6)}%</div>
              <div className="text-xs text-gray-500">{accPct}% correct</div>
            </div>
            <div className="bg-gray-800 rounded py-2">
              <div className="text-gray-400 text-xs">Speed bonus</div>
              <div className="font-bebas text-lg text-cyan-300">+{Math.round(timeBonusPct * 0.4)}%</div>
              <div className="text-xs text-gray-500">{timeBonusPct === 0 ? 'over par time' : `${timeBonusPct}% under par`}</div>
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-2">This is what counts for the leaderboard.</div>
        </div>

        <div className="max-w-3xl mx-auto mb-6">
          <Leaderboard data={leaderboard} currentPlayerId={me} />
        </div>

        {results.achievements?.length > 0 && (
          <div className="max-w-2xl mx-auto bg-gray-900 p-4 rounded mb-4">
            <div className="font-bebas text-2xl text-yellow-400 mb-2">🏆 ACHIEVEMENTS UNLOCKED</div>
            {results.achievements.map(a => (
              <div key={a.id} className={`flex gap-3 items-center p-2 rarity-${a.rarity}`}>
                <div className="text-3xl">{a.icon}</div>
                <div>
                  <div className="font-bebas text-lg">{a.name}</div>
                  <div className="text-xs">{a.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-center gap-2">
          <button onClick={() => { setPhase('select'); setMedia(null); setQuestion(null); setReveal(null); setResults(null); setBoard(null); setScore(0); }} className="btn btn-primary">PLAY AGAIN</button>
          <button onClick={() => navigate('/')} className="btn">MAIN MENU</button>
        </div>
      </div>
    );
  }

  if (phase === 'media' && media) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="font-bebas text-xl mb-2">${media.point_value}</div>
        <MediaDisplay url={media.media_url} type={media.media_type} />
        <div className="font-bebas text-xl text-gray-400 mt-4">PAY ATTENTION...</div>
        <div className="max-w-md w-full mt-4"><Timer key={timerKey} duration={media.duration} /></div>
      </div>
    );
  }

  if (phase === 'question' && question) {
    const isOpen = question.answer_type === 'open_ended';
    return (
      <div className="min-h-screen p-6">
        <div className="flex justify-between mb-2">
          <div className="font-bebas text-2xl text-yellow-400">{question.category}</div>
          <div className="font-bebas text-2xl">${question.point_value}</div>
        </div>
        <div className="mb-4"><Timer key={timerKey} duration={question.time_limit} /></div>
        <div className="font-bebas text-3xl text-center my-8">{question.question}</div>
        {isOpen ? (
          <div className="max-w-xl mx-auto">
            <div className="text-center text-sm text-gray-400 mb-2">✏️ Type your answer</div>
            <input
              autoFocus
              placeholder="Type and press Enter..."
              className="input text-2xl text-center py-4 font-bebas"
              onKeyDown={e => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  socket.emit('solo_answer', { answer: e.target.value.trim() });
                }
              }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto">
            {question.answers.map((a, i) => (
              <button key={i} onClick={() => socket.emit('solo_answer', { answer: a })}
                className="btn text-xl py-6">
                {String.fromCharCode(65 + i)}. {a}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phase === 'reveal' && reveal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className={`font-bebas text-6xl pop-in ${reveal.is_correct ? 'text-green-400' : 'text-red-400'}`}>
          {reveal.is_correct ? '✅ CORRECT' : '❌ WRONG'}
        </div>
        <div className="text-2xl mt-2">Answer: <span className="font-bebas text-yellow-400">{reveal.correct_answer}</span></div>
        <div className="text-xl mt-2">+{reveal.earned} pts · Total: ${reveal.total_score}</div>
      </div>
    );
  }

  // Board view
  return (
    <div className="min-h-screen p-4">
      <div className="flex justify-between mb-3">
        <div className="font-bebas text-3xl text-yellow-400">⏱ {fmtTime(now - startTime)}</div>
        <div className="font-bebas text-3xl">SCORE: ${score}</div>
      </div>
      {board && (
        <div className="grid grid-cols-5 gap-2">
          {board.map((cat, ci) => (
            <div key={ci} className="cell text-center p-3 font-bebas text-sm">
              {cat.category} {cat.is_custom && '👥'}
            </div>
          ))}
          {[0,1,2,3,4].map(qi =>
            board.map((cat, ci) => {
              const q = cat.questions[qi];
              if (!q) return <div key={`${ci}-${qi}`} />;
              return (
                <button key={`${ci}-${qi}`}
                  disabled={q.answered}
                  onClick={() => socket.emit('solo_select', { catIdx: ci, qIdx: qi })}
                  className={`cell p-4 font-bebas text-2xl ${q.answered ? 'answered' : 'text-yellow-400'}`}>
                  {q.answered ? '—' : `$${q.point_value}`}
                  {q.has_media && !q.answered && <span className="absolute top-1 right-1 text-xs">🎬</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
