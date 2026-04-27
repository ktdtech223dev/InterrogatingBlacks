import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import Scoreboard from '../components/Scoreboard';
import Timer from '../components/Timer';
import MediaDisplay from '../components/MediaDisplay';
import AchievementToast from '../components/AchievementToast';
import { SOUNDS } from '../components/SoundEngine';

let socket;

const CREW_COLORS = ['#FF69B4','#2E8B57','#FFD700','#722F37','#FF6B35','#9B59B6'];

export default function Game() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [phase, setPhase] = useState('board');
  const [question, setQuestion] = useState(null);
  const [media, setMedia] = useState(null);
  const [myAnswer, setMyAnswer] = useState(null);
  const [locked, setLocked] = useState([]);
  const [betPhase, setBetPhase] = useState(null);
  const [bets, setBets] = useState({});
  const [reveal, setReveal] = useState(null);
  const [shop, setShop] = useState(null);
  const [shopTab, setShopTab] = useState('powerups');
  const [shopTarget, setShopTarget] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [activeToast, setActiveToast] = useState(null);
  const [toastQueue, setToastQueue] = useState([]);
  const [effects, setEffects] = useState([]);
  const [skipped, setSkipped] = useState(false);
  const [timerKey, setTimerKey] = useState(0);

  const myPlayerId = +sessionStorage.getItem('myPlayerId');

  useEffect(() => {
    if (!socket) socket = io();
    const mySid = socket.id;

    socket.on('state', s => setState(s));
    socket.on('media_phase', m => { setPhase('media'); setMedia(m); setQuestion(null); setMyAnswer(null); setLocked([]); });
    socket.on('question_started', q => {
      setPhase('question');
      setQuestion(q.question);
      setMedia(null);
      setMyAnswer(null);
      setLocked([]);
      setEffects(q.effects?.[socket.id] || []);
      setTimerKey(k => k + 1);
    });
    socket.on('player_locked', ({ socketId, name }) => {
      setLocked(l => [...l, { socketId, name }]);
    });
    socket.on('question_skipped', () => { setPhase('board'); setSkipped(true); setTimeout(()=>setSkipped(false),1500); });
    socket.on('timer_extended', () => { setTimerKey(k => k + 1); });
    socket.on('bet_phase', b => { setPhase('bet'); setBetPhase(b); setBets({}); setTimerKey(k=>k+1); });
    socket.on('revealed', r => {
      setPhase('reveal');
      setReveal(r);
      setTimerKey(k => k + 1);
      const myResult = Object.entries(r.results).find(([sid]) => sid === socket.id);
      if (myResult) {
        if (myResult[1].isCorrect) SOUNDS.correct();
        else SOUNDS.wrong();
      }
      if (r.betResults?.[socket.id]) SOUNDS.bet_win();
    });
    socket.on('shop_opened', s => { setPhase('shop'); setShop(s); SOUNDS.shop_open(); setTimerKey(k=>k+1); });
    socket.on('item_bought', d => {
      setShop(prev => prev ? { ...prev, scores: d.scores } : prev);
    });
    socket.on('shield_blocked', d => alert(`🛡 Shield blocked sabotage on ${d.targetName}!`));
    socket.on('broke_steal', d => alert(`🤡 ${d.thiefName} stole $${d.amount} from ${d.victimName}!`));
    socket.on('slot_result', d => alert(`🎰 ${d.name} pulled the slot: ${d.result >= 0 ? '+' : ''}${d.result}`));
    socket.on('next_board', d => { setPhase('board'); setState(d.state); setReveal(null); setShop(null); });
    socket.on('game_over', g => {
      setPhase('game_over');
      setGameOver(g);
      SOUNDS.game_over();
      const myAch = g.achievements?.[socket.id];
      if (myAch?.length) setToastQueue(myAch);
    });
    socket.on('returned_to_lobby', () => navigate('/lobby'));

    return () => socket?.removeAllListeners();
  }, []);

  useEffect(() => {
    if (!activeToast && toastQueue.length > 0) {
      setActiveToast(toastQueue[0]);
      setToastQueue(q => q.slice(1));
    }
  }, [activeToast, toastQueue]);

  const selectQ = (catIdx, qIdx) => socket.emit('select_q', { catIdx, qIdx });
  const submit = (ans) => { setMyAnswer(ans); socket.emit('answer', { answer: ans }); };
  const placeBet = (targetId, amount) => {
    socket.emit('bet', { targetId, amount });
    setBets(b => ({ ...b, [targetId]: (b[targetId] || 0) + amount }));
  };

  const isHost = state?.hostId === socket?.id;
  const showHostUI = isHost && (state?.players?.length || 0) >= 5;

  // ── PHASE: Game Over ───────────
  if (phase === 'game_over' && gameOver) {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center">
        <div className="font-bebas text-6xl text-yellow-400 mb-2 pop-in">🏆 GAME OVER</div>
        <div className="font-bebas text-4xl pop-in" style={{ color: gameOver.winner?.color }}>
          {gameOver.winner?.name} WINS!
        </div>
        <div className="my-8 w-full max-w-2xl space-y-2">
          {gameOver.scores.map((p, i) => (
            <div key={p.id} className="flex items-center gap-4 p-3 rounded" style={{ background: 'var(--bg3)', borderLeft: `4px solid ${p.color}` }}>
              <div className="font-bebas text-3xl text-yellow-400 w-10">#{i + 1}</div>
              <div className="font-bebas text-2xl flex-1">{p.name}</div>
              <div className="font-bebas text-2xl">${p.points}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-4">
          <button onClick={() => navigate('/lobby')} className="btn btn-primary">PLAY AGAIN</button>
          <button onClick={() => navigate('/')} className="btn">MAIN MENU</button>
        </div>
        {activeToast && <AchievementToast achievement={activeToast} onDismiss={() => setActiveToast(null)} />}
      </div>
    );
  }

  // ── PHASE: Shop ───────────
  if (phase === 'shop' && shop) {
    const isLast = shop.lastPlaceId === socket?.id;
    const items = shopTab === 'sabotages' ? shop.sabotages : shopTab === 'powerups' ? shop.powerups : shop.brokeBoy;
    const locked = shop.shopLocked?.[socket?.id];
    return (
      <div className="min-h-screen p-6">
        <div className="font-bebas text-5xl text-yellow-400 text-center pop-in mb-2">🎉 BOARD CLEARED</div>
        <div className="max-w-md mx-auto mb-4"><Timer key={timerKey} duration={shop.duration} /></div>

        <div className="flex justify-center gap-2 mb-4">
          {['sabotages', 'powerups', 'brokeboy'].map(t => (
            <button key={t} onClick={() => setShopTab(t)}
              className={`btn ${shopTab === t ? 'btn-primary' : ''}`}
              style={t === 'brokeboy' && isLast ? { animation: 'pulse-strong 1s infinite', borderColor: 'red' } : {}}>
              {t === 'sabotages' ? '🎯 SABOTAGES' : t === 'powerups' ? '⭐ POWER-UPS' : '💀 BROKE BOY'}
            </button>
          ))}
        </div>

        {shopTab === 'brokeboy' && !isLast && (
          <div className="text-center text-red-500 font-bebas text-2xl mb-4">
            🪦 Only {shop.lastPlaceName} (last place) can use Broke Boy items.
          </div>
        )}
        {locked && (
          <div className="text-center text-red-500 font-bebas text-2xl mb-4">
            🔒 Shop locked. Slot machine consequences.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-5xl mx-auto">
          {items.map(item => {
            const canBuy = !locked && (shopTab !== 'brokeboy' || isLast);
            const myPts = shop.scores.find(s => s.id === socket?.id)?.points || 0;
            const affords = myPts >= item.cost;
            return (
              <div key={item.id} className="p-4 rounded-lg" style={{ background: 'var(--bg3)' }}>
                <div className="text-4xl text-center">{item.icon}</div>
                <div className="font-bebas text-xl text-center mt-1">{item.name}</div>
                <div className="text-sm text-gray-300 text-center mt-1">{item.desc}</div>
                {item.consequence && (
                  <div className="text-xs text-red-400 text-center mt-1">⚠ {item.consequence}</div>
                )}
                <div className="font-bebas text-2xl text-yellow-400 text-center mt-2">
                  {item.cost === 0 ? 'FREE' : `$${item.cost}`}
                </div>
                {item.needsTarget && (
                  <select className="input mt-2" value={shopTarget?.[item.id] || ''}
                    onChange={e => setShopTarget(p => ({ ...p, [item.id]: e.target.value }))}>
                    <option value="">Select target...</option>
                    {shop.scores.filter(s => s.id !== socket?.id).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
                <button
                  disabled={!canBuy || !affords || (item.needsTarget && !shopTarget?.[item.id])}
                  onClick={() => socket.emit('buy', { itemId: item.id, targetId: shopTarget?.[item.id] })}
                  className="btn btn-primary w-full mt-2"
                >BUY</button>
              </div>
            );
          })}
        </div>

        {showHostUI && (
          <div className="fixed bottom-4 right-4 bg-yellow-900/80 p-3 rounded">
            <button onClick={() => socket.emit('host_close_shop')} className="btn btn-danger">🔒 Close Shop</button>
          </div>
        )}
      </div>
    );
  }

  // ── PHASE: Reveal ───────────
  if (phase === 'reveal' && reveal) {
    return (
      <div className="min-h-screen p-6">
        <div className="font-bebas text-3xl text-yellow-400 text-center mb-2">CORRECT ANSWER</div>
        <div className="font-bebas text-4xl text-green-400 text-center mb-6">{reveal.correctAnswer}</div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {Object.entries(reveal.results).map(([sid, r]) => (
            <div key={sid} className={`p-4 rounded-lg flip-card ${r.isCorrect ? 'glow-correct' : 'glow-wrong'}`}
                 style={{ background: 'var(--bg3)', borderLeft: `4px solid ${r.color}` }}>
              <div className="font-bebas text-2xl" style={{ color: r.color }}>{r.name}</div>
              <div className="text-sm mt-1">Their answer: {r.answer}</div>
              <div className="font-bebas text-3xl mt-2">{r.isCorrect ? '✅' : '❌'}</div>
              <div className={`font-bebas text-2xl ${r.earned >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {r.earned >= 0 ? '+' : ''}{r.earned}
              </div>
              <div className="font-bebas text-xl text-yellow-400">${r.newTotal}</div>
            </div>
          ))}
        </div>

        {Object.entries(reveal.betResults || {}).length > 0 && (
          <div className="mt-6 text-center">
            <div className="font-bebas text-2xl text-yellow-400">💰 BET RESULTS</div>
            {Object.entries(reveal.betResults).map(([sid, amt]) => (
              <div key={sid} className="text-lg">{reveal.results[sid]?.name} won ${amt * 2} from a bet!</div>
            ))}
          </div>
        )}
        {reveal.boardCleared && (
          <div className="mt-4 text-center font-bebas text-3xl text-yellow-400 pop-in">🎉 BOARD CLEARED!</div>
        )}
      </div>
    );
  }

  // ── PHASE: Bet ───────────
  if (phase === 'bet' && betPhase) {
    const myPts = state?.players?.find(p => p.id === socket?.id)?.points || 0;
    const others = betPhase.players.filter(p => p.id !== socket?.id);
    return (
      <div className="min-h-screen p-6">
        <div className="font-bebas text-4xl text-yellow-400 text-center mb-2">EVERYONE LOCKED IN</div>
        <div className="font-bebas text-xl text-center mb-1 text-gray-400">Bet on someone being WRONG to double your money</div>
        <div className="max-w-md mx-auto mb-6"><Timer key={timerKey} duration={betPhase.timeLimit} /></div>
        <div className="text-center mb-4">Your bank: <span className="font-bebas text-yellow-400 text-2xl">${myPts}</span></div>

        <div className="space-y-2 max-w-2xl mx-auto">
          {others.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 rounded" style={{ background: 'var(--bg3)', borderLeft: `4px solid ${p.color}` }}>
              <div className="font-bebas text-xl flex-1">{p.name}</div>
              <input type="number" min="0" placeholder="amount" className="input w-28"
                onKeyDown={e => {
                  if (e.key === 'Enter' && +e.target.value > 0) {
                    placeBet(p.id, +e.target.value);
                    e.target.value = '';
                  }
                }} />
              <button className="btn text-sm" onClick={(e) => {
                const inp = e.currentTarget.parentElement.querySelector('input');
                if (inp && +inp.value > 0) { placeBet(p.id, +inp.value); inp.value = ''; }
              }}>BET</button>
              {bets[p.id] && <div className="text-yellow-400 font-bebas">${bets[p.id]}</div>}
            </div>
          ))}
        </div>

        <div className="text-center mt-6 text-gray-400 text-sm">No bet? Just wait — phase ends in {betPhase.timeLimit}s.</div>
      </div>
    );
  }

  // ── PHASE: Media ───────────
  if (phase === 'media' && media) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="font-bebas text-3xl text-yellow-400 mb-2">{media.category}</div>
        <div className="font-bebas text-xl mb-4">${media.point_value}</div>
        <MediaDisplay url={media.media_url} type={media.media_type} />
        <div className="font-bebas text-xl text-gray-400 mt-4">PAY ATTENTION...</div>
        <div className="max-w-md w-full mt-4"><Timer key={timerKey} duration={media.duration} /></div>
      </div>
    );
  }

  // ── PHASE: Question ───────────
  if (phase === 'question' && question) {
    const distraction = effects.find(e => e.type === 'distraction');
    const hideAnswers = effects.some(e => e.type === 'hide_answers');
    const reduceTimer = effects.find(e => e.type === 'reduce_timer');
    const extendTimer = effects.find(e => e.type === 'extend_timer');
    const timeLimit = reduceTimer?.value || extendTimer?.value || 20;
    const fifty = effects.some(e => e.type === 'fifty_fifty');
    let visibleAnswers = question.answers;
    if (fifty) {
      const correctIdx = question.answers.indexOf(question.correct_answer);
      const wrongs = question.answers.filter((_, i) => i !== correctIdx);
      const keep = wrongs[Math.floor(Math.random() * wrongs.length)];
      visibleAnswers = question.answers.filter(a => a === question.correct_answer || a === keep);
    }
    return (
      <div className="min-h-screen p-6 flex flex-col">
        {distraction && (
          <div className="fixed top-0 left-0 right-0 bg-red-700 text-white text-center py-2 font-bebas text-xl z-50 animate-bounce">
            💬 {distraction.message}
          </div>
        )}
        {reduceTimer && (
          <div className="text-center bg-orange-700 py-1 font-bebas">⏰ {reduceTimer.value} SECONDS ONLY</div>
        )}
        {hideAnswers && (
          <div className="text-center bg-purple-700 py-1 font-bebas">🙈 ANSWERS HIDDEN</div>
        )}

        <div className="flex justify-between mb-2">
          <div className="font-bebas text-2xl text-yellow-400">{question.category}</div>
          <div className="font-bebas text-2xl">${question.point_value}</div>
        </div>
        <div className="mb-4"><Timer key={timerKey} duration={timeLimit} /></div>

        <div className="font-bebas text-3xl text-center my-8">{question.question}</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto w-full">
          {visibleAnswers.map((a, i) => (
            <button key={i}
              onClick={() => !myAnswer && submit(a)}
              disabled={!!myAnswer}
              className={`btn text-xl py-6 ${myAnswer === a ? 'btn-primary pulse-strong' : ''}`}>
              {hideAnswers ? '???' : `${String.fromCharCode(65 + i)}. ${a}`}
            </button>
          ))}
        </div>

        <div className="text-center mt-6 text-gray-400">
          {locked.length} / {state?.players?.length || 0} locked in
        </div>
        {showHostUI && (
          <div className="fixed bottom-4 right-4 flex gap-2">
            <button onClick={() => socket.emit('host_skip')} className="btn btn-danger text-xs">⏭ Skip</button>
            <button onClick={() => socket.emit('host_extend_timer')} className="btn text-xs">⏰ +20s</button>
          </div>
        )}
      </div>
    );
  }

  // ── PHASE: Board ───────────
  return (
    <div className="min-h-screen p-4 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
      <div>
        <div className="flex justify-between mb-2">
          <div className="font-bebas text-3xl text-yellow-400">BOARD {(state?.curBoard || 0) + 1} / {state?.totalBoards || 3}</div>
          {isHost && <div className="font-bebas text-sm text-yellow-400">⚙ HOST MODE</div>}
        </div>
        {skipped && <div className="text-center text-orange-400 font-bebas">QUESTION SKIPPED</div>}
        {state?.board && (
          <div className="grid grid-cols-5 gap-2">
            {state.board.map((cat, ci) => (
              <div key={ci} className="cell text-center p-3 font-bebas text-sm"
                   style={{ borderTop: `4px solid ${CREW_COLORS[ci % 6]}`, cursor: isHost ? 'pointer' : 'default' }}
                   onClick={() => isHost && socket.emit('host_veto', { catIdx: ci })}>
                {cat.category}
                {cat.is_custom && ' 👥'}
              </div>
            ))}
            {[0,1,2,3,4].map(qi =>
              state.board.map((cat, ci) => {
                const q = cat.questions[qi];
                if (!q) return <div key={`${ci}-${qi}`} />;
                return (
                  <button key={`${ci}-${qi}`}
                    disabled={q.answered}
                    onClick={() => selectQ(ci, qi)}
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
      <div>
        <Scoreboard players={state?.players || []} hostId={state?.hostId} mySocketId={socket?.id} />
      </div>
      {activeToast && <AchievementToast achievement={activeToast} onDismiss={() => setActiveToast(null)} />}
    </div>
  );
}
