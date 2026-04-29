const axios = require('axios');
const he = require('he');
const { db } = require('./database');

const OPENTDB = 'https://opentdb.com/api.php';
const POINTS = { easy: 200, medium: 400, hard: 800 };

const API_CATS = [
  { id: 9, name: 'General Knowledge' },
  { id: 11, name: 'Entertainment: Film' },
  { id: 12, name: 'Entertainment: Music' },
  { id: 14, name: 'Entertainment: Television' },
  { id: 15, name: 'Entertainment: Video Games' },
  { id: 17, name: 'Science & Nature' },
  { id: 18, name: 'Science: Computers' },
  { id: 21, name: 'Sports' },
  { id: 22, name: 'Geography' },
  { id: 23, name: 'History' },
  { id: 27, name: 'Animals' },
  { id: 31, name: 'Entertainment: Anime & Manga' }
];

const CUSTOM_CATS = [
  'Anime', 'Hip Hop', 'Sports', 'Gaming',
  'Pop Culture', 'Black Culture', 'Science & Tech', 'History'
];

async function fetchAPI(catId, diff, count = 2) {
  try {
    const res = await axios.get(OPENTDB, {
      params: { amount: count, type: 'multiple', difficulty: diff, category: catId },
      timeout: 5000
    });
    if (res.data.response_code !== 0) return [];
    return res.data.results.map(q => {
      const wrong = q.incorrect_answers.map(a => he.decode(a));
      const correct = he.decode(q.correct_answer);
      return {
        question: he.decode(q.question),
        correct_answer: correct,
        wrong_answers: wrong,
        answers: [...wrong, correct].sort(() => Math.random() - 0.5),
        point_value: POINTS[q.difficulty],
        is_custom: false,
        has_media: false
      };
    });
  } catch { return []; }
}

function getCustom(category, count = 5, excludeIds = []) {
  let rows;
  if (excludeIds && excludeIds.length) {
    const placeholders = excludeIds.map(() => '?').join(',');
    rows = db.prepare(
      `SELECT * FROM custom_questions WHERE category = ? AND id NOT IN (${placeholders}) ORDER BY RANDOM() LIMIT ?`
    ).all(category, ...excludeIds, count);
    if (rows.length < count) {
      const filler = db.prepare(
        `SELECT * FROM custom_questions WHERE category = ? ORDER BY RANDOM() LIMIT ?`
      ).all(category, count - rows.length);
      rows = rows.concat(filler);
    }
  } else {
    rows = db.prepare(`SELECT * FROM custom_questions WHERE category = ? ORDER BY RANDOM() LIMIT ?`).all(category, count);
  }
  return rows.map(q => {
    const isOpen = q.answer_type === 'open_ended';
    let accepted = [];
    if (q.accepted_answers) {
      try { accepted = JSON.parse(q.accepted_answers); } catch { accepted = []; }
    }
    return {
      id: q.id,
      question: q.question,
      correct_answer: q.correct_answer,
      wrong_answers: isOpen ? [] : [q.wrong_1, q.wrong_2, q.wrong_3].filter(Boolean),
      answers: isOpen ? null : [q.correct_answer, q.wrong_1, q.wrong_2, q.wrong_3].filter(Boolean).sort(() => Math.random() - 0.5),
      point_value: q.point_value,
      is_custom: true,
      has_media: !!q.media_url,
      media_url: q.media_url,
      media_type: q.media_type,
      media_duration: q.media_duration_sec || 5,
      category: q.category,
      answer_type: q.answer_type || 'multiple_choice',
      accepted_answers: accepted.length ? accepted : (isOpen ? [q.correct_answer] : null)
    };
  });
}

async function buildBoard(boardIndex, options = {}) {
  const { excludeCustomIds = [], excludeQuestionTexts = new Set() } = options;
  const shuffleCustom = [...CUSTOM_CATS].sort(() => Math.random() - 0.5);
  const shuffleAPI = [...API_CATS].sort(() => Math.random() - 0.5);
  const selectedCustom = shuffleCustom.slice(0, 2);
  const selectedAPI = shuffleAPI.slice(0, 3);
  const board = [];

  for (const cat of selectedCustom) {
    const qs = getCustom(cat, 5, excludeCustomIds);
    if (qs.length >= 3) {
      board.push({
        category: cat,
        questions: qs.slice(0, 5).map(q => ({ ...q, answered: false })),
        is_custom: true
      });
    }
  }

  for (const cat of selectedAPI) {
    if (board.length >= 5) break;
    const easy = await fetchAPI(cat.id, 'easy', 1);
    const med = await fetchAPI(cat.id, 'medium', 2);
    const hard = await fetchAPI(cat.id, 'hard', 2);
    const fresh = [...easy, ...med, ...hard].filter(q => !excludeQuestionTexts.has(q.question));
    if (fresh.length >= 3) {
      board.push({
        category: cat.name,
        questions: fresh.slice(0, 5).map(q => ({ ...q, answered: false })),
        is_custom: false
      });
    }
  }

  while (board.length < 5) {
    const fallback = shuffleCustom[board.length] || CUSTOM_CATS[Math.floor(Math.random() * CUSTOM_CATS.length)];
    if (!fallback) break;
    const qs = getCustom(fallback, 5, excludeCustomIds);
    if (qs.length === 0) break;
    board.push({
      category: fallback,
      questions: qs.map(q => ({ ...q, answered: false })),
      is_custom: true
    });
  }

  // Pad with placeholder if still short
  while (board.length < 5) {
    board.push({
      category: 'General',
      questions: Array(5).fill(null).map((_, i) => ({
        question: 'No question available.',
        correct_answer: 'Skip',
        wrong_answers: ['A', 'B', 'C'],
        answers: ['Skip', 'A', 'B', 'C'],
        point_value: 200 * (i + 1),
        answered: false,
        is_custom: false,
        has_media: false
      })),
      is_custom: false
    });
  }

  return board.slice(0, 5);
}

module.exports = { buildBoard, getCustom };
