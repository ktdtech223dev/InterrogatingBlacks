import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import MediaDisplay from '../components/MediaDisplay';
import Timer from '../components/Timer';
import { SOUNDS } from '../components/SoundEngine';

let socket;

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0').slice(0, 2)}`;
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

        <h2 className="font-bebas text-2xl mb-2">🏆 CREW LEADERBOARD</h2>
        <div className="max-w-2xl space-y-1 mb-6">
          {leaderboard.length === 0 && <div className="text-gray-500">No runs yet.</div>}
          {leaderboard.map((r, i) => (
            <div key={r.player_id} className="flex items-center gap-3 p-2 rounded" style={{ background: 'var(--bg3)' }}>
              <div className="font-bebas text-xl text-yellow-400 w-8">#{i + 1}</div>
              <div className="w-6 h-6 rounded-full" style={{ background: r.color }} />
              <div className="font-bebas text-lg flex-1">{r.display_name}</div>
              <div className="font-bebas">{fmtTime(r.best_time)}</div>
              <div className="text-sm text-gray-400">${r.best_score}</div>
            </div>
          ))}
        </div>

        <button onClick={start} disabled={!me} className="btn btn-primary text-2xl py-4">START SOLO RUN</button>
        <button onClick={() => navigate('/')} className="btn ml-2">← Back</button>
      </div>
    );
  }

  if (phase === 'done' && results) {
    return (
      <div className="min-h-screen p-6">
        <h1 className="font-bebas text-5xl text-yellow-400 text-center mb-4">RUN COMPLETE</h1>
        {results.is_pb && <div className="text-center font-bebas text-3xl text-green-400 pop-in">🌟 NEW PERSONAL BEST!</div>}
        {results.is_perfect && <div className="text-center font-bebas text-3xl text-yellow-400 pop-in">✨ FLAWLESS!</div>}
        <div className="text-center my-6">
          <div className="font-bebas text-7xl text-yellow-400">{fmtTime(results.total_time_ms)}</div>
          <div className="text-gray-400">Final Score: <span className="font-bebas text-2xl text-white">${results.score}</span></div>
          <div className="text-gray-400">Correct: {results.correct} · Wrong: {results.wrong}</div>
        </div>

        <h2 className="font-bebas text-2xl mb-2">🏆 LEADERBOARD</h2>
        <div className="max-w-2xl mx-auto space-y-1 mb-6">
          {results.leaderboard.map((r, i) => (
            <div key={r.player_id} className="flex items-center gap-3 p-2 rounded" style={{ background: 'var(--bg3)' }}>
              <div className="font-bebas text-xl text-yellow-400 w-8">#{i + 1}</div>
              <div className="w-6 h-6 rounded-full" style={{ background: r.color }} />
              <div className="font-bebas text-lg flex-1">{r.display_name}</div>
              <div className="font-bebas">{fmtTime(r.best_time)}</div>
            </div>
          ))}
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
    return (
      <div className="min-h-screen p-6">
        <div className="flex justify-between mb-2">
          <div className="font-bebas text-2xl text-yellow-400">{question.category}</div>
          <div className="font-bebas text-2xl">${question.point_value}</div>
        </div>
        <div className="mb-4"><Timer key={timerKey} duration={question.time_limit} /></div>
        <div className="font-bebas text-3xl text-center my-8">{question.question}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto">
          {question.answers.map((a, i) => (
            <button key={i} onClick={() => socket.emit('solo_answer', { answer: a })}
              className="btn text-xl py-6">
              {String.fromCharCode(65 + i)}. {a}
            </button>
          ))}
        </div>
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
