const { db } = require('./database');

function checkAndUnlock(playerId, stats, gameData = {}) {
  const unlocked = [];
  const existing = db.prepare(`SELECT achievement_id FROM player_achievements WHERE player_id = ?`).all(playerId).map(r => r.achievement_id);
  const has = (id) => existing.includes(id);
  const unlock = (id) => {
    if (has(id)) return;
    try {
      db.prepare(`INSERT INTO player_achievements (player_id, achievement_id) VALUES (?, ?)`).run(playerId, id);
      const ach = db.prepare('SELECT * FROM achievements WHERE id=?').get(id);
      unlocked.push({
        id, name: ach?.name, description: ach?.description,
        icon: ach?.icon, rarity: ach?.rarity,
        unlocks_title: ach?.unlocks_title,
        unlocks_theme: ach?.unlocks_theme,
        unlocks_buttons: ach?.unlocks_buttons
      });
    } catch (e) {}
  };

  if (stats.games_won >= 1) unlock('first_win');
  if (stats.total_correct >= 1) unlock('first_correct');
  if (stats.total_bets_won >= 1) unlock('first_bet_win');
  if (stats.broke_boy_count >= 1) unlock('broke_boy_first');
  if (stats.sabotages_used >= 1) unlock('sabotage_first');
  if (stats.solo_games >= 1) unlock('solo_first');
  if (stats.custom_q_correct >= 1) unlock('custom_q_correct');
  if (stats.media_q_correct >= 1) unlock('media_q_correct');
  if (stats.streak_best >= 3) unlock('win_streak_3');
  if (stats.streak_best >= 5) unlock('win_streak_5');
  if (stats.current_streak >= 10) unlock('correct_streak_10');
  if (stats.current_streak >= 25) unlock('correct_streak_25');
  if (stats.games_won >= 10) unlock('win_10_games');
  if (stats.games_won >= 25) unlock('win_25_games');
  if (gameData.bets_won_this_game >= 5) unlock('bet_5_in_one');
  if (stats.total_bet_points_won >= 10000) unlock('bet_win_10k');
  if (stats.perfect_boards >= 1) unlock('perfect_board');
  if (stats.perfect_boards >= 5) unlock('perfect_5_boards');
  if (gameData.perfect_game) unlock('perfect_game');
  if (stats.broke_boy_wins >= 1) unlock('broke_boy_win');
  if (gameData.broke_boy_this_game >= 3) unlock('broke_boy_3');
  if (gameData.broke_boy_to_first) unlock('broke_boy_to_first');
  if (gameData.solo_time_ms && gameData.solo_time_ms < 300000) unlock('solo_under_5min');
  if (gameData.solo_perfect) unlock('solo_perfect');
  if (gameData.won_from_last) unlock('win_from_last');
  if (gameData.sabotaged_all) unlock('sabotage_every_player');
  if (stats.media_q_correct >= 5) unlock('media_q_5_correct');

  const customCount = db.prepare(`SELECT COUNT(*) as c FROM custom_questions WHERE added_by = ?`).get(playerId)?.c || 0;
  if (customCount >= 5) unlock('custom_5_added');
  if (customCount >= 20) unlock('custom_20_added');

  const soloLeader = db.prepare(`SELECT player_id, MIN(total_time_ms) as best FROM solo_runs GROUP BY player_id ORDER BY best ASC LIMIT 1`).get();
  if (soloLeader?.player_id === playerId) unlock('solo_world_record');

  return unlocked;
}

function updatePlayerStats(playerId, updates) {
  const sets = Object.entries(updates).map(([k]) => `${k} = ${k} + ?`).join(', ');
  db.prepare(`UPDATE player_stats SET ${sets} WHERE player_id = ?`).run(...Object.values(updates), playerId);
}

function getPlayerAchievements(playerId) {
  return db.prepare(`
    SELECT a.*, pa.unlocked_at,
           CASE WHEN pa.achievement_id IS NOT NULL THEN 1 ELSE 0 END as unlocked
    FROM achievements a
    LEFT JOIN player_achievements pa ON pa.achievement_id = a.id AND pa.player_id = ?
    ORDER BY CASE a.rarity WHEN 'legendary' THEN 1 WHEN 'epic' THEN 2 WHEN 'rare' THEN 3 ELSE 4 END, pa.unlocked_at DESC
  `).all(playerId);
}

function getPlayerStats(playerId) {
  return db.prepare(`
    SELECT ps.*, p.username, p.display_name, p.color, p.title, p.cosmetic_theme, p.cosmetic_buttons
    FROM player_stats ps JOIN players p ON p.id = ps.player_id
    WHERE ps.player_id = ?
  `).get(playerId);
}

function getSeasonStandings(season = 1) {
  return db.prepare(`
    SELECT ss.*, p.display_name, p.color, p.title, p.avatar_initial
    FROM season_standings ss JOIN players p ON p.id = ss.player_id
    WHERE ss.season = ? ORDER BY ss.wins DESC, ss.points DESC
  `).all(season);
}

function updateSeasonStandings(playerId, won, points, season = 1) {
  db.prepare(`
    INSERT INTO season_standings (season, player_id, wins, points, games)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(season, player_id) DO UPDATE SET
      wins = wins + ?, points = points + ?, games = games + 1
  `).run(season, playerId, won ? 1 : 0, points, won ? 1 : 0, points);
}

module.exports = { checkAndUnlock, updatePlayerStats, getPlayerAchievements, getPlayerStats, getSeasonStandings, updateSeasonStandings };
