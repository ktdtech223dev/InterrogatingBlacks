const { buildBoard } = require('./questions');
const { SABOTAGES, POWERUPS, BROKE_BOY } = require('./items');
const { db } = require('./database');
const { checkAndUnlock, updatePlayerStats, updateSeasonStandings } = require('./achievements');

function normalizeAnswer(s) {
  if (s == null) return '';
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function isAnswerCorrect(question, submitted) {
  if (submitted == null) return false;
  if (question.answer_type === 'open_ended') {
    const norm = normalizeAnswer(submitted);
    if (!norm) return false;
    const accepted = (question.accepted_answers && question.accepted_answers.length)
      ? question.accepted_answers
      : [question.correct_answer];
    return accepted.some(a => normalizeAnswer(a) === norm);
  }
  return submitted === question.correct_answer;
}

const PHASE = {
  LOBBY: 'lobby', BOARD: 'board', MEDIA: 'media',
  QUESTION: 'question', BET: 'bet', REVEAL: 'reveal',
  SHOP: 'shop', GAME_OVER: 'game_over'
};

class Game {
  constructor(io, roomId) {
    this.io = io;
    this.roomId = roomId;
    this.phase = PHASE.LOBBY;
    this.players = {};
    this.spectators = new Set();
    this.boards = [];
    this.curBoard = 0;
    this.totalBoards = 3;
    this.curQ = null;
    this.answers = {};
    this.bets = {};
    this.effects = {};
    this.shopLocked = {};
    this.timer = null;
    this.hostId = null;
    this.boardsCleared = 0;
    this.gameStartTime = null;
    this.brokeBoyCounts = {};
    this.betsWonThisGame = {};
  }

  addPlayer(socketId, playerData) {
    this.players[socketId] = {
      id: socketId,
      playerId: playerData.id,
      name: playerData.display_name,
      color: playerData.color,
      initial: playerData.avatar_initial,
      title: playerData.title,
      cosmetic: playerData.cosmetic_theme,
      buttons: playerData.cosmetic_buttons,
      points: 0,
      ready: false
    };
    this.effects[socketId] = [];
    this.shopLocked[socketId] = false;
    this.betsWonThisGame[socketId] = 0;
    this.brokeBoyCounts[socketId] = 0;
    if (!this.hostId) this.hostId = socketId;
    this.broadcast('state', this.getState());
  }

  addSpectator(socketId) {
    this.spectators.add(socketId);
    this.io.to(socketId).emit('spectating', this.getState());
  }

  removePlayer(socketId) {
    delete this.players[socketId];
    this.spectators.delete(socketId);
    if (this.hostId === socketId) {
      this.hostId = Object.keys(this.players)[0] || null;
    }
    this.broadcast('state', this.getState());
  }

  toggleReady(socketId) {
    const p = this.players[socketId];
    if (!p) return;
    if (this.phase !== PHASE.LOBBY) return;
    p.ready = !p.ready;
    this.broadcast('state', this.getState());
  }

  canStart() {
    const list = Object.values(this.players);
    if (list.length < 2) return false;
    return list.every(p => p.ready);
  }

  async start(boardCount, requestedBy) {
    if (requestedBy && requestedBy !== this.hostId) return;
    if (!this.canStart()) {
      this.broadcast('start_blocked', {
        reason: Object.keys(this.players).length < 2
          ? 'Need at least 2 players'
          : 'All players must be ready'
      });
      return;
    }
    this.totalBoards = boardCount;
    this.boards = [];
    this.gameStartTime = Date.now();
    for (let i = 0; i < boardCount; i++) {
      this.boards.push(await buildBoard(i));
    }
    this.phase = PHASE.BOARD;
    const st = this.getState();
    this.broadcast('game_started', st);
    this.broadcast('state', st); // belt-and-suspenders for late mounters
  }

  sendStateTo(socketId) {
    this.io.to(socketId).emit('state', this.getState());
  }

  hostSkipQuestion(socketId) {
    if (socketId !== this.hostId) return;
    if (this.phase !== PHASE.QUESTION && this.phase !== PHASE.MEDIA && this.phase !== PHASE.BET) return;
    clearTimeout(this.timer);
    const board = this.boards[this.curBoard];
    if (this.curQ) board[this.curQ.catIdx].questions[this.curQ.qIdx].answered = true;
    this.broadcast('question_skipped', {});
    this.phase = PHASE.BOARD;
    this.broadcast('state', this.getState());
  }

  hostExtendTimer(socketId) {
    if (socketId !== this.hostId) return;
    if (this.phase !== PHASE.QUESTION) return;
    clearTimeout(this.timer);
    this.broadcast('timer_extended', { seconds: 20 });
    this.timer = setTimeout(() => this.startBetPhase(), 20000);
  }

  hostCloseShop(socketId) {
    if (socketId !== this.hostId) return;
    if (this.phase !== PHASE.SHOP) return;
    clearTimeout(this.timer);
    this.nextBoard();
  }

  hostVetoCategory(socketId, catIdx) {
    if (socketId !== this.hostId) return;
    if (this.phase !== PHASE.BOARD) return;
    buildBoard(this.curBoard + 100).then(newBoard => {
      if (newBoard[0]) {
        this.boards[this.curBoard][catIdx] = newBoard[0];
        this.broadcast('state', this.getState());
      }
    });
  }

  selectQuestion(socketId, catIdx, qIdx) {
    if (this.phase !== PHASE.BOARD) return;
    const board = this.boards[this.curBoard];
    const cat = board[catIdx];
    if (!cat) return;
    const q = cat.questions[qIdx];
    if (!q || q.answered) return;
    this.curQ = { ...q, catIdx, qIdx, category: cat.category };
    this.answers = {};
    this.bets = {};

    if (q.has_media && q.media_url) {
      this.phase = PHASE.MEDIA;
      this.broadcast('media_phase', {
        media_url: q.media_url,
        media_type: q.media_type,
        duration: q.media_duration || 5,
        category: cat.category,
        point_value: q.point_value
      });
      this.timer = setTimeout(() => this.showQuestion(), (q.media_duration || 5) * 1000);
    } else {
      this.showQuestion();
    }
  }

  showQuestion() {
    this.phase = PHASE.QUESTION;
    const timeLimit = 20;
    this.broadcast('question_started', {
      question: this.buildQuestionPayload(),
      timeLimit,
      effects: this.effects
    });
    this.timer = setTimeout(() => this.startBetPhase(), timeLimit * 1000);
  }

  buildQuestionPayload() {
    const isOpen = this.curQ.answer_type === 'open_ended';
    const { correct_answer, accepted_answers, wrong_answers, ...rest } = this.curQ;
    return {
      ...rest,
      answers: isOpen ? null : (this.curQ.answers || [correct_answer, ...(wrong_answers || [])].sort(() => Math.random() - 0.5)),
      answer_type: this.curQ.answer_type || 'multiple_choice'
    };
  }

  submitAnswer(socketId, answer) {
    if (this.phase !== PHASE.QUESTION) return;
    if (this.answers[socketId] !== undefined) return;

    const hasNuke = (this.effects[socketId] || []).some(e => e.type === 'bb_nuclear');
    if (hasNuke) {
      const all = [this.curQ.correct_answer, ...(this.curQ.wrong_answers || [])];
      answer = all[Math.floor(Math.random() * all.length)];
      this.effects[socketId] = (this.effects[socketId] || []).filter(e => e.type !== 'bb_nuclear');
    }

    this.answers[socketId] = { answer, lockedAt: Date.now() };
    this.broadcast('player_locked', { socketId, name: this.players[socketId]?.name });

    if (Object.keys(this.answers).length >= Object.keys(this.players).length) {
      clearTimeout(this.timer);
      this.startBetPhase();
    }
  }

  startBetPhase() {
    this.phase = PHASE.BET;
    this.broadcast('bet_phase', {
      players: this.getPlayerList(),
      timeLimit: 10
    });
    this.timer = setTimeout(() => this.resolve(), 10000);
  }

  placeBet(bettorId, targetId, amount) {
    if (this.phase !== PHASE.BET) return;
    const bettor = this.players[bettorId];
    if (!bettor || amount <= 0) return;
    if (amount > bettor.points) return;
    if (bettorId === targetId) return;
    if (!this.bets[bettorId]) this.bets[bettorId] = [];
    this.bets[bettorId].push({ targetId, amount });
    bettor.points -= amount;
    this.broadcast('bet_placed', {
      bettorName: bettor.name,
      targetName: this.players[targetId]?.name,
      amount
    });
  }

  resolve() {
    clearTimeout(this.timer);
    this.phase = PHASE.REVEAL;
    const correct = this.curQ.correct_answer;
    const results = {};
    let allCorrect = true;

    Object.entries(this.players).forEach(([id, player]) => {
      const sub = this.answers[id];
      const fx = this.effects[id] || [];
      const isCorrect = isAnswerCorrect(this.curQ, sub?.answer);
      if (!isCorrect) allCorrect = false;

      const qPts = this.curQ.point_value;
      const hasDblLoss = fx.some(e => e.type === 'double_loss');
      const hasDblNext = fx.some(e => e.type === 'double_next');
      const hasBbTriple = fx.some(e => e.type === 'bb_triple');
      const hasZeroNext = fx.some(e => e.type === 'zero_next_active');
      const hasBbPenalty = fx.some(e => e.type === 'bb_penalty');
      const needsZeroSetup = fx.some(e => e.type === 'zero_next_setup');
      const hasDespPenalty = fx.some(e => e.type === 'desp_penalty');

      let earned = 0;
      if (hasZeroNext) {
        earned = 0;
        this.effects[id] = fx.filter(e => e.type !== 'zero_next_active');
      } else if (isCorrect) {
        let mult = hasBbTriple ? 3 : hasDblNext ? 2 : 1;
        if (hasBbPenalty) mult *= 0.75;
        earned = Math.round(qPts * mult);
      } else {
        let mult = hasBbTriple ? 2 : hasDblLoss ? 2 : 1;
        if (hasBbPenalty) mult *= 0.75;
        earned = -Math.round(qPts * mult);
        if (hasDespPenalty) earned -= 500;
      }

      if (needsZeroSetup) {
        this.effects[id] = fx.filter(e => e.type !== 'zero_next_setup');
        this.effects[id].push({ type: 'zero_next_active' });
      }

      player.points = Math.max(0, player.points + earned);

      if (isCorrect) {
        updatePlayerStats(player.playerId, { total_correct: 1, current_streak: 1 });
        if (this.curQ.is_custom) updatePlayerStats(player.playerId, { custom_q_correct: 1 });
        if (this.curQ.has_media) updatePlayerStats(player.playerId, { media_q_correct: 1 });
      } else {
        updatePlayerStats(player.playerId, { total_wrong: 1 });
        db.prepare('UPDATE player_stats SET current_streak=0 WHERE player_id=?').run(player.playerId);
      }

      this.effects[id] = (this.effects[id] || []).filter(e => ![
        'double_next', 'double_loss', 'bb_triple', 'reduce_timer',
        'extend_timer', 'fifty_fifty', 'hide_answers', 'shuffle_answers',
        'category_swap', 'distraction', 'steal_points', 'bb_nuclear', 'desp_penalty'
      ].includes(e.type));

      results[id] = {
        name: player.name, color: player.color,
        answer: sub?.answer || 'No answer',
        isCorrect, earned, newTotal: player.points
      };
    });

    const betResults = {};
    Object.entries(this.bets).forEach(([bettorId, betList]) => {
      const bettor = this.players[bettorId];
      if (!bettor) return;
      betList.forEach(bet => {
        const tgt = results[bet.targetId];
        if (!tgt) return;
        const hasFlip = (this.effects[bet.targetId] || []).some(e => e.type === 'reverse_bets');
        const won = hasFlip ? tgt.isCorrect : !tgt.isCorrect;
        if (won) {
          bettor.points += bet.amount * 2;
          this.betsWonThisGame[bettorId] = (this.betsWonThisGame[bettorId] || 0) + 1;
          if (!betResults[bettorId]) betResults[bettorId] = 0;
          betResults[bettorId] += bet.amount;
          updatePlayerStats(bettor.playerId, { total_bets_won: 1, total_bet_points_won: bet.amount * 2 });
        }
        updatePlayerStats(bettor.playerId, { total_bets_placed: 1 });
      });
      Object.keys(this.effects).forEach(id => {
        this.effects[id] = (this.effects[id] || []).filter(e => e.type !== 'reverse_bets');
      });
    });

    Object.entries(this.players).forEach(([id]) => {
      const stealFx = (this.effects[id] || []).find(e => e.type === 'steal_points');
      if (stealFx && results[id]?.isCorrect) {
        const targetEntry = Object.entries(this.players).find(([, p]) => p.name === stealFx.targetName);
        if (targetEntry) {
          const [tid, tplayer] = targetEntry;
          if (!results[tid]?.isCorrect) {
            const stolen = Math.floor(tplayer.points * 0.25);
            tplayer.points -= stolen;
            this.players[id].points += stolen;
            results[id].earned += stolen;
            results[id].newTotal = this.players[id].points;
          }
        }
        this.effects[id] = (this.effects[id] || []).filter(e => e.type !== 'steal_points');
      }
    });

    this.boards[this.curBoard][this.curQ.catIdx].questions[this.curQ.qIdx].answered = true;

    const allAnswered = this.boards[this.curBoard].every(cat => cat.questions.every(q => q.answered));

    if (allAnswered && allCorrect) {
      Object.keys(this.players).forEach(id => {
        updatePlayerStats(this.players[id].playerId, { perfect_boards: 1 });
      });
    }

    this.broadcast('revealed', {
      results,
      betResults,
      correctAnswer: correct,
      boardCleared: allAnswered,
      sounds: {
        has_correct: Object.values(results).some(r => r.isCorrect),
        has_wrong: Object.values(results).some(r => !r.isCorrect),
        has_bet_win: Object.keys(betResults).length > 0
      },
      scores: this.getScores()
    });

    setTimeout(() => {
      if (allAnswered) this.openShop();
      else {
        this.phase = PHASE.BOARD;
        this.broadcast('state', this.getState());
      }
    }, 5000);
  }

  openShop() {
    this.phase = PHASE.SHOP;
    this.boardsCleared++;
    const scores = this.getScores();
    const lastPlace = scores[scores.length - 1];

    this.broadcast('shop_opened', {
      sabotages: SABOTAGES,
      powerups: POWERUPS,
      brokeBoy: BROKE_BOY,
      lastPlaceId: lastPlace.id,
      lastPlaceName: lastPlace.name,
      shopLocked: this.shopLocked,
      scores,
      duration: 45
    });

    this.timer = setTimeout(() => this.nextBoard(), 45000);
  }

  buyItem(buyerId, itemId, targetId) {
    const buyer = this.players[buyerId];
    if (!buyer) return;
    const all = [...SABOTAGES, ...POWERUPS, ...BROKE_BOY];
    const item = all.find(i => i.id === itemId);
    if (!item) return;
    const isBroke = BROKE_BOY.some(b => b.id === itemId);
    if (isBroke) {
      const scores = this.getScores();
      const lastPlace = scores[scores.length - 1];
      if (lastPlace.id !== buyerId) return;
    }
    if (this.shopLocked[buyerId]) return;
    if (buyer.points < item.cost) return;
    buyer.points -= item.cost;

    const target = targetId ? this.players[targetId] : null;

    const hasShield = target && (this.effects[targetId] || []).some(e => e.type === 'block_sabotage');
    if (hasShield && SABOTAGES.some(s => s.id === itemId)) {
      this.effects[targetId] = (this.effects[targetId] || []).filter(e => e.type !== 'block_sabotage');
      buyer.points += item.cost;
      this.broadcast('shield_blocked', { targetName: target.name });
      return;
    }

    this.applyItem(buyerId, item, targetId);

    if (isBroke) {
      this.brokeBoyCounts[buyerId] = (this.brokeBoyCounts[buyerId] || 0) + 1;
      updatePlayerStats(buyer.playerId, { broke_boy_count: 1 });
    }
    if (SABOTAGES.some(s => s.id === itemId)) {
      updatePlayerStats(buyer.playerId, { sabotages_used: 1 });
      if (target) updatePlayerStats(target.playerId, { times_sabotaged: 1 });
    }

    this.broadcast('item_bought', {
      buyerName: buyer.name,
      item,
      targetName: target?.name || null,
      scores: this.getScores()
    });
  }

  applyItem(buyerId, item, targetId) {
    const add = (pid, fx) => {
      if (!this.effects[pid]) this.effects[pid] = [];
      this.effects[pid].push(fx);
    };

    switch (item.effect) {
      case 'double_next': add(buyerId, { type: 'double_next' }); break;
      case 'block_sabotage': add(buyerId, { type: 'block_sabotage' }); break;
      case 'fifty_fifty': add(buyerId, { type: 'fifty_fifty' }); break;
      case 'extend_timer': add(buyerId, { type: 'extend_timer', value: item.effectValue }); break;
      case 'steal_points':
        if (targetId) add(buyerId, { type: 'steal_points', targetName: this.players[targetId]?.name });
        break;
      case 'reduce_timer':
        if (targetId) add(targetId, { type: 'reduce_timer', value: item.effectValue });
        break;
      case 'shuffle_answers':
        if (targetId) add(targetId, { type: 'shuffle_answers' }); break;
      case 'double_loss':
        if (targetId) add(targetId, { type: 'double_loss' }); break;
      case 'distraction':
        if (targetId) {
          const msg = item.messages[Math.floor(Math.random() * item.messages.length)];
          add(targetId, { type: 'distraction', message: msg });
        } break;
      case 'category_swap':
        if (targetId) add(targetId, { type: 'category_swap' }); break;
      case 'reverse_bets':
        if (targetId) add(targetId, { type: 'reverse_bets' }); break;
      case 'hide_answers':
        if (targetId) add(targetId, { type: 'hide_answers' }); break;
      case 'bb_please_lord':
        add(buyerId, { type: 'bb_triple' });
        add(buyerId, { type: 'zero_next_setup' });
        break;
      case 'bb_desperation': {
        const others = Object.entries(this.players).filter(([id]) => id !== buyerId);
        if (others.length > 0) {
          const [vid, vp] = others[Math.floor(Math.random() * others.length)];
          const stolen = Math.min(300, vp.points);
          vp.points -= stolen;
          this.players[buyerId].points += stolen;
          add(buyerId, { type: 'reduce_timer', value: 5 });
          add(buyerId, { type: 'desp_penalty' });
          this.broadcast('broke_steal', {
            thiefName: this.players[buyerId].name,
            victimName: vp.name,
            amount: stolen
          });
        } break;
      }
      case 'bb_slot': {
        const outs = item.outcomes || [1000, 800, 600, -200, -400, -500];
        const result = outs[Math.floor(Math.random() * outs.length)];
        this.players[buyerId].points = Math.max(0, this.players[buyerId].points + result);
        this.shopLocked[buyerId] = true;
        this.broadcast('slot_result', { name: this.players[buyerId].name, result });
        break;
      }
      case 'bb_nuclear':
        add(buyerId, { type: 'bb_nuclear' }); break;
      case 'bb_bankruptcy':
        this.players[buyerId].points += 500;
        Object.entries(this.players).forEach(([id, p]) => {
          if (id !== buyerId) p.points += 250;
        });
        add(buyerId, { type: 'bb_penalty' }); break;
    }
  }

  nextBoard() {
    clearTimeout(this.timer);
    Object.keys(this.shopLocked).forEach(id => { this.shopLocked[id] = false; });
    Object.keys(this.effects).forEach(id => {
      this.effects[id] = (this.effects[id] || []).filter(e => e.type !== 'bb_penalty');
    });
    this.curBoard++;
    if (this.curBoard >= this.totalBoards) {
      this.endGame();
      return;
    }
    this.phase = PHASE.BOARD;
    this.broadcast('next_board', {
      boardNumber: this.curBoard + 1,
      totalBoards: this.totalBoards,
      state: this.getState()
    });
  }

  endGame() {
    this.phase = PHASE.GAME_OVER;
    const scores = this.getScores();
    const winner = scores[0];
    const duration = Math.floor((Date.now() - this.gameStartTime) / 1000);

    const allUnlocked = {};
    scores.forEach((p, idx) => {
      const pid = p.playerId;
      if (!pid) return;
      const isWinner = idx === 0;
      const brokeCount = this.brokeBoyCounts[p.id] || 0;

      updatePlayerStats(pid, {
        games_played: 1,
        games_won: isWinner ? 1 : 0
      });

      if (isWinner && brokeCount > 0) {
        updatePlayerStats(pid, { broke_boy_wins: 1 });
      }

      updateSeasonStandings(pid, isWinner, p.points);

      const stats = db.prepare(`SELECT * FROM player_stats WHERE player_id=?`).get(pid);

      const gameData = {
        bets_won_this_game: this.betsWonThisGame[p.id] || 0,
        broke_boy_this_game: brokeCount,
        won_from_last: false,
        sabotaged_all: Object.keys(this.players).length > 2
      };

      const unlocked = checkAndUnlock(pid, stats, gameData);
      if (unlocked.length > 0) allUnlocked[p.id] = unlocked;
    });

    db.prepare(`
      INSERT INTO game_history (mode, players_json, winner_id, final_scores_json, boards_played, duration_seconds)
      VALUES ('multiplayer', ?, ?, ?, ?, ?)
    `).run(
      JSON.stringify(scores.map(s => s.playerId)),
      winner?.playerId || null,
      JSON.stringify(scores),
      this.totalBoards,
      duration
    );

    this.broadcast('game_over', {
      scores, winner, duration,
      achievements: allUnlocked
    });

    // Reset to lobby state after game-over so players can rematch
    setTimeout(() => {
      this.phase = PHASE.LOBBY;
      this.boards = [];
      this.curBoard = 0;
      this.curQ = null;
      this.answers = {};
      this.bets = {};
      this.boardsCleared = 0;
      Object.values(this.players).forEach(p => {
        p.points = 0;
        p.ready = false;
      });
      Object.keys(this.effects).forEach(id => { this.effects[id] = []; });
      Object.keys(this.shopLocked).forEach(id => { this.shopLocked[id] = false; });
      this.brokeBoyCounts = {};
      this.betsWonThisGame = {};
      this.broadcast('returned_to_lobby', this.getState());
    }, 60000);
  }

  getScores() {
    return Object.entries(this.players)
      .map(([id, p]) => ({
        id, name: p.name, color: p.color,
        points: p.points, title: p.title,
        initial: p.initial, playerId: p.playerId,
        ready: p.ready || false
      }))
      .sort((a, b) => b.points - a.points);
  }

  getPlayerList() {
    return Object.entries(this.players).map(([id, p]) => ({
      id, name: p.name, color: p.color, points: p.points
    }));
  }

  getState() {
    return {
      phase: this.phase,
      players: this.getScores(),
      spectators: this.spectators.size,
      curBoard: this.curBoard,
      totalBoards: this.totalBoards,
      hostId: this.hostId,
      board: this.boards[this.curBoard]?.map(cat => ({
        category: cat.category,
        is_custom: cat.is_custom,
        questions: cat.questions.map(q => ({
          point_value: q.point_value,
          answered: q.answered || false,
          has_media: q.has_media || false
        }))
      }))
    };
  }

  broadcast(event, data) {
    this.io.to(this.roomId).emit(event, data);
  }
}

module.exports = { Game };
