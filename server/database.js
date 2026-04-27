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
    wrong_1 TEXT NOT NULL DEFAULT '',
    wrong_2 TEXT NOT NULL DEFAULT '',
    wrong_3 TEXT NOT NULL DEFAULT '',
    point_value INTEGER NOT NULL,
    media_url TEXT,
    media_type TEXT,
    media_duration_sec INTEGER DEFAULT 5,
    answer_type TEXT DEFAULT 'multiple_choice',
    accepted_answers TEXT,
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

  -- Idempotent migrations for existing DBs (sqlite ignores duplicate-column errors via try/catch in JS below)

  CREATE TABLE IF NOT EXISTS cosmetics (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    preview_css TEXT,
    unlock_requirement TEXT NOT NULL
  );
`);

// Idempotent ALTER TABLE migrations for older DBs
['answer_type TEXT DEFAULT \'multiple_choice\'', 'accepted_answers TEXT'].forEach(col => {
  try { db.exec(`ALTER TABLE custom_questions ADD COLUMN ${col}`); } catch {}
});

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

function seedMediaQuestions() {
  const exists = db.prepare(`SELECT COUNT(*) as c FROM custom_questions WHERE media_url IS NOT NULL AND media_url != ''`).get().c;
  if (exists > 0) return;
  const ins = db.prepare(`
    INSERT INTO custom_questions
      (category, difficulty, question, correct_answer, wrong_1, wrong_2, wrong_3, point_value, media_url, media_type, media_duration_sec, answer_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Wikimedia Commons URLs are stable and free to use
  const W = (file) => `https://upload.wikimedia.org/wikipedia/commons/thumb/${file}/640px-${file.split('/').pop()}`;

  const mediaQs = [
    ['Pop Culture', 'easy', 'Who is this?', 'Beyoncé', 'Rihanna', 'Cardi B', 'Nicki Minaj', 200,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Beyonce_-_The_Formation_World_Tour%2C_at_Stade_de_France.jpg/480px-Beyonce_-_The_Formation_World_Tour%2C_at_Stade_de_France.jpg', 'image', 5, 'multiple_choice'],
    ['Pop Culture', 'easy', 'Who is this?', 'Drake', 'The Weeknd', 'Travis Scott', 'Future', 200,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Drake_July_2016.jpg/480px-Drake_July_2016.jpg', 'image', 5, 'multiple_choice'],
    ['Hip Hop', 'medium', 'Who is this rapper?', 'Kendrick Lamar', 'J. Cole', 'Big Sean', 'Vince Staples', 400,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Kendrick_Lamar_2017.jpg/480px-Kendrick_Lamar_2017.jpg', 'image', 5, 'multiple_choice'],
    ['Hip Hop', 'medium', 'Who is this?', 'Kanye West', 'Jay-Z', 'Pharrell Williams', 'Nas', 400,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Kanye_West_at_the_2009_Tribeca_Film_Festival_%28cropped%29.jpg/480px-Kanye_West_at_the_2009_Tribeca_Film_Festival_%28cropped%29.jpg', 'image', 5, 'multiple_choice'],
    ['Sports', 'easy', 'What basketball player is shown?', 'LeBron James', 'Kevin Durant', 'Stephen Curry', 'Giannis Antetokounmpo', 200,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/LeBron_James_%2851959977144%29_%28cropped2%29.jpg/480px-LeBron_James_%2851959977144%29_%28cropped2%29.jpg', 'image', 5, 'multiple_choice'],
    ['Sports', 'medium', 'Who is this?', 'Michael Jordan', 'Kobe Bryant', 'Magic Johnson', 'Larry Bird', 400,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Michael_Jordan_in_2014.jpg/480px-Michael_Jordan_in_2014.jpg', 'image', 5, 'multiple_choice'],
    ['Sports', 'medium', 'Who is this NFL legend?', 'Tom Brady', 'Peyton Manning', 'Aaron Rodgers', 'Patrick Mahomes', 400,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Tom_Brady_2019.jpg/480px-Tom_Brady_2019.jpg', 'image', 5, 'multiple_choice'],
    ['History', 'easy', 'What landmark is this?', 'Eiffel Tower', 'Empire State Building', 'Big Ben', 'CN Tower', 200,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel_Wikimedia_Commons.jpg/480px-Tour_Eiffel_Wikimedia_Commons.jpg', 'image', 5, 'multiple_choice'],
    ['History', 'easy', 'What monument is shown?', 'Statue of Liberty', 'Lincoln Memorial', 'Washington Monument', 'Mount Rushmore', 200,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Statue_of_Liberty_7.jpg/480px-Statue_of_Liberty_7.jpg', 'image', 5, 'multiple_choice'],
    ['History', 'medium', 'What ancient wonder is this?', 'The Great Pyramid of Giza', 'The Colosseum', 'Stonehenge', 'Machu Picchu', 400,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Kheops-Pyramid.jpg/480px-Kheops-Pyramid.jpg', 'image', 5, 'multiple_choice'],
    ['History', 'medium', 'What landmark is shown?', 'The Colosseum', 'The Pantheon', 'The Parthenon', 'Trevi Fountain', 400,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Colosseo_2020.jpg/480px-Colosseo_2020.jpg', 'image', 5, 'multiple_choice'],
    ['History', 'easy', 'What is this national landmark?', 'Mount Rushmore', 'Grand Canyon', 'Yosemite', 'Yellowstone', 200,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Dean_Franklin_-_06.04.03_Mount_Rushmore_Monument_%28by-sa%29-3_new.jpg/480px-Dean_Franklin_-_06.04.03_Mount_Rushmore_Monument_%28by-sa%29-3_new.jpg', 'image', 5, 'multiple_choice'],
    ['Black Culture', 'easy', 'Who is this civil rights leader?', 'Martin Luther King Jr.', 'Malcolm X', 'Frederick Douglass', 'W.E.B. Du Bois', 200,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Martin_Luther_King%2C_Jr..jpg/480px-Martin_Luther_King%2C_Jr..jpg', 'image', 5, 'multiple_choice'],
    ['Black Culture', 'medium', 'Who is this?', 'Malcolm X', 'Stokely Carmichael', 'Huey P. Newton', 'Bobby Seale', 400,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Malcolm_X_NYWTS_2a.jpg/480px-Malcolm_X_NYWTS_2a.jpg', 'image', 5, 'multiple_choice'],
    ['Black Culture', 'easy', 'Who is this US President?', 'Barack Obama', 'Bill Clinton', 'George W. Bush', 'Joe Biden', 200,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/President_Barack_Obama.jpg/480px-President_Barack_Obama.jpg', 'image', 5, 'multiple_choice'],
    ['Pop Culture', 'medium', 'Who is this actor?', 'Denzel Washington', 'Morgan Freeman', 'Samuel L. Jackson', 'Idris Elba', 400,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Denzel_Washington_2018.jpg/480px-Denzel_Washington_2018.jpg', 'image', 5, 'multiple_choice'],
    ['Pop Culture', 'easy', 'Who is this?', 'Will Smith', 'Eddie Murphy', 'Kevin Hart', 'Chris Tucker', 200,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/TechCrunch_Disrupt_2019_%2848834102368%29_%28cropped%29.jpg/480px-TechCrunch_Disrupt_2019_%2848834102368%29_%28cropped%29.jpg', 'image', 5, 'multiple_choice'],
    ['Science & Tech', 'medium', 'What planet is this?', 'Saturn', 'Jupiter', 'Neptune', 'Uranus', 400,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Saturn_during_Equinox.jpg/480px-Saturn_during_Equinox.jpg', 'image', 5, 'multiple_choice'],
    ['Science & Tech', 'easy', 'What planet is this?', 'Mars', 'Mercury', 'Venus', 'Pluto', 200,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/OSIRIS_Mars_true_color.jpg/480px-OSIRIS_Mars_true_color.jpg', 'image', 5, 'multiple_choice'],
    ['Science & Tech', 'hard', 'What animal is this?', 'Cheetah', 'Leopard', 'Jaguar', 'Tiger', 800,
     'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Acinonyx_jubatus_-_Etosha_2014.jpg/480px-Acinonyx_jubatus_-_Etosha_2014.jpg', 'image', 5, 'multiple_choice'],
    ['Anime', 'easy', 'Which anime is this from?', 'Naruto', 'One Piece', 'Bleach', 'Dragon Ball', 200,
     'https://upload.wikimedia.org/wikipedia/en/thumb/9/94/NarutoCoverTankobon1.jpg/480px-NarutoCoverTankobon1.jpg', 'image', 5, 'multiple_choice'],
    ['Anime', 'easy', 'Which series is this?', 'One Piece', 'Naruto', 'Bleach', 'Hunter x Hunter', 200,
     'https://upload.wikimedia.org/wikipedia/en/thumb/9/9a/One_Piece%2C_Volume_61_Cover_%28Japanese%29.jpg/480px-One_Piece%2C_Volume_61_Cover_%28Japanese%29.jpg', 'image', 5, 'multiple_choice'],
    ['Gaming', 'easy', 'What game is this from?', 'Minecraft', 'Roblox', 'Terraria', 'Stardew Valley', 200,
     'https://upload.wikimedia.org/wikipedia/en/thumb/5/51/Minecraft_cover.png/480px-Minecraft_cover.png', 'image', 5, 'multiple_choice'],
    ['Gaming', 'medium', 'What game is this?', 'The Legend of Zelda: Breath of the Wild', 'Skyrim', 'Genshin Impact', 'Elden Ring', 400,
     'https://upload.wikimedia.org/wikipedia/en/thumb/c/c6/The_Legend_of_Zelda_Breath_of_the_Wild.jpg/480px-The_Legend_of_Zelda_Breath_of_the_Wild.jpg', 'image', 5, 'multiple_choice']
  ];

  mediaQs.forEach(q => { try { ins.run(...q); } catch {} });
}

function seedOpenEndedQuestions() {
  const exists = db.prepare(`SELECT COUNT(*) as c FROM custom_questions WHERE answer_type = 'open_ended'`).get().c;
  if (exists > 0) return;
  const ins = db.prepare(`
    INSERT INTO custom_questions
      (category, difficulty, question, correct_answer, wrong_1, wrong_2, wrong_3, point_value, answer_type, accepted_answers)
    VALUES (?, ?, ?, ?, '', '', '', ?, 'open_ended', ?)
  `);

  const openQs = [
    ['Hip Hop', 'easy', "Type the name of the rapper from Compton with the album 'good kid m.A.A.d city'.",
     'Kendrick Lamar', 200, JSON.stringify(['Kendrick', 'Kendrick Lamar', 'K Dot', 'K-Dot'])],
    ['Hip Hop', 'easy', "Type the name of Drake's hometown.",
     'Toronto', 200, JSON.stringify(['Toronto', 'Toronto Canada', 'Toronto, Canada'])],
    ['Hip Hop', 'medium', "What was Tupac's first name?",
     'Tupac', 400, JSON.stringify(['Tupac', '2pac', '2 Pac', 'Tupac Amaru'])],
    ['Hip Hop', 'hard', "What rapper is known as 'King Push'?",
     'Pusha T', 800, JSON.stringify(['Pusha T', 'Pusha-T', 'Terrence Thornton'])],
    ['Sports', 'easy', "Type the name of the NBA team Kobe Bryant played for his entire career.",
     'Lakers', 200, JSON.stringify(['Lakers', 'LA Lakers', 'Los Angeles Lakers', 'L.A. Lakers'])],
    ['Sports', 'easy', "What is the maximum number of points a player can score on a single basketball play?",
     '4', 200, JSON.stringify(['4', 'four', 'Four'])],
    ['Sports', 'medium', "Type the name of the NFL team that won Super Bowl LV.",
     'Tampa Bay Buccaneers', 400, JSON.stringify(['Tampa Bay Buccaneers', 'Buccaneers', 'Tampa Bay', 'Bucs'])],
    ['Sports', 'hard', "Who is the only NBA player with 30,000 points, 10,000 rebounds, and 10,000 assists?",
     'LeBron James', 800, JSON.stringify(['LeBron James', 'LeBron', 'Lebron James', 'Lebron'])],
    ['Anime', 'easy', "Type the name of Goku's home planet.",
     'Vegeta', 200, JSON.stringify(['Vegeta', 'Planet Vegeta'])],
    ['Anime', 'medium', "Name Naruto's signature jutsu.",
     'Rasengan', 400, JSON.stringify(['Rasengan', 'Spiraling Sphere'])],
    ['Anime', 'medium', "What is the name of the giant titan that breached Wall Maria?",
     'Colossal Titan', 400, JSON.stringify(['Colossal Titan', 'Colossus Titan', 'The Colossal Titan'])],
    ['Anime', 'hard', "Name the protagonist of Hunter x Hunter.",
     'Gon Freecss', 800, JSON.stringify(['Gon', 'Gon Freecss', 'Gon Freaks'])],
    ['Gaming', 'easy', "Type the name of the plumber Nintendo mascot.",
     'Mario', 200, JSON.stringify(['Mario', 'Super Mario'])],
    ['Gaming', 'medium', "Name the protagonist of The Legend of Zelda series.",
     'Link', 400, JSON.stringify(['Link'])],
    ['Gaming', 'hard', "What was the original name of the GTA V protagonist Trevor's company?",
     'Trevor Philips Industries', 800, JSON.stringify(['Trevor Philips Industries', 'TPI', 'Trevor Phillips Industries'])],
    ['Pop Culture', 'easy', "Type the name of Tony Stark's superhero alter ego.",
     'Iron Man', 200, JSON.stringify(['Iron Man', 'Ironman'])],
    ['Pop Culture', 'easy', "What is the name of the wizarding school Harry Potter attends?",
     'Hogwarts', 200, JSON.stringify(['Hogwarts', 'Hogwarts School of Witchcraft and Wizardry'])],
    ['Pop Culture', 'medium', "Name the show featuring Walter White.",
     'Breaking Bad', 400, JSON.stringify(['Breaking Bad'])],
    ['Pop Culture', 'medium', "What HBO drama follows the Soprano crime family?",
     'The Sopranos', 400, JSON.stringify(['The Sopranos', 'Sopranos'])],
    ['Pop Culture', 'hard', "Name the director of the original Black Panther film.",
     'Ryan Coogler', 800, JSON.stringify(['Ryan Coogler', 'Coogler'])],
    ['Black Culture', 'easy', "Type the first name of the first Black US president.",
     'Barack', 200, JSON.stringify(['Barack', 'Barack Obama', 'Obama'])],
    ['Black Culture', 'medium', "Name the city where the 1965 Watts riots took place.",
     'Los Angeles', 400, JSON.stringify(['Los Angeles', 'LA', 'L.A.', 'Watts', 'Los Angeles California'])],
    ['Black Culture', 'medium', "Name the activist who said 'I have a dream' in 1963.",
     'Martin Luther King Jr.', 400, JSON.stringify(['Martin Luther King Jr.', 'Martin Luther King', 'MLK', 'Dr. King', 'King'])],
    ['Black Culture', 'hard', "Name the founder of the Black Panther Party (one of two).",
     'Huey P. Newton', 800, JSON.stringify(['Huey P. Newton', 'Huey Newton', 'Bobby Seale'])],
    ['Science & Tech', 'easy', "Name the closest planet to the sun.",
     'Mercury', 200, JSON.stringify(['Mercury'])],
    ['Science & Tech', 'easy', "What gas do plants absorb during photosynthesis?",
     'Carbon Dioxide', 200, JSON.stringify(['Carbon Dioxide', 'CO2', 'CO₂'])],
    ['Science & Tech', 'medium', "Name the chemical element with symbol Au.",
     'Gold', 400, JSON.stringify(['Gold', 'Aurum'])],
    ['Science & Tech', 'medium', "Who founded Apple alongside Steve Jobs?",
     'Steve Wozniak', 400, JSON.stringify(['Steve Wozniak', 'Wozniak', 'Woz'])],
    ['Science & Tech', 'hard', "Name the JavaScript runtime built on Chrome's V8 engine.",
     'Node.js', 800, JSON.stringify(['Node.js', 'Node', 'NodeJS'])],
    ['History', 'easy', "Type the year the United States declared independence.",
     '1776', 200, JSON.stringify(['1776'])],
    ['History', 'medium', "Name the British prime minister during most of WWII.",
     'Winston Churchill', 400, JSON.stringify(['Winston Churchill', 'Churchill', 'Sir Winston Churchill'])],
    ['History', 'hard', "What city was the capital of the Byzantine Empire?",
     'Constantinople', 800, JSON.stringify(['Constantinople', 'Byzantium', 'Istanbul'])]
  ];

  openQs.forEach(q => { try { ins.run(...q); } catch {} });
}

seedPlayers();
seedAchievements();
seedCosmetics();
seedCustomQuestions();
seedMediaQuestions();
seedOpenEndedQuestions();

module.exports = { db };
