import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MediaDisplay from '../components/MediaDisplay';

const POINTS = { easy: 200, medium: 400, hard: 800 };

export default function QuestionEditor() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterDiff, setFilterDiff] = useState('');
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(false);

  const blank = {
    category: 'Anime', difficulty: 'easy', question: '',
    correct_answer: '', wrong_1: '', wrong_2: '', wrong_3: '',
    point_value: 200, added_by: null,
    media_url: '', media_type: '', media_duration_sec: 5
  };

  useEffect(() => {
    load();
    axios.get('/api/players').then(r => setPlayers(r.data));
  }, []);

  const load = () => axios.get('/api/questions').then(r => setQuestions(r.data));

  const save = async () => {
    if (!editing.question || !editing.correct_answer) return alert('Fill required fields');
    if (editing.id) {
      await axios.put(`/api/questions/${editing.id}`, editing);
    } else {
      await axios.post('/api/questions', editing);
    }
    setEditing(null);
    load();
  };

  const del = async () => {
    if (!editing?.id || !confirm('Delete this question?')) return;
    await axios.delete(`/api/questions/${editing.id}`);
    setEditing(null);
    load();
  };

  const upload = async (file) => {
    const fd = new FormData();
    fd.append('media', file);
    const r = await axios.post('/api/upload', fd);
    setEditing(e => ({ ...e, media_url: r.data.url, media_type: r.data.type }));
  };

  const filtered = questions.filter(q => {
    if (search && !q.question.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat && q.category !== filterCat) return false;
    if (filterDiff && q.difficulty !== filterDiff) return false;
    return true;
  });

  const cats = [...new Set(questions.map(q => q.category))];

  return (
    <div className="min-h-screen p-4 grid grid-cols-1 md:grid-cols-[400px_1fr] gap-4">
      <div className="bg-gray-900 p-4 rounded-lg flex flex-col h-screen">
        <div className="flex justify-between mb-2">
          <h2 className="font-bebas text-2xl text-yellow-400">QUESTIONS</h2>
          <button onClick={() => setEditing({ ...blank })} className="btn btn-primary text-sm">+ NEW</button>
        </div>
        <input className="input mb-2" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input mb-2" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All categories</option>
          {cats.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="input mb-2" value={filterDiff} onChange={e => setFilterDiff(e.target.value)}>
          <option value="">All difficulties</option>
          <option>easy</option><option>medium</option><option>hard</option>
        </select>
        <div className="flex-1 overflow-auto space-y-1 scrollbar-hide">
          {filtered.map(q => (
            <button key={q.id} onClick={() => setEditing(q)}
              className="w-full text-left p-2 rounded text-sm hover:bg-gray-800"
              style={{ background: editing?.id === q.id ? 'var(--bg3)' : 'transparent' }}>
              <span className="text-xs px-1 rounded" style={{ background: '#333' }}>{q.category}</span>
              {q.media_url && ' 🎬'}
              <div className="truncate">{q.question}</div>
            </button>
          ))}
        </div>
        <button onClick={() => navigate('/')} className="btn mt-2">← Menu</button>
      </div>

      <div className="bg-gray-900 p-6 rounded-lg overflow-auto">
        {!editing && <div className="text-gray-500 text-center mt-20">Select a question or click + NEW</div>}
        {editing && (
          <div className="space-y-3">
            <h3 className="font-bebas text-3xl text-yellow-400">{editing.id ? 'EDIT QUESTION' : 'NEW QUESTION'}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm block">Category</label>
                <input className="input" value={editing.category}
                  onChange={e => setEditing({ ...editing, category: e.target.value })} />
              </div>
              <div>
                <label className="text-sm block">Difficulty</label>
                <div className="flex gap-2">
                  {['easy', 'medium', 'hard'].map(d => (
                    <button key={d} onClick={() => setEditing({ ...editing, difficulty: d, point_value: POINTS[d] })}
                      className={`btn flex-1 ${editing.difficulty === d ? 'btn-primary' : ''}`}>{d}</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm block">Point Value</label>
              <input type="number" className="input" value={editing.point_value}
                onChange={e => setEditing({ ...editing, point_value: +e.target.value })} />
            </div>

            <div>
              <label className="text-sm block">Question</label>
              <textarea className="input min-h-[80px]" value={editing.question}
                onChange={e => setEditing({ ...editing, question: e.target.value })} />
            </div>

            <div>
              <label className="text-sm block text-green-400">✓ Correct Answer</label>
              <input className="input" style={{ borderColor: 'var(--correct)' }}
                value={editing.correct_answer}
                onChange={e => setEditing({ ...editing, correct_answer: e.target.value })} />
            </div>

            {[1, 2, 3].map(i => (
              <div key={i}>
                <label className="text-sm block text-red-400">✗ Wrong Answer {i}</label>
                <input className="input" style={{ borderColor: 'var(--wrong)' }}
                  value={editing[`wrong_${i}`]}
                  onChange={e => setEditing({ ...editing, [`wrong_${i}`]: e.target.value })} />
              </div>
            ))}

            <details className="bg-gray-800 p-3 rounded">
              <summary className="font-bebas text-lg cursor-pointer">📁 MEDIA (OPTIONAL)</summary>
              <div className="mt-3 space-y-2">
                <div>
                  <label className="text-sm block">Upload Image/Video</label>
                  <input type="file" accept="image/*,video/*"
                    onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
                </div>
                <div>
                  <label className="text-sm block">OR YouTube URL</label>
                  <input className="input" placeholder="https://youtube.com/..."
                    value={editing.media_url || ''}
                    onChange={e => {
                      const url = e.target.value;
                      const isYT = url.includes('youtube.com') || url.includes('youtu.be');
                      setEditing({ ...editing, media_url: url, media_type: isYT ? 'youtube' : (editing.media_type || 'image') });
                    }} />
                </div>
                {editing.media_url && (
                  <div>
                    <div className="text-sm">Preview:</div>
                    <MediaDisplay url={editing.media_url} type={editing.media_type} />
                    <div className="mt-2">
                      <label className="text-sm block">Duration: {editing.media_duration_sec}s</label>
                      <input type="range" min="3" max="15" value={editing.media_duration_sec || 5}
                        onChange={e => setEditing({ ...editing, media_duration_sec: +e.target.value })} />
                    </div>
                  </div>
                )}
              </div>
            </details>

            <div>
              <label className="text-sm block">Added By</label>
              <select className="input" value={editing.added_by || ''}
                onChange={e => setEditing({ ...editing, added_by: e.target.value ? +e.target.value : null })}>
                <option value="">Anonymous</option>
                {players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
            </div>

            <div className="flex gap-2">
              <button onClick={save} className="btn btn-primary flex-1">💾 SAVE</button>
              <button onClick={() => setPreview(true)} className="btn">▶ PREVIEW</button>
              {editing.id && <button onClick={del} className="btn btn-danger">🗑️ DELETE</button>}
            </div>
          </div>
        )}
      </div>

      {preview && editing && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
          <div className="bg-gray-900 max-w-2xl w-full p-6 rounded-lg">
            <h3 className="font-bebas text-2xl text-yellow-400 mb-3">PREVIEW</h3>
            {editing.media_url && (
              <div className="mb-4">
                <MediaDisplay url={editing.media_url} type={editing.media_type} />
                <div className="text-xs text-gray-400 mt-1">Will show for {editing.media_duration_sec}s</div>
              </div>
            )}
            <div className="font-bebas text-2xl mb-3">{editing.question}</div>
            <div className="grid grid-cols-2 gap-2">
              {[editing.correct_answer, editing.wrong_1, editing.wrong_2, editing.wrong_3].filter(Boolean).map((a, i) => (
                <div key={i} className={`p-3 rounded ${a === editing.correct_answer ? 'bg-green-700' : 'bg-gray-800'}`}>{a}</div>
              ))}
            </div>
            <button onClick={() => setPreview(false)} className="btn mt-4">Close Preview</button>
          </div>
        </div>
      )}
    </div>
  );
}
