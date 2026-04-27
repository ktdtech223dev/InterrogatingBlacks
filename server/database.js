const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const dataDir = process.env.DATA_DIR
  || (process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..'));
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'interrogating.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    color TEXT NOT NULL,
    avatar_initial TEXT NOT NULL,
    title TEXT DEFAULT 'Rookie',
    cosmetic_theme TEXT DEFAULT 'default',
    cosmetic_buttons TEXT DEFAULT 'default',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS player_stats (
    player_id INTEGER PRIMARY KEY REFERENCES players(id),
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    solo_games INTEGER DEFAULT 0,
    solo_best_time_ms INTEGER,
    solo_best_board_count INTEGER,
    total_correct INTEGER DEFAULT 0,
    total_wrong INTEGER DEFAULT 0,
    total_bets_placed INTEGER DEFAULT 0,
    total_bets_won INTEGER DEFAULT 0,
    total_bet_points_won INTEGER DEFAULT 0,
    sabotages_used INTEGER DEFAULT 0,
    times_sabotaged INTEGER DEFAULT 0,
    broke_boy_count INTEGER DEFAULT 0,
    broke_boy_wins INTEGER DEFAULT 0,
    biggest_win_pts INTEGER DEFAULT 0,
    biggest_comeback_pts INTEGER DEFAULT 0,
    perfect_boards INTEGER DEFAULT 0,
    custom_q_correct INTEGER DEFAULT 0,
    media_q_correct INTEGER DEFAULT 0,
    streak_best INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS game_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT DEFAULT 'multiplayer',
    players_json TEXT NOT NULL,
    winner_id INTEGER REFERENCES players(id),
    final_scores_json TEXT NOT NULL,
    boards_played INTEGER,
    duration_seconds INTEGER,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS season_standings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season INTEGER DEFAULT 1,
    player_id INTEGER REFERENCES players(id),
    wins INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    games INTEGER DEFAULT 0,
    UNIQUE(season, player_id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    rarity TEXT DEFAULT 'common',
    unlocks_title TEXT,
    unlocks_theme TEXT,
    unlocks_buttons TEXT
  );

  CREATE TABLE IF NOT EXISTS player_achievements (
    player_id INTEGER REFERENCES players(id),
    achievement_id TEXT REFERENCES achievements(id),
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, achievement_id)
  );

  CREATE TABLE IF NOT EXISTS custom_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    question TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    wrong_1 TEXT NOT NULL,
    wrong_2 TEXT NOT NULL,
    wrong_3 TEXT NOT NULL,
    point_value INTEGER NOT NULL,
    media_url TEXT,
    media_type TEXT,
    media_duration_sec INTEGER DEFAULT 5,
    added_by INTEGER REFERENCES players(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS solo_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER REFERENCES players(id),
    boards_completed INTEGER NOT NULL,
    total_time_ms INTEGER NOT NULL,
    total_correct INTEGER NOT NULL,
    total_wrong INTEGER NOT NULL,
    score INTEGER NOT NULL,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cosmetics (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    preview_css TEXT,
    unlock_requirement TEXT NOT NULL
  );
`);

function seedPlayers() {
  const count = db.prepare('SELECT COUNT(*) as c FROM players').get().c;
  if (count > 0) return;
  const ins = db.prepare(`INSERT INTO players (username, display_name, color, avatar_initial) VALUES (?, ?, ?, ?)`);
  const crew = [
    ['keshawn', "Ke'Shawn", '#FF69B4', 'K'],
    ['sean', 'Sean', '#2E8B57', 'S'],
    ['amari', 'Amari', '#FFD700', 'A'],
    ['dart', 'Dart', '#722F37', 'D'],
    ['tyheim', 'Tyheim', '#FF6B35', 'T'],
    ['arisa', 'Arisa', '#9B59B6', 'R']
  ];
  crew.forEach(p => {
    const r = ins.run(...p);
    db.prepare(`INSERT INTO player_stats (player_id) VALUES (?)`).run(r.lastInsertRowid);
  });
}

function seedAchievements() {
  const count = db.prepare('SELECT COUNT(*) as c FROM achievements').get().c;
  if (count > 0) return;
  const ins = db.prepare(`INSERT INTO achievements (id, name, description, icon, rarity, unlocks_title, unlocks_theme, unlocks_buttons) VALUES (?,?,?,?,?,?,?,?)`);
  const achievements = [
    ['first_win','First Blood','Win your first game of Interrogating Blacks','🏆','common','Winner',null,null],
    ['first_correct','Got One','Answer your first question correctly','✅','common',null,null,null],
    ['first_bet_win','Smart Money','Win your first bet','💰','common','The Bookie',null,null],
    ['broke_boy_first','Rock Bottom','Use the Broke Boy shop for the first time','🪦','common','Broke Boy',null,null],
    ['sabotage_first','Foul Play','Use your first sabotage','💀','common',null,null,null],
    ['solo_first','Lone Wolf','Complete your first solo run','🐺','common','Solo Runner',null,null],
    ['custom_q_correct','Know Your People','Answer a custom crew question correctly','👥','common',null,null,null],
    ['media_q_correct','Eyes Open','Answer a media question correctly','👁️','common',null,null,null],
    ['win_streak_3','On Fire','Win 3 games in a row','🔥','rare','Unstoppable','fire_theme',null],
    ['perfect_board','Perfect Round','Answer every question on a board correctly','💯','rare','Perfectionist',null,'gold_buttons'],
    ['bet_5_in_one','All In','Win 5 bets in a single game','🎲','rare','The Gambler',null,null],
    ['broke_boy_win','Cinderella Story','Win a game after using the Broke Boy shop','👑','rare','The Comeback Kid','dark_theme',null],
    ['solo_under_5min','Speed Demon','Clear a solo board in under 5 minutes','⚡','rare','Speed Runner',null,'lightning_buttons'],
    ['sabotage_every_player','Equal Opportunity','Sabotage every other player in one game','☢️','rare','Menace',null,null],
    ['correct_streak_10','Certified','Answer 10 questions correctly in a row','🎓','rare','Certified Genius','scholar_theme',null],
    ['win_from_last','Dead Man Walking','Win a game after being in last place','💀','rare','Ghost',null,null],
    ['custom_5_added','Content Creator','Add 5 custom questions to the library','✏️','rare','The Writer',null,null],
    ['media_q_5_correct','Sharp Eyes','Answer 5 media questions correctly','🎬','rare','Director',null,null],
    ['win_streak_5','Legendary Run','Win 5 games in a row','🌟','epic','GOAT','champion_theme','rainbow_buttons'],
    ['win_10_games','Veteran','Win 10 total games','🎖️','epic','Veteran','veteran_theme',null],
    ['perfect_game','Untouchable','Win a full game without a single wrong answer','👾','epic','Untouchable','dark_theme','gold_buttons'],
    ['broke_boy_3','Frequent Flyer','Use the Broke Boy shop 3 times in one game','🤡','epic','Professional Bum','broke_theme','broke_buttons'],
    ['bet_win_10k','High Roller','Win 10,000 total points from bets','💸','epic','High Roller',null,'money_buttons'],
    ['solo_perfect','Flawless','Complete a solo run with zero wrong answers','✨','epic','Flawless','gold_theme','gold_buttons'],
    ['custom_20_added','Interrogator','Add 20 custom questions to the library','📝','epic','Head Interrogator',null,null],
    ['win_25_games','The GOAT','Win 25 total games of Interrogating Blacks','🐐','legendary','THE GOAT','goat_theme','goat_buttons'],
    ['perfect_5_boards','God Mode','Get a perfect board 5 times total','⚡','legendary','God Mode','electric_theme','electric_buttons'],
    ['broke_boy_to_first','Greatest Comeback','Go from last place to first using only Broke Boy items','🎪','legendary','The Miracle','miracle_theme',null],
    ['correct_streak_25','Omniscient','Answer 25 questions correctly in a row across games','🧠','legendary','Omniscient','brain_theme','electric_buttons'],
    ['solo_world_record','The Fastest','Hold the crew record for solo board clear time','🏎️','legendary','Fastest Alive',null,'speed_buttons'],
    ['all_categories_perfect','Renaissance Man','Get all questions correct in every category','🌍','legendary','Renaissance','royal_theme','rainbow_buttons']
  ];
  achievements.forEach(a => ins.run(...a));
}

function seedCosmetics() {
  const count = db.prepare('SELECT COUNT(*) as c FROM cosmetics').get().c;
  if (count > 0) return;
  const ins = db.prepare(`INSERT INTO cosmetics (id, type, name, preview_css, unlock_requirement) VALUES (?,?,?,?,?)`);
  const cosmetics = [
    ['default','theme','Default Dark','--board-bg:#08080f','default'],
    ['fire_theme','theme','On Fire','--board-bg:#1a0500;--accent:#ff4500','win_streak_3'],
    ['dark_theme','theme','Midnight','--board-bg:#000000;--accent:#ffffff','broke_boy_win'],
    ['scholar_theme','theme','Scholar','--board-bg:#0a0a1a;--accent:#4444ff','correct_streak_10'],
    ['champion_theme','theme','Champion','--board-bg:#0a0800;--accent:#ffd700','win_streak_5'],
    ['veteran_theme','theme','Veteran','--board-bg:#0a0800;--accent:#8b6914','win_10_games'],
    ['broke_theme','theme','Broke','--board-bg:#0f0000;--accent:#ff0000','broke_boy_3'],
    ['gold_theme','theme','Gold','--board-bg:#0a0800;--accent:#ffd700','solo_perfect'],
    ['goat_theme','theme','GOAT','--board-bg:#001a00;--accent:#00ff00','win_25_games'],
    ['electric_theme','theme','Electric','--board-bg:#00001a;--accent:#00ffff','perfect_5_boards'],
    ['miracle_theme','theme','Miracle','--board-bg:#1a001a;--accent:#ff00ff','broke_boy_to_first'],
    ['brain_theme','theme','Big Brain','--board-bg:#001a1a;--accent:#00ffcc','correct_streak_25'],
    ['royal_theme','theme','Royal','--board-bg:#0a0014;--accent:#cc00ff','all_categories_perfect'],
    ['default_buttons','buttons','Default','border-radius:8px','default'],
    ['gold_buttons','buttons','Gold Trim','border:2px solid #ffd700','perfect_board'],
    ['lightning_buttons','buttons','Lightning','border-radius:0','solo_under_5min'],
    ['rainbow_buttons','buttons','Rainbow','animation:rainbow 2s infinite','win_streak_5'],
    ['broke_buttons','buttons','Cracked','border-style:dashed;border-color:#ff0000','broke_boy_3'],
    ['money_buttons','buttons','Money','background:linear-gradient(#1a4a1a,#0a2a0a)','bet_win_10k'],
    ['goat_buttons','buttons','GOAT','border-radius:50px','win_25_games'],
    ['electric_buttons','buttons','Electric','box-shadow:0 0 10px #00ffff','perfect_5_boards'],
    ['speed_buttons','buttons','Speed','border-radius:0 8px 8px 0','solo_world_record']
  ];
  cosmetics.forEach(c => ins.run(...c));
}

function seedCustomQuestions() {
  const count = db.prepare('SELECT COUNT(*) as c FROM custom_questions').get().c;
  if (count > 0) return;
  const ins = db.prepare(`INSERT INTO custom_questions (category, difficulty, question, correct_answer, wrong_1, wrong_2, wrong_3, point_value) VALUES (?,?,?,?,?,?,?,?)`);
  const questions = [
    ['Anime','easy','What is the name of the main character in Naruto?','Naruto Uzumaki','Sasuke Uchiha','Kakashi Hatake','Rock Lee',200],
    ['Anime','easy',"In Dragon Ball Z, what is Goku's Saiyan birth name?",'Kakarot','Bardock','Raditz','Turles',200],
    ['Anime','medium','What devil fruit did Trafalgar Law eat?','Ope Ope no Mi','Gura Gura no Mi','Magu Magu no Mi','Ito Ito no Mi',400],
    ['Anime','medium',"In Attack on Titan, what is Eren's founding titan?",'The Founding Titan','The Attack Titan','The War Hammer Titan','The Colossal Titan',400],
    ['Anime','hard','What is the final arc in Bleach called?','Thousand-Year Blood War','Soul Society Arc','Arrancar Arc','Fullbring Arc',800],
    ['Anime','hard',"In HxH, what is Killua's assassination technique?",'Godspeed','Lightning Palm','Shadow Step','Thunder Fist',800],
    ['Anime','medium',"In Jujutsu Kaisen, what is Gojo's signature technique?",'Infinity','Six Eyes','Hollow Purple','Black Flash',400],
    ['Anime','hard','What studio produces One Piece?','Toei Animation','Madhouse','Bones','MAPPA',800],
    ['Hip Hop','easy','Which city is Kendrick Lamar from?','Compton','Atlanta','Houston','Chicago',200],
    ['Hip Hop','easy',"What year did Drake release 'Take Care'?",'2011','2010','2012','2013',200],
    ['Hip Hop','medium',"What is Jay-Z's real name?",'Shawn Carter','Shawn Williams','Jay Carter','Shawn Knowles',400],
    ['Hip Hop','medium',"Which album features Kanye's 'Runaway'?",'My Beautiful Dark Twisted Fantasy','Graduation','Late Registration','808s and Heartbreak',400],
    ['Hip Hop','hard','What label did Lil Wayne sign to at age 9?','Cash Money Records','Young Money','No Limit Records','Def Jam',800],
    ['Hip Hop','hard',"What is Kendrick's Pulitzer Prize album?",'DAMN.','To Pimp a Butterfly','good kid m.A.A.d city','Section.80',800],
    ['Hip Hop','medium',"Which rapper's real name is Clifford Harris Jr?",'T.I.','Ludacris','Young Jeezy','Gucci Mane',400],
    ['Hip Hop','hard','What year was Enter the Wu-Tang released?','1993','1992','1994','1995',800],
    ['Sports','easy','How many NBA championships does LeBron have?','4','3','5','2',200],
    ['Sports','easy','Which team did Jordan win all 6 titles with?','Chicago Bulls','Detroit Pistons','LA Lakers','Boston Celtics',200],
    ['Sports','medium','What year did the Warriors win their first Curry-era chip?','2015','2016','2017','2018',400],
    ['Sports','medium','Who holds the all-time NBA scoring record?','LeBron James','Kareem Abdul-Jabbar','Karl Malone','Kobe Bryant',400],
    ['Sports','hard','Most points scored in a single NBA game?','100','81','73','92',800],
    ['Sports','hard','Who was the 1st pick in the 2003 NBA Draft?','LeBron James','Carmelo Anthony','Chris Bosh','Dwyane Wade',800],
    ['Gaming','easy','What console did the original Halo launch on?','Xbox','PlayStation 2','GameCube','Dreamcast',200],
    ['Gaming','easy','What material makes the strongest tools in Minecraft?','Netherite','Diamond','Iron','Gold',200],
    ['Gaming','medium','What year was Fortnite Battle Royale released?','2017','2016','2018','2019',400],
    ['Gaming','medium','Which game has the highest all-time Steam CCU?','PUBG','CS:GO','Dota 2','Cyberpunk 2077',400],
    ['Gaming','hard','How many rounds to win a half in Valorant?','13','12','15','10',800],
    ['Gaming','hard','What year was the first Doom released?','1993','1992','1994','1991',800],
    ['Pop Culture','easy','What service produces Stranger Things?','Netflix','Hulu','HBO Max','Amazon Prime',200],
    ['Pop Culture','easy',"Who is 'The Merc with a Mouth'?",'Deadpool','Spider-Man','Wolverine','Punisher',200],
    ['Pop Culture','medium',"What is Walter White's street name?",'Heisenberg','The Cook','Blue Sky','Mr. White',400],
    ['Pop Culture','medium',"What is Tony Stark's AI before FRIDAY?",'JARVIS','FRIDAY','VISION','HOMER',400],
    ['Pop Culture','hard',"What is Avon Barksdale's org called in The Wire?",'The Barksdale Organization','The Co-Op','The Greeks','Stanfield Inc',800],
    ['Pop Culture','hard','What year did The Sopranos premiere?','1999','1998','2000','2001',800],
    ['Black Culture','easy',"What year was MLK's March on Washington?",'1963','1955','1968','1960',200],
    ['Black Culture','easy','Who was the first Black US President?','Barack Obama','Jesse Jackson','Al Sharpton','Colin Powell',200],
    ['Black Culture','medium','What was the first major Black-owned record label?','Motown Records','Def Jam','Death Row','Cash Money',400],
    ['Black Culture','medium','What HBCU did MLK attend?','Morehouse College','Howard University','Spelman College','Tuskegee University',400],
    ['Black Culture','hard','What year was Juneteenth made a federal holiday?','2021','2020','2019','2022',800],
    ['Black Culture','hard','First Black woman to win Best Actress Oscar?','Halle Berry','Whoopi Goldberg','Viola Davis','Angela Bassett',800],
    ['Science & Tech','easy','What does CPU stand for?','Central Processing Unit','Core Processing Unit','Central Program Utility','Computer Processing Unit',200],
    ['Science & Tech','easy','What is the Red Planet?','Mars','Jupiter','Venus','Saturn',200],
    ['Science & Tech','medium','Who created Python?','Guido van Rossum','James Gosling','Brendan Eich','Dennis Ritchie',400],
    ['Science & Tech','hard','Time complexity of binary search?','O(log n)','O(n)','O(n^2)','O(1)',800],
    ['History','easy','First US President?','George Washington','John Adams','Thomas Jefferson','Benjamin Franklin',200],
    ['History','easy','What year did WW2 end?','1945','1944','1946','1943',200],
    ['History','medium','Empire ruled by Genghis Khan?','Mongol Empire','Ottoman Empire','Roman Empire','Persian Empire',400],
    ['History','hard','What year did the Berlin Wall fall?','1989','1991','1987','1985',800]
  ];
  questions.forEach(q => ins.run(...q));
}

seedPlayers();
seedAchievements();
seedCosmetics();
seedCustomQuestions();

module.exports = { db };
