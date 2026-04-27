const axios = require('axios');
const he = require('he');
const { db } = require('./database');

const POINTS = { easy: 200, medium: 400, hard: 800 };

const OPENTDB_CATS = [
  { id: 9, name: 'General Knowledge' },
  { id: 11, name: 'Pop Culture' },
  { id: 12, name: 'Hip Hop' },
  { id: 14, name: 'Pop Culture' },
  { id: 15, name: 'Gaming' },
  { id: 16, name: 'Gaming' },
  { id: 17, name: 'Science & Tech' },
  { id: 18, name: 'Science & Tech' },
  { id: 19, name: 'Science & Tech' },
  { id: 20, name: 'Pop Culture' },
  { id: 21, name: 'Sports' },
  { id: 22, name: 'History' },
  { id: 23, name: 'History' },
  { id: 24, name: 'Pop Culture' },
  { id: 25, name: 'Pop Culture' },
  { id: 26, name: 'Pop Culture' },
  { id: 27, name: 'Science & Tech' },
  { id: 28, name: 'Science & Tech' },
  { id: 29, name: 'Pop Culture' },
  { id: 30, name: 'Science & Tech' },
  { id: 31, name: 'Anime' },
  { id: 32, name: 'Anime' }
];

const TRIVIA_API_CATS = [
  { slug: 'music', mapped: 'Hip Hop' },
  { slug: 'sport_and_leisure', mapped: 'Sports' },
  { slug: 'film_and_tv', mapped: 'Pop Culture' },
  { slug: 'arts_and_literature', mapped: 'Pop Culture' },
  { slug: 'history', mapped: 'History' },
  { slug: 'science', mapped: 'Science & Tech' },
  { slug: 'geography', mapped: 'History' },
  { slug: 'general_knowledge', mapped: 'Pop Culture' },
  { slug: 'food_and_drink', mapped: 'Pop Culture' },
  { slug: 'society_and_culture', mapped: 'Black Culture' }
];

let _openTDBToken = null;
async function getTDBToken() {
  if (_openTDBToken) return _openTDBToken;
  try {
    const r = await axios.get('https://opentdb.com/api_token.php?command=request', { timeout: 8000 });
    _openTDBToken = r.data?.token || null;
    return _openTDBToken;
  } catch { return null; }
}
async function resetTDBToken() {
  if (!_openTDBToken) return;
  try { await axios.get(`https://opentdb.com/api_token.php?command=reset&token=${_openTDBToken}`, { timeout: 8000 }); } catch {}
}

async function fetchOpenTDB(catId, diff, count = 50) {
  const token = await getTDBToken();
  try {
    const params = { amount: count, type: 'multiple', difficulty: diff, category: catId };
    if (token) params.token = token;
    const res = await axios.get('https://opentdb.com/api.php', { params, timeout: 10000 });
    if (res.data.response_code === 4) {
      // Token has returned every question; reset
      await resetTDBToken();
      return [];
    }
    if (res.data.response_code !== 0) return [];
    return res.data.results;
  } catch { return []; }
}

async function fetchTriviaAPI(category, difficulty, count = 50) {
  try {
    const res = await axios.get('https://the-trivia-api.com/v2/questions', {
      params: { categories: category, difficulties: difficulty, limit: count },
      timeout: 10000
    });
    return res.data.map(q => ({
      question: q.question?.text || '',
      correct_answer: q.correctAnswer,
      incorrect_answers: q.incorrectAnswers,
      difficulty: q.difficulty
    }));
  } catch { return []; }
}

function questionExists(text) {
  return !!db.prepare('SELECT id FROM custom_questions WHERE question = ?').get(text);
}

function insertQuestion(category, difficulty, q) {
  if (!q.question || !q.correct_answer || !q.incorrect_answers || q.incorrect_answers.length < 3) return false;
  const decoded = he.decode(q.question);
  if (questionExists(decoded)) return false;
  try {
    db.prepare(`
      INSERT INTO custom_questions
        (category, difficulty, question, correct_answer, wrong_1, wrong_2, wrong_3, point_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      category, difficulty,
      decoded,
      he.decode(q.correct_answer),
      he.decode(q.incorrect_answers[0]),
      he.decode(q.incorrect_answers[1]),
      he.decode(q.incorrect_answers[2]),
      POINTS[difficulty] || 200
    );
    return true;
  } catch { return false; }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runScrape({ passes = 1 } = {}) {
  const startCount = db.prepare('SELECT COUNT(*) as c FROM custom_questions').get().c;
  let added = 0;
  console.log(`[scrape] starting ${passes} pass(es). current=${startCount}`);

  for (let pass = 0; pass < passes; pass++) {
    // OpenTDB: every cat × every diff
    for (const cat of OPENTDB_CATS) {
      for (const diff of ['easy', 'medium', 'hard']) {
        const qs = await fetchOpenTDB(cat.id, diff, 50);
        for (const q of qs) if (insertQuestion(cat.name, diff, q)) added++;
        await sleep(800);
      }
    }
    // The Trivia API: every cat × every diff
    for (const tcat of TRIVIA_API_CATS) {
      for (const diff of ['easy', 'medium', 'hard']) {
        const qs = await fetchTriviaAPI(tcat.slug, diff, 50);
        for (const q of qs) if (insertQuestion(tcat.mapped, diff, q)) added++;
        await sleep(400);
      }
    }
    console.log(`[scrape] pass ${pass + 1}/${passes} done, total added so far: ${added}`);
  }

  const endCount = db.prepare('SELECT COUNT(*) as c FROM custom_questions').get().c;
  console.log(`[scrape] DONE start=${startCount} end=${endCount} added=${added}`);
  return { added, total: endCount, passes };
}

module.exports = { runScrape };
