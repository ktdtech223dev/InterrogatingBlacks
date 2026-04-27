INTERROGATING BLACKS — Standalone Build
========================================

QUICKSTART:
  1. Extract this zip to a folder (anywhere).
  2. Double-click START_HERE.bat
  3. Your browser will open automatically to the game.

That's it.

----------------------------------------

WHAT'S IN THIS FOLDER:
  START_HERE.bat              <- run this
  InterrogatingBlacks.exe     <- the actual server (bat just wraps it)
  better_sqlite3.node         <- native database module (must stay next to exe)
  README.txt                  <- this file

WHAT GETS CREATED ON FIRST RUN:
  interrogating.db            <- SQLite database (your stats live here)
  uploads/                    <- custom question media
  interrogating-blacks.log    <- crash/diagnostic log

ONLINE PLAY:
  An online-multiplayer version is live at:
  https://interrogatingblacks-production.up.railway.app
  (no install needed for that — just open in browser)

LOCAL PLAY:
  This exe runs the full server locally on http://localhost:3847
  Other players on the same Wi-Fi can join you at:
  http://YOUR-LAN-IP:3847

TROUBLESHOOTING:
  - "Nothing happens" when double-clicking the exe?
    Use START_HERE.bat instead — it pauses on errors so you can see them.
  - Windows SmartScreen warning?
    Click "More info" -> "Run anyway" (the exe is unsigned).
  - Antivirus quarantine?
    Whitelist the folder. The exe is just a bundled Node.js + Express server.
  - Port 3847 already in use?
    Close whatever else is using it, or set PORT=12345 env var.

Stack: Node.js 18 + Express + Socket.io + SQLite + React (prebuilt).
