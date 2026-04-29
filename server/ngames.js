/**
 * ngames.js — N Games Network client (Node.js / server-side)
 * Zero extra dependencies — uses Node's built-in `https` module.
 * Drop-in for the IB server to submit sessions and post wall messages.
 */

'use strict';

const https = require('https');

const SERVER   = 'https://ngames-server-production.up.railway.app';
const GAME_ID  = 'interrogating-blacks';
const TIMEOUT  = 8000;

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpPost(path, body) {
  return new Promise((resolve) => {
    let json;
    try { json = JSON.stringify(body); } catch { return resolve(null); }

    const url = new URL(SERVER + path);
    const req = https.request(
      {
        hostname: url.hostname,
        path:     url.pathname + url.search,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(json),
          'User-Agent':     'InterrogatingBlacks/1.0',
        },
      },
      (res) => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(TIMEOUT, () => { req.destroy(); resolve(null); });
    req.write(json);
    req.end();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Submit a completed solo run to the N Games Network.
 * @param {string} profile_id  — player username (keshawn, sean, …)
 * @param {number} score
 * @param {object} [extras]    — any extra data to store
 */
function submitSession(profile_id, score, extras = {}) {
  if (!profile_id) return Promise.resolve(null);
  return httpPost('/sessions', {
    profile_id,
    game_id: GAME_ID,
    score:   Number(score) || 0,
    data:    extras,
  });
}

/**
 * Post a message to the N Games crew wall.
 * Prefix with "@everyone" to trigger the Discord bot ping.
 * @param {string} profile_id
 * @param {string} content — max 500 chars
 */
function postToWall(profile_id, content) {
  if (!profile_id) return Promise.resolve(null);
  return httpPost('/wall/post', {
    profile_id,
    game_id: GAME_ID,
    content: String(content).slice(0, 500),
  });
}

module.exports = { submitSession, postToWall, GAME_ID };
