# Local High-Score & Leaderboard System

The local high-score system is managed by `NeonArcade.HighScore` in `js/common.js` and styled globally in `css/style.css`. It brings a classic 1980s arcade hall-of-fame experience to all 9 games without requiring external server dependencies.

---

## Key Features

1. **3-Letter Initials Picker Modal**: When a game ends and a player achieves a Top 5 score, a synthwave-styled modal pops up prompting the player to enter their 3 initials (e.g. `AAA`, `NEO`, `BAZ`).
2. **Keyboard & Touch Compatible**:
   - **Keyboard:** Type letters (`A-Z`, `0-9`) directly, use Arrow Keys (`▲`/`▼` to cycle character, `◄`/`►` to change slot), `Backspace` to clear, and `Enter` to save.
   - **Touch / Mouse:** Tap `▲` and `▼` buttons, tap slots directly, and tap `► SAVE RECORD`.
3. **Saved Initials Persistence**: Remembers the player's last used initials in `localStorage.getItem('neon_arcade_player_initials')` for quick one-click submission on future plays.
4. **Pre-Filled Retro Bots**: When a game is played for the first time, retro bot scores (e.g., `ACE`, `NEO`, `CYB`, `ARC`, `BOT`) are pre-populated so the leaderboard is never empty.
5. **Legacy Score Migration**: Automatically checks for existing scalar high scores (e.g., `tetris_hi`, `pm_hi`, `si-hi`, etc.) and migrates them into the #1 ranking slot.
6. **Leaderboard Board Modal**: Interactive overlay displaying rank (#1 cyan, #2 yellow, #3 green), player name, score, and date, with a game selector dropdown for all 9 titles.

---

## Data Schema & Storage

High scores are stored in `localStorage` under `neon_scores_<gameKey>` as a JSON array of up to 5 items:

```json
[
  { "name": "BAZ", "score": 12500, "date": "2026-08-05" },
  { "name": "NEO", "score": 9800,  "date": "2026-08-05" },
  { "name": "CYB", "score": 7200,  "date": "2026-08-05" },
  { "name": "ACE", "score": 5000,  "date": "2026-08-05" },
  { "name": "BOT", "score": 2000,  "date": "2026-08-05" }
]
```

---

## `NeonArcade.HighScore` API Reference

```js
// Check if score qualifies for Top 5 and prompt initials entry modal
NeonArcade.HighScore.checkAndPrompt(gameKey, score, callback)

// Open Leaderboard Modal for specified game (e.g. 'tetris', 'pacman', 'highway')
NeonArcade.HighScore.showLeaderboard(gameKey)

// Get top 1 highest score number (useful for updating HUD best score display)
NeonArcade.HighScore.getTopScore(gameKey)

// Get array of top 5 score objects [{ name, score, date }, ...]
NeonArcade.HighScore.getScores(gameKey)

// Check if a score number qualifies for top 5 (returns boolean)
NeonArcade.HighScore.isHighScore(gameKey, score)

// Programmatically add a new score record
NeonArcade.HighScore.addScore(gameKey, name, score)
```

---

## Game Over Integration Pattern

Every game calls `NeonArcade.HighScore.checkAndPrompt()` when triggering game over:

```js
function triggerGameOver() {
  state = 'gameover';
  NeonArcade.stopMusic();
  NeonArcade.SFX.gameOver();

  document.getElementById('final-score').textContent = 'SCORE: ' + score;
  showOverlay('overlay-gameover');
  updateHUD();

  if (window.NeonArcade) {
    NeonArcade.HighScore.checkAndPrompt('tetris', score, () => {
      bestScore = NeonArcade.HighScore.getTopScore('tetris');
      updateHUD();
    });
  }
}
```

---

## `🏆 SCORES` Button

A topbar button with class `.scores-btn` / `#btn-scores` is present in all game headers and the main landing page. Clicking it opens the Leaderboard Board Modal anytime.
