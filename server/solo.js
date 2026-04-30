const { buildBoard } = require('./questions');
const { db } = require('./database');
const { checkAndUnlock, updatePlayerStats } = require('./achievements');
const ngames = require('./ngames');
const { calculateEfficiencyScore, TOTAL_QUESTIONS_PER_BOARD } = require('./efficiency');

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

class SoloRun {
  constructor(io, socketId, playerId) {
    this.io = io;
    this.socketId = socketId;
    this.playerId = playerId;
    this.board = null;
    this.startTime = null;
    this.correct = 0;
    this.wrong = 0;
    this.score = 0;
    this.curQ = null;
    this.qStartTime = null;
    this.timer = null;
    this.phase = 'init';
  }

  async start() {
    this.board = await buildBoard(0, {
      excludeCustomIds: [],
      excludeQuestionTexts: new Set()
    });
    this.startTime = Date.now();
    this.phase = 'board';
    this.emit('solo_started', {
      board: this.board.map(cat => ({
        category: cat.category,
        is_custom: cat.is_custom,
        questions: cat.questions.map(q => ({
          point_value: q.point_value,
          answered: false,
          has_media: q.has_media || false
        }))
      }))
    });
  }

  selectQuestion(catIdx, qIdx) {
    if (this.phase !== 'board') return;
    const cat = this.board[catIdx];
    if (!cat) return;
    const q = cat.questions[qIdx];
    if (!q || q.answered) return;

    this.curQ = { ...q, catIdx, qIdx };
    this.qStartTime = Date.now();

    if (q.has_media && q.media_url) {
      this.phase = 'media';
      this.emit('solo_media', {
        media_url: q.media_url,
        media_type: q.media_type,
        duration: q.media_duration || 5,
        point_value: q.point_value
      });
      this.timer = setTimeout(() => this.showSoloQuestion(), (q.media_duration || 5) * 1000);
    } else {
      this.showSoloQuestion();
    }
  }

  showSoloQuestion() {
    this.phase = 'question';
    this.qStartTime = Date.now();
    const isOpen = this.curQ.answer_type === 'open_ended';
    this.emit('solo_question', {
      question: this.curQ.question,
      answers: isOpen ? null : (this.curQ.answers || [this.curQ.correct_answer, ...this.curQ.wrong_answers].sort(() => Math.random() - 0.5)),
      answer_type: this.curQ.answer_type || 'multiple_choice',
      point_value: this.curQ.point_value,
      category: this.curQ.category,
      time_limit: 20
    });
    this.timer = setTimeout(() => this.submitAnswer(null), 20000);
  }

  submitAnswer(answer) {
    if (this.phase !== 'question') return;
    clearTimeout(this.timer);
    const q = this.curQ;
    const correct = q.correct_answer;
    const isCorrect = isAnswerCorrect(q, answer);
    const elapsed = Date.now() - this.qStartTime;

    let earned = 0;
    if (isCorrect) {
      const timeBonus = Math.max(0, 1 - (elapsed / 20000));
      earned = Math.round(q.point_value * (1 + timeBonus * 0.5));
      this.correct++;
    } else {
      this.wrong++;
    }
    this.score += earned;
    this.board[q.catIdx].questions[q.qIdx].answered = true;

    this.emit('solo_reveal', {
      correct_answer: correct,
      player_answer: answer,
      is_correct: isCorrect,
      earned, time_ms: elapsed,
      total_score: this.score
    });

    const allDone = this.board.every(cat => cat.questions.every(q => q.answered));
    if (allDone) {
      setTimeout(() => this.finish(), 2000);
    } else {
      setTimeout(() => {
        this.phase = 'board';
        this.emit('solo_board', {
          board: this.board.map(cat => ({
            category: cat.category,
            questions: cat.questions.map(q => ({
              point_value: q.point_value,
              answered: q.answered,
              has_media: q.has_media || false
            }))
          })),
          score: this.score
        });
      }, 1500);
    }
  }

  finish() {
    const totalTime = Date.now() - this.startTime;
    const isPerfect = this.wrong === 0;

    // Compute efficiency score for this run
    const eff = calculateEfficiencyScore(this.score, this.correct, TOTAL_QUESTIONS_PER_BOARD, totalTime);

    // Check records BEFORE inserting this run so we compare against previous data only.
    // Efficiency score is now the canonical record for both PB and crew record.
    const prevGlobalBest = db.prepare(`SELECT MAX(efficiency_score) as best FROM solo_runs`).get()?.best || 0;
    const prevPersonalBest = db.prepare(`SELECT MAX(efficiency_score) as best FROM solo_runs WHERE player_id=?`).get(this.playerId)?.best || 0;

    const isWorldRecord = eff.finalScore > prevGlobalBest;
    const isPB          = eff.finalScore > prevPersonalBest;

    db.prepare(`INSERT INTO solo_runs (player_id, boards_completed, total_time_ms, total_correct, total_wrong, score, efficiency_score, accuracy_pct, time_bonus_pct) VALUES (?,1,?,?,?,?,?,?,?)`)
      .run(this.playerId, totalTime, this.correct, this.wrong, this.score, eff.finalScore, eff.accuracy, eff.timeBonus);

    updatePlayerStats(this.playerId, { solo_games: 1 });

    // Keep solo_best_time_ms in sync with the player's actual fastest run (independent of efficiency).
    db.prepare(`UPDATE player_stats SET solo_best_time_ms = ? WHERE player_id = ? AND (solo_best_time_ms IS NULL OR solo_best_time_ms > ?)`)
      .run(totalTime, this.playerId, totalTime);

    const leaderboard = db.prepare(`
      SELECT sr.player_id, p.display_name, p.color,
             MIN(sr.total_time_ms) as best_time,
             MAX(sr.score) as best_score,
             MAX(sr.efficiency_score) as best_efficiency
      FROM solo_runs sr JOIN players p ON p.id = sr.player_id
      GROUP BY sr.player_id ORDER BY best_efficiency DESC LIMIT 10
    `).all();

    const stats = db.prepare(`SELECT * FROM player_stats WHERE player_id=?`).get(this.playerId);
    const unlocked = checkAndUnlock(this.playerId, stats, {
      solo_time_ms: totalTime,
      solo_perfect: isPerfect,
      solo_world_record: leaderboard[0]?.player_id === this.playerId
    });

    this.phase = 'done';
    this.emit('solo_finished', {
      total_time_ms: totalTime,
      correct: this.correct,
      wrong: this.wrong,
      score: this.score,
      efficiency_score:      eff.finalScore,
      accuracy_pct:          eff.accuracy,
      time_bonus_pct:        eff.timeBonus,
      efficiency_multiplier: eff.efficiencyMultiplier,
      total_questions:       TOTAL_QUESTIONS_PER_BOARD,
      is_pb: isPB,
      is_world_record: isWorldRecord,
      is_perfect: isPerfect,
      leaderboard,
      achievements: unlocked
    });

    // ── N Games Network ───────────────────────────────────────────────────────
    // Fire-and-forget: submit session + wall post (never block the socket response)
    setImmediate(() => {
      try {
        const player = db.prepare(`SELECT username, display_name FROM players WHERE id=?`).get(this.playerId);
        if (!player) return;

        const profileId   = player.username;
        const displayName = player.display_name;
        const mins        = Math.floor(totalTime / 60000);
        const wholeSecs   = Math.floor((totalTime % 60000) / 1000);
        const timeStr     = `${mins}:${String(wholeSecs).padStart(2, '0')}`;
        const scoreStr    = this.score.toLocaleString();
        const effStr      = eff.finalScore.toLocaleString();
        const total       = TOTAL_QUESTIONS_PER_BOARD;

        // Submit efficiency score (the canonical leaderboard score) for XP/launcher
        ngames.submitSession(profileId, eff.finalScore, {
          total_time_ms:        totalTime,
          correct:              this.correct,
          wrong:                this.wrong,
          base_score:           this.score,
          efficiency_score:     eff.finalScore,
          accuracy_pct:         eff.accuracy,
          time_bonus_pct:       eff.timeBonus,
          efficiency_multiplier: eff.efficiencyMultiplier,
          is_perfect:           isPerfect,
          is_world_record:      isWorldRecord,
          is_pb:                isPB
        }).catch(() => {});

        // Wall post — uses efficiency score; @everyone on new crew (efficiency) record
        const header = isWorldRecord
          ? `@everyone 🏆🏆 NEW CREW EFFICIENCY RECORD! 🏆🏆\n${displayName} just set the bar.`
          : isPB
            ? `🌟 NEW PERSONAL BEST! 🌟\n${displayName} just topped their own efficiency.`
            : isPerfect
              ? `💯 FLAWLESS RUN by ${displayName}!`
              : `🐺 NEW SOLO RUN — ${displayName}`;

        const wallMsg =
          `${header}\n` +
          `⚡ Time: ${timeStr}\n` +
          `🎯 Accuracy: ${this.correct}/${total} (${eff.accuracy}%)\n` +
          `💰 Base Score: $${scoreStr}\n` +
          `⭐ Efficiency Score: $${effStr} (×${eff.efficiencyMultiplier.toFixed(2)})`;

        ngames.postToWall(profileId, wallMsg).catch(() => {});
      } catch (e) {
        // Never crash the game over an analytics failure
        console.warn('[ngames] wall post failed:', e.message);
      }
    });
  }

  emit(event, data) {
    this.io.to(this.socketId).emit(event, data);
  }
}

module.exports = { SoloRun };
