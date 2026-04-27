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
  { id: 18, name: 'Science & Tech' },
  { id: 21, name: 'Sports' },
  { id: 23, name: 'History' },
  { id: 31, name: 'Anime' }
];

async function fetchOpenTDB(catId, diff, count = 10) {
  try {
    const res = await axios.get('https://opentdb.com/api.php', {
      params: { amount: count, type: 'multiple', difficulty: diff, category: catId },
      timeout: 8000
    });
    if (res.data.response_code !== 0) return [];
    return res.data.results;
  } catch { return []; }
}

async function fetchTriviaAPI(category, difficulty, count = 10) {
  try {
    const res = await axios.get('https://the-trivia-api.com/v2/questions', {
      params: { categories: category, difficulties: difficulty, limit: count },
      timeout: 8000
    });
    return res.data.map(q => ({
      question: q.question.text,
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
  if (questionExists(q.question)) return false;
  if (!q.correct_answer || !q.incorrect_answers || q.incorrect_answers.length < 3) return false;
  try {
    db.prepare(`
      INSERT INTO custom_questions
        (category, difficulty, question, correct_answer, wrong_1, wrong_2, wrong_3, point_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      category, difficulty,
      he.decode(q.question),
      he.decode(q.correct_answer),
      he.decode(q.incorrect_answers[0]),
      he.decode(q.incorrect_answers[1]),
      he.decode(q.incorrect_answers[2]),
      POINTS[difficulty] || 200
    );
    return true;
  } catch { return false; }
}

async function runScrape() {
  const startCount = db.prepare('SELECT COUNT(*) as c FROM custom_questions').get().c;
  let added = 0;

  for (const cat of OPENTDB_CATS) {
    for (const diff of ['easy', 'medium', 'hard']) {
      const qs = await fetchOpenTDB(cat.id, diff, 10);
      for (const q of qs) {
        if (insertQuestion(cat.name, diff, q)) added++;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const triviaCats = ['music', 'sport_and_leisure', 'film_and_tv', 'arts_and_literature', 'history', 'science', 'geography', 'general_knowledge', 'food_and_drink', 'society_and_culture'];
  const catMap = {
    music: 'Hip Hop', sport_and_leisure: 'Sports', film_and_tv: 'Pop Culture',
    arts_and_literature: 'Pop Culture', history: 'History', science: 'Science & Tech',
    geography: 'History', general_knowledge: 'Pop Culture',
    food_and_drink: 'Pop Culture', society_and_culture: 'Black Culture'
  };
  for (const tcat of triviaCats) {
    for (const diff of ['easy', 'medium', 'hard']) {
      const qs = await fetchTriviaAPI(tcat, diff, 10);
      for (const q of qs) {
        if (insertQuestion(catMap[tcat] || 'Pop Culture', diff, q)) added++;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const endCount = db.prepare('SELECT COUNT(*) as c FROM custom_questions').get().c;
  const ts = new Date().toISOString();
  console.log(`[scraper ${ts}] start=${startCount} end=${endCount} added=${added}`);
  return { added, total: endCount };
}

module.exports = { runScrape };
