const path = require('path');
const fs = require('fs');

// ── Crash-to-file so users can see what happened when double-clicked ──
const _baseDirEarly = process.env.DATA_DIR
  || (process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..'));
try { if (!fs.existsSync(_baseDirEarly)) fs.mkdirSync(_baseDirEarly, { recursive: true }); } catch {}
const _logFile = path.join(_baseDirEarly, 'interrogating-blacks.log');
function _log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(_logFile, line); } catch {}
  try { console.log(msg); } catch {}
}
process.on('uncaughtException', (err) => {
  _log('UNCAUGHT: ' + (err?.stack || err));
  setTimeout(() => process.exit(1), 100);
});
process.on('unhandledRejection', (err) => {
  _log('UNHANDLED REJECTION: ' + (err?.stack || err));
});
_log('=== Interrogating Blacks starting ===');
_log('execPath: ' + process.execPath);
_log('cwd: ' + process.cwd());
_log('node: ' + process.version);

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const cron = require('node-cron');
const { Game } = require('./game');
const { SoloRun } = require('./solo');
const { db } = require('./database');
const { getPlayerAchievements, getPlayerStats, getSeasonStandings } = require('./achievements');
const { runScrape } = require('./scraper');
_log('Modules loaded.');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
const dataDir = process.env.DATA_DIR
  || (process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..'));
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));

const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.get('/api/players', (req, res) => {
  res.json(db.prepare('SELECT * FROM players ORDER BY id').all());
});

app.put('/api/players/:id', (req, res) => {
  const { title, cosmetic_theme, cosmetic_buttons } = req.body;
  db.prepare(`UPDATE players SET title=?, cosmetic_theme=?, cosmetic_buttons=? WHERE id=?`)
    .run(title, cosmetic_theme, cosmetic_buttons, req.params.id);
  res.json({ status: 'ok' });
});

app.get('/api/players/:id/achievements', (req, res) => {
  res.json(getPlayerAchievements(req.params.id));
});

app.get('/api/players/:id/stats', (req, res) => {
  res.json(getPlayerStats(req.params.id));
});

app.get('/api/standings', (req, res) => {
  res.json(getSeasonStandings(req.query.season || 1));
});

app.get('/api/solo/leaderboard', (req, res) => {
  // For each player, fetch their best-by-efficiency, fastest, and most-accurate runs.
  const players = db.prepare(`
    SELECT DISTINCT sr.player_id, p.display_name, p.color, p.avatar_initial, p.title
    FROM solo_runs sr JOIN players p ON p.id = sr.player_id
  `).all();

  const bestEff = db.prepare(`
    SELECT efficiency_score, total_time_ms, total_correct, accuracy_pct, score
    FROM solo_runs
    WHERE player_id = ?
    ORDER BY efficiency_score DESC, total_time_ms ASC
    LIMIT 1
  `);
  const fastest = db.prepare(`
    SELECT total_time_ms, total_correct, accuracy_pct
    FROM solo_runs
    WHERE player_id = ?
    ORDER BY total_time_ms ASC
    LIMIT 1
  `);
  const mostAccurate = db.prepare(`
    SELECT accuracy_pct, total_time_ms, score
    FROM solo_runs
    WHERE player_id = ?
    ORDER BY accuracy_pct DESC, total_time_ms ASC
    LIMIT 1
  `);
  const totals = db.prepare(`
    SELECT COUNT(*) as total_runs, MAX(score) as best_raw_score
    FROM solo_runs
    WHERE player_id = ?
  `);

  const enriched = players.map(p => {
    const e = bestEff.get(p.player_id) || {};
    const f = fastest.get(p.player_id) || {};
    const a = mostAccurate.get(p.player_id) || {};
    const t = totals.get(p.player_id) || {};
    return {
      ...p,
      best_efficiency:    e.efficiency_score || 0,
      best_eff_time:      e.total_time_ms || 0,
      best_eff_correct:   e.total_correct || 0,
      best_eff_accuracy:  e.accuracy_pct || 0,
      best_eff_points:    e.score || 0,
      best_raw_time:      f.total_time_ms || 0,
      speed_run_correct:  f.total_correct || 0,
      speed_run_accuracy: f.accuracy_pct || 0,
      best_accuracy:      a.accuracy_pct || 0,
      accuracy_run_time:  a.total_time_ms || 0,
      accuracy_run_points:a.score || 0,
      total_runs:         t.total_runs || 0,
      best_raw_score:     t.best_raw_score || 0
    };
  });

  enriched.sort((x, y) => (y.best_efficiency - x.best_efficiency) || (x.best_raw_time - y.best_raw_time));

  const speedCrown    = enriched.filter(p => p.best_raw_time > 0).reduce((b, p) => !b || p.best_raw_time < b.best_raw_time ? p : b, null);
  const accuracyCrown = enriched.reduce((b, p) => !b || p.best_accuracy > b.best_accuracy ? p : b, null);
  const overallCrown  = enriched[0];

  const speedSorted = [...enriched].filter(p => p.best_raw_time > 0).sort((x, y) => x.best_raw_time - y.best_raw_time);
  const accSorted   = [...enriched].sort((x, y) => y.best_accuracy - x.best_accuracy);

  const result = enriched.map((p, idx) => ({
    ...p,
    overall_rank:   idx + 1,
    speed_rank:     (speedSorted.findIndex(x => x.player_id === p.player_id) + 1) || null,
    accuracy_rank:  accSorted.findIndex(x => x.player_id === p.player_id) + 1,
    has_overall_crown:  !!overallCrown && p.player_id === overallCrown.player_id && p.best_efficiency > 0,
    has_speed_crown:    !!speedCrown && p.player_id === speedCrown.player_id,
    has_accuracy_crown: !!accuracyCrown && p.player_id === accuracyCrown.player_id && p.best_accuracy > 0
  }));

  res.json(result);
});

app.get('/api/questions', (req, res) => {
  const { category, difficulty } = req.query;
  let query = 'SELECT * FROM custom_questions';
  const params = [];
  const where = [];
  if (category) { where.push('category=?'); params.push(category); }
  if (difficulty) { where.push('difficulty=?'); params.push(difficulty); }
  if (where.length) query += ' WHERE ' + where.join(' AND ');
  query += ' ORDER BY created_at DESC';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/questions', (req, res) => {
  const { category, difficulty, question, correct_answer, wrong_1, wrong_2, wrong_3, point_value, added_by, media_url, media_type, media_duration_sec } = req.body;
  const r = db.prepare(`INSERT INTO custom_questions (category, difficulty, question, correct_answer, wrong_1, wrong_2, wrong_3, point_value, added_by, media_url, media_type, media_duration_sec) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(category, difficulty, question, correct_answer, wrong_1, wrong_2, wrong_3, point_value, added_by || null, media_url || null, media_type || null, media_duration_sec || 5);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/questions/:id', (req, res) => {
  const { category, difficulty, question, correct_answer, wrong_1, wrong_2, wrong_3, point_value, media_url, media_type, media_duration_sec } = req.body;
  db.prepare(`UPDATE custom_questions SET category=?, difficulty=?, question=?, correct_answer=?, wrong_1=?, wrong_2=?, wrong_3=?, point_value=?, media_url=?, media_type=?, media_duration_sec=? WHERE id=?`)
    .run(category, difficulty, question, correct_answer, wrong_1, wrong_2, wrong_3, point_value, media_url || null, media_type || null, media_duration_sec || 5, req.params.id);
  res.json({ status: 'ok' });
});

app.delete('/api/questions/:id', (req, res) => {
  db.prepare('DELETE FROM custom_questions WHERE id=?').run(req.params.id);
  res.json({ status: 'ok' });
});

app.get('/api/questions/categories', (req, res) => {
  const rows = db.prepare(`SELECT DISTINCT category FROM custom_questions ORDER BY category`).all();
  res.json(rows.map(r => r.category));
});

app.post('/api/upload', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  const type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  res.json({ url, type, filename: req.file.filename });
});

app.get('/api/cosmetics', (req, res) => {
  res.json(db.prepare('SELECT * FROM cosmetics').all());
});

app.get('/api/history', (req, res) => {
  res.json(db.prepare(`SELECT * FROM game_history ORDER BY played_at DESC LIMIT 20`).all());
});

// Diagnostic: lets you verify ngames connectivity from any deployed IB server.
//   POST /api/admin/test-ngames?profile=keshawn&score=42
app.post('/api/admin/test-ngames', async (req, res) => {
  try {
    const ngames = require('./ngames');
    const profile = req.query.profile || 'keshawn';
    const score = parseInt(req.query.score) || 1;
    const session = await ngames.submitSession(profile, score, { test: true, ts: Date.now() });
    const wall = await ngames.postToWall(profile, `🧪 IB ngames diagnostic test (score=${score})`);
    res.json({ ok: true, session, wall });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/admin/scrape', async (req, res) => {
  try {
    const passes = Math.min(20, Math.max(1, parseInt(req.query.passes) || 1));
    const result = await runScrape({ passes });
    res.json({ status: 'ok', ...result });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/questions/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM custom_questions').get().c;
  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as count FROM custom_questions GROUP BY category ORDER BY count DESC
  `).all();
  const byDifficulty = db.prepare(`
    SELECT difficulty, COUNT(*) as count FROM custom_questions GROUP BY difficulty ORDER BY count DESC
  `).all();
  const open = db.prepare(`SELECT COUNT(*) as c FROM custom_questions WHERE answer_type='open_ended'`).get().c;
  const media = db.prepare(`SELECT COUNT(*) as c FROM custom_questions WHERE media_url IS NOT NULL AND media_url != ''`).get().c;
  res.json({ total, open_ended: open, media, byCategory, byDifficulty });
});

app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.send('Run `npm run build` then restart, or use `npm run dev` for development.');
});

const games = {};
const soloRuns = {};

io.on('connection', socket => {
  console.log('Connected:', socket.id);

  socket.on('join', ({ playerId, room = 'ngames', spectate = false }) => {
    socket.join(room);
    socket.room = room;
    socket.playerId = playerId;
    if (!games[room]) games[room] = new Game(io, room);
    if (spectate) {
      games[room].addSpectator(socket.id);
    } else {
      const player = db.prepare('SELECT * FROM players WHERE id=?').get(playerId);
      if (player) games[room].addPlayer(socket.id, player);
    }
  });

  socket.on('ready', () => games[socket.room]?.toggleReady(socket.id));
  socket.on('request_state', () => games[socket.room]?.sendStateTo(socket.id));
  socket.on('start', ({ boardCount }) => games[socket.room]?.start(boardCount || 3, socket.id));
  socket.on('select_q', ({ catIdx, qIdx }) => games[socket.room]?.selectQuestion(socket.id, catIdx, qIdx));
  socket.on('answer', ({ answer }) => games[socket.room]?.submitAnswer(socket.id, answer));
  socket.on('bet', ({ targetId, amount }) => games[socket.room]?.placeBet(socket.id, targetId, amount));
  socket.on('buy', ({ itemId, targetId }) => games[socket.room]?.buyItem(socket.id, itemId, targetId));
  socket.on('deploy_item', ({ itemId, targetId }) => games[socket.room]?.deployItem(socket.id, itemId, targetId));
  socket.on('host_skip', () => games[socket.room]?.hostSkipQuestion(socket.id));
  socket.on('host_extend_timer', () => games[socket.room]?.hostExtendTimer(socket.id));
  socket.on('host_close_shop', () => games[socket.room]?.hostCloseShop(socket.id));
  socket.on('host_veto', ({ catIdx }) => games[socket.room]?.hostVetoCategory(socket.id, catIdx));

  socket.on('solo_start', ({ playerId }) => {
    const run = new SoloRun(io, socket.id, playerId);
    soloRuns[socket.id] = run;
    run.start();
  });
  socket.on('solo_select', ({ catIdx, qIdx }) => soloRuns[socket.id]?.selectQuestion(catIdx, qIdx));
  socket.on('solo_answer', ({ answer }) => soloRuns[socket.id]?.submitAnswer(answer));

  socket.on('disconnect', () => {
    if (socket.room) games[socket.room]?.removePlayer(socket.id);
    delete soloRuns[socket.id];
  });
});

// Weekly scrape: every Sunday at 03:00 UTC
cron.schedule('0 3 * * 0', () => {
  console.log('[cron] weekly scrape starting...');
  runScrape().catch(err => console.error('[cron] scrape failed:', err));
}, { timezone: 'UTC' });

// Run once at startup if DB has < 100 questions
const initialCount = db.prepare('SELECT COUNT(*) as c FROM custom_questions').get().c;
if (initialCount < 100) {
  console.log(`[startup] only ${initialCount} questions, kicking off initial scrape...`);
  setTimeout(() => runScrape().catch(err => console.error('[startup scrape] failed:', err)), 5000);
}

const PORT = process.env.PORT || 3847;
server.listen(PORT, '0.0.0.0', () => {
  _log(`🎯 Interrogating Blacks :${PORT} (data: ${dataDir})`);
  _log(`Open http://localhost:${PORT} in your browser`);
  if (process.pkg && !process.env.PORT) {
    // Auto-open browser when run from exe
    const url = `http://localhost:${PORT}`;
    const { exec } = require('child_process');
    exec(`start "" "${url}"`, () => {});
  }
});
server.on('error', (err) => _log('SERVER ERROR: ' + (err?.stack || err)));
