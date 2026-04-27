const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Game } = require('./game');
const { SoloRun } = require('./solo');
const { db } = require('./database');
const { getPlayerAchievements, getPlayerStats, getSeasonStandings } = require('./achievements');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
const baseDir = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));

const uploadsDir = path.join(baseDir, 'uploads');
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
  const rows = db.prepare(`
    SELECT sr.player_id, p.display_name, p.color, p.avatar_initial, p.title,
           MIN(sr.total_time_ms) as best_time,
           MAX(sr.score) as best_score,
           COUNT(*) as runs
    FROM solo_runs sr JOIN players p ON p.id = sr.player_id
    GROUP BY sr.player_id ORDER BY best_time ASC
  `).all();
  res.json(rows);
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

  socket.on('start', ({ boardCount }) => games[socket.room]?.start(boardCount || 3));
  socket.on('select_q', ({ catIdx, qIdx }) => games[socket.room]?.selectQuestion(socket.id, catIdx, qIdx));
  socket.on('answer', ({ answer }) => games[socket.room]?.submitAnswer(socket.id, answer));
  socket.on('bet', ({ targetId, amount }) => games[socket.room]?.placeBet(socket.id, targetId, amount));
  socket.on('buy', ({ itemId, targetId }) => games[socket.room]?.buyItem(socket.id, itemId, targetId));
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

const PORT = 3847;
server.listen(PORT, () => console.log(`🎯 Interrogating Blacks :${PORT}`));
