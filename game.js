(() => {
  'use strict';

  const DEFAULT_WIN_LENGTH = {
    3: 3,
    4: 4,
    5: 4,
    6: 4,
    7: 5,
    8: 5,
    9: 5,
  };

  const state = {
    size: 3,
    winLength: 3,
    mode: 'ai', // 'ai' | 'pvp'
    difficulty: 'medium', // 'easy' | 'medium' | 'hard'
    playerSide: 'X', // 'X' | 'O'
    board: [],
    currentTurn: 'X',
    history: [],
    gameOver: false,
    winCells: [],
    scores: { X: 0, O: 0, draw: 0 },
    aiThinking: false,
    soundEnabled: true,
    aiTimer: null,
  };

  const el = {
    board: document.getElementById('board'),
    boardSize: document.getElementById('boardSize'),
    winLength: document.getElementById('winLength'),
    gameMode: document.getElementById('gameMode'),
    difficulty: document.getElementById('difficulty'),
    difficultyGroup: document.getElementById('difficultyGroup'),
    playerSide: document.getElementById('playerSide'),
    playerSideGroup: document.getElementById('playerSideGroup'),
    statusText: document.getElementById('statusText'),
    statusDot: document.getElementById('statusDot'),
    scoreX: document.getElementById('scoreX'),
    scoreO: document.getElementById('scoreO'),
    scoreDraw: document.getElementById('scoreDraw'),
    labelX: document.getElementById('labelX'),
    labelO: document.getElementById('labelO'),
    scoreCardX: document.getElementById('scoreCardX'),
    scoreCardO: document.getElementById('scoreCardO'),
    undoBtn: document.getElementById('undoBtn'),
    restartBtn: document.getElementById('restartBtn'),
    resetScoreBtn: document.getElementById('resetScoreBtn'),
    soundToggle: document.getElementById('soundToggle'),
    soundIcon: document.getElementById('soundIcon'),
  };

  let audioCtx = null;

  function playTone(freq, duration, type = 'sine', gainVal = 0.08) {
    if (!state.soundEnabled) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch {
      // Ignore audio errors if blocked by browser
    }
  }

  function playMoveSound(player) {
    playTone(player === 'X' ? 440 : 350, 0.08, 'triangle', 0.07);
  }

  function playWinSound() {
    playTone(523.25, 0.12, 'sine', 0.09);
    setTimeout(() => playTone(659.25, 0.12, 'sine', 0.09), 90);
    setTimeout(() => playTone(783.99, 0.22, 'sine', 0.1), 180);
  }

  function playDrawSound() {
    playTone(280, 0.15, 'sine', 0.06);
    setTimeout(() => playTone(240, 0.2, 'sine', 0.06), 130);
  }

  function populateWinLengthOptions() {
    const n = state.size;
    const minK = 3;
    const prev = state.winLength;
    el.winLength.innerHTML = '';
    for (let k = minK; k <= n; k++) {
      const opt = document.createElement('option');
      opt.value = String(k);
      opt.textContent = `${k} in a row`;
      el.winLength.appendChild(opt);
    }
    const target = prev >= minK && prev <= n ? prev : DEFAULT_WIN_LENGTH[n];
    state.winLength = target;
    el.winLength.value = String(target);
  }

  function updateControlVisibility() {
    const isAi = state.mode === 'ai';
    el.difficultyGroup.classList.toggle('hidden', !isAi);
    el.playerSideGroup.classList.toggle('hidden', !isAi);
    if (isAi) {
      el.labelX.textContent = state.playerSide === 'X' ? 'You (X)' : 'Computer (X)';
      el.labelO.textContent = state.playerSide === 'O' ? 'You (O)' : 'Computer (O)';
    } else {
      el.labelX.textContent = 'Player X';
      el.labelO.textContent = 'Player O';
    }
  }

  function startNewRound() {
    if (state.aiTimer) {
      clearTimeout(state.aiTimer);
      state.aiTimer = null;
    }
    state.board = Array(state.size * state.size).fill(null);
    state.currentTurn = 'X';
    state.history = [];
    state.gameOver = false;
    state.winCells = [];
    state.aiThinking = false;
    renderBoard();
    updateUI();
    maybeTriggerAiMove();
  }

  function renderBoard() {
    const n = state.size;
    el.board.style.setProperty('--grid-size', String(n));
    el.board.dataset.size = String(n);
    el.board.innerHTML = '';

    const lastMove = state.history.length ? state.history[state.history.length - 1] : -1;
    const winSet = new Set(state.winCells);

    for (let i = 0; i < n * n; i++) {
      const btn = document.createElement('button');
      btn.className = 'cell';
      btn.type = 'button';
      btn.dataset.index = String(i);
      const r = Math.floor(i / n) + 1;
      const c = (i % n) + 1;
      const val = state.board[i];
      btn.setAttribute('aria-label', `Row ${r} Column ${c}${val ? `, ${val}` : ''}`);

      if (i === lastMove) btn.classList.add('last-move');
      if (winSet.has(i)) btn.classList.add('win-cell');
      if (val) {
        btn.innerHTML = val === 'X' ? getSvgX() : getSvgO();
      }
      btn.disabled = Boolean(val) || state.gameOver || state.aiThinking;
      btn.addEventListener('click', () => handleCellClick(i));
      el.board.appendChild(btn);
    }
  }

  function updateCellVisuals() {
    const cells = el.board.children;
    const lastMove = state.history.length ? state.history[state.history.length - 1] : -1;
    const winSet = new Set(state.winCells);

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const val = state.board[i];
      cell.classList.toggle('last-move', i === lastMove);
      cell.classList.toggle('win-cell', winSet.has(i));
      cell.disabled = Boolean(val) || state.gameOver || state.aiThinking;

      const hasSvg = cell.firstChild !== null;
      if (val && !hasSvg) {
        cell.innerHTML = val === 'X' ? getSvgX() : getSvgO();
      } else if (!val && hasSvg) {
        cell.innerHTML = '';
      }
    }
  }

  function getSvgX() {
    return `<svg class="mark-svg mark-x" viewBox="0 0 100 100" fill="none" stroke-width="12" stroke-linecap="round">
      <line x1="22" y1="22" x2="78" y2="78" />
      <line x1="78" y1="22" x2="22" y2="78" />
    </svg>`;
  }

  function getSvgO() {
    return `<svg class="mark-svg mark-o" viewBox="0 0 100 100" fill="none" stroke-width="12">
      <circle cx="50" cy="50" r="29" />
    </svg>`;
  }

  function updateUI() {
    el.scoreX.textContent = String(state.scores.X);
    el.scoreO.textContent = String(state.scores.O);
    el.scoreDraw.textContent = String(state.scores.draw);

    el.scoreCardX.classList.toggle('active-turn', !state.gameOver && state.currentTurn === 'X');
    el.scoreCardO.classList.toggle('active-turn', !state.gameOver && state.currentTurn === 'O');

    el.undoBtn.disabled = state.history.length === 0 || state.aiThinking || (state.mode === 'ai' && state.playerSide === 'O' && state.history.length <= 1);

    el.statusDot.className = 'status-dot';
    if (state.gameOver) {
      if (state.winCells.length > 0) {
        const winner = state.board[state.winCells[0]];
        el.statusDot.classList.add('win');
        if (state.mode === 'ai') {
          el.statusText.textContent = winner === state.playerSide ? `You win! (${winner})` : `Computer wins! (${winner})`;
        } else {
          el.statusText.textContent = `Player ${winner} wins!`;
        }
      } else {
        el.statusDot.classList.add('draw');
        el.statusText.textContent = "It's a draw!";
      }
    } else {
      if (state.currentTurn === 'O') el.statusDot.classList.add('turn-o');
      if (state.mode === 'ai') {
        const isHuman = state.currentTurn === state.playerSide;
        el.statusText.textContent = isHuman
          ? `Your turn (${state.currentTurn})`
          : `Computer is thinking (${state.currentTurn})...`;
      } else {
        el.statusText.textContent = `Player ${state.currentTurn}'s turn`;
      }
    }
  }

  function handleCellClick(index) {
    if (state.gameOver || state.aiThinking || state.board[index] !== null) return;
    if (state.mode === 'ai' && state.currentTurn !== state.playerSide) return;

    makeMove(index);
    if (!state.gameOver) {
      maybeTriggerAiMove();
    }
  }

  function makeMove(index) {
    const player = state.currentTurn;
    state.board[index] = player;
    state.history.push(index);
    playMoveSound(player);

    const winLine = checkWinnerAt(state.board, state.size, state.winLength, index, player);
    if (winLine) {
      state.gameOver = true;
      state.winCells = winLine;
      state.scores[player]++;
      playWinSound();
    } else if (state.history.length === state.size * state.size) {
      state.gameOver = true;
      state.scores.draw++;
      playDrawSound();
    } else {
      state.currentTurn = player === 'X' ? 'O' : 'X';
    }

    updateCellVisuals();
    updateUI();
  }

  function maybeTriggerAiMove() {
    if (state.gameOver || state.mode !== 'ai') return;
    const aiSide = state.playerSide === 'X' ? 'O' : 'X';
    if (state.currentTurn !== aiSide) return;

    state.aiThinking = true;
    updateCellVisuals();
    updateUI();

    const delay = state.size <= 4 ? 220 : 160;
    state.aiTimer = setTimeout(() => {
      state.aiTimer = null;
      const move = chooseAiMove(state.board, state.size, state.winLength, aiSide, state.difficulty);
      state.aiThinking = false;
      if (move !== -1 && !state.gameOver) {
        makeMove(move);
      } else {
        updateCellVisuals();
        updateUI();
      }
    }, delay);
  }

  function undoMove() {
    if (state.history.length === 0 || state.aiThinking) return;

    const stepsToUndo = state.mode === 'ai' ? (state.gameOver && state.currentTurn !== state.playerSide ? 1 : 2) : 1;
    if (state.history.length < stepsToUndo) return;

    if (state.gameOver) {
      if (state.winCells.length > 0) {
        const winner = state.board[state.winCells[0]];
        state.scores[winner] = Math.max(0, state.scores[winner] - 1);
      } else {
        state.scores.draw = Math.max(0, state.scores.draw - 1);
      }
      state.gameOver = false;
      state.winCells = [];
    }

    for (let i = 0; i < stepsToUndo; i++) {
      const idx = state.history.pop();
      state.board[idx] = null;
    }

    state.currentTurn = state.history.length % 2 === 0 ? 'X' : 'O';
    updateCellVisuals();
    updateUI();
  }

  // --- Win Detection ---
  const DIRS = [
    [0, 1],  // horizontal
    [1, 0],  // vertical
    [1, 1],  // diag down-right
    [1, -1], // diag down-left
  ];

  function checkWinnerAt(board, n, k, lastIndex, player) {
    const r0 = Math.floor(lastIndex / n);
    const c0 = lastIndex % n;

    for (const [dr, dc] of DIRS) {
      const line = [lastIndex];

      let r = r0 + dr;
      let c = c0 + dc;
      while (r >= 0 && r < n && c >= 0 && c < n && board[r * n + c] === player) {
        line.push(r * n + c);
        r += dr;
        c += dc;
      }

      r = r0 - dr;
      c = c0 - dc;
      while (r >= 0 && r < n && c >= 0 && c < n && board[r * n + c] === player) {
        line.unshift(r * n + c);
        r -= dr;
        c -= dc;
      }

      if (line.length >= k) {
        return line.slice(0, k);
      }
    }
    return null;
  }

  // --- AI Engine ---
  function getEmptyCells(board) {
    const res = [];
    for (let i = 0; i < board.length; i++) {
      if (board[i] === null) res.push(i);
    }
    return res;
  }

  function findImmediateWinningMove(board, n, k, player) {
    for (let i = 0; i < board.length; i++) {
      if (board[i] !== null) continue;
      board[i] = player;
      const won = checkWinnerAt(board, n, k, i, player);
      board[i] = null;
      if (won) return i;
    }
    return -1;
  }

  function getCandidateMoves(board, n) {
    const occupied = [];
    for (let i = 0; i < board.length; i++) {
      if (board[i] !== null) occupied.push(i);
    }
    if (occupied.length === 0) {
      const center = Math.floor(n / 2) * n + Math.floor(n / 2);
      return [center];
    }

    const radius = n <= 4 ? n : 2;
    const seen = new Set();
    const candidates = [];

    for (const idx of occupied) {
      const r0 = Math.floor(idx / n);
      const c0 = idx % n;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r >= 0 && r < n && c >= 0 && c < n) {
            const pos = r * n + c;
            if (board[pos] === null && !seen.has(pos)) {
              seen.add(pos);
              candidates.push(pos);
            }
          }
        }
      }
    }

    if (candidates.length === 0) return getEmptyCells(board);

    const centerCoord = (n - 1) / 2;
    candidates.sort((a, b) => {
      const ra = Math.floor(a / n), ca = a % n;
      const rb = Math.floor(b / n), cb = b % n;
      const da = Math.abs(ra - centerCoord) + Math.abs(ca - centerCoord);
      const db = Math.abs(rb - centerCoord) + Math.abs(cb - centerCoord);
      return da - db;
    });
    return candidates;
  }

  function evaluateBoard(board, n, k, aiPlayer, humanPlayer) {
    let score = 0;

    // Scan all k-length windows in 4 directions
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        for (const [dr, dc] of DIRS) {
          const endR = r + (k - 1) * dr;
          const endC = c + (k - 1) * dc;
          if (endR < 0 || endR >= n || endC < 0 || endC >= n) continue;

          let aiCount = 0;
          let huCount = 0;
          for (let step = 0; step < k; step++) {
            const val = board[(r + step * dr) * n + (c + step * dc)];
            if (val === aiPlayer) aiCount++;
            else if (val === humanPlayer) huCount++;
          }

          if (aiCount > 0 && huCount === 0) {
            score += Math.pow(10, aiCount);
          } else if (huCount > 0 && aiCount === 0) {
            score -= Math.pow(10, huCount) * 1.15;
          }
        }
      }
    }
    return score;
  }

  function chooseAiMove(board, n, k, aiPlayer, difficulty) {
    const humanPlayer = aiPlayer === 'X' ? 'O' : 'X';
    const empty = getEmptyCells(board);
    if (empty.length === 0) return -1;

    // EASY: mostly random, occasionally takes an obvious win
    if (difficulty === 'easy') {
      if (Math.random() < 0.35) {
        const winMove = findImmediateWinningMove(board, n, k, aiPlayer);
        if (winMove !== -1) return winMove;
      }
      return empty[Math.floor(Math.random() * empty.length)];
    }

    // Immediate win or block check for Medium & Hard
    const winMove = findImmediateWinningMove(board, n, k, aiPlayer);
    if (winMove !== -1) return winMove;

    const blockMove = findImmediateWinningMove(board, n, k, humanPlayer);
    if (blockMove !== -1) return blockMove;

    // MEDIUM: tactical 1-ply heuristic with slight randomness among top moves
    if (difficulty === 'medium') {
      const candidates = getCandidateMoves(board, n).slice(0, 18);
      const scored = candidates.map((idx) => {
        board[idx] = aiPlayer;
        const val = evaluateBoard(board, n, k, aiPlayer, humanPlayer);
        board[idx] = null;
        return { idx, val };
      });
      scored.sort((a, b) => b.val - a.val);
      const topPool = scored.slice(0, Math.min(3, scored.length));
      if (Math.random() < 0.72) return topPool[0].idx;
      return topPool[Math.floor(Math.random() * topPool.length)].idx;
    }

    // HARD:
    // 1) Exact Minimax for 3x3
    if (n === 3) {
      let bestScore = -Infinity;
      let bestMove = empty[0];
      for (const idx of empty) {
        board[idx] = aiPlayer;
        const score = minimax3x3(board, 0, false, -Infinity, Infinity, aiPlayer, humanPlayer);
        board[idx] = null;
        if (score > bestScore) {
          bestScore = score;
          bestMove = idx;
        }
      }
      return bestMove;
    }

    // 2) Depth-limited Alpha-Beta search with time budget for 4x4..9x9
    const maxDepth = n === 4 ? 4 : n <= 6 ? 3 : 2;
    const maxCandidates = n === 4 ? 14 : 12;
    const startTime = performance.now();
    const timeLimitMs = 200;

    const candidates = getCandidateMoves(board, n);
    // Order candidates by 1-ply heuristic
    const ordered = candidates.map((idx) => {
      board[idx] = aiPlayer;
      const val = evaluateBoard(board, n, k, aiPlayer, humanPlayer);
      board[idx] = null;
      return { idx, val };
    });
    ordered.sort((a, b) => b.val - a.val);
    const searchPool = ordered.slice(0, maxCandidates);

    let bestMove = searchPool[0].idx;
    let bestScore = -Infinity;

    for (const { idx } of searchPool) {
      if (performance.now() - startTime > timeLimitMs) break;
      board[idx] = aiPlayer;
      const score = alphaBeta(
        board, n, k, maxDepth - 1, false,
        -Infinity, Infinity, aiPlayer, humanPlayer,
        idx, startTime, timeLimitMs
      );
      board[idx] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMove = idx;
      }
    }
    return bestMove;
  }

  function minimax3x3(board, depth, isMax, alpha, beta, aiPlayer, humanPlayer) {
    // Check terminal
    for (let i = 0; i < 9; i++) {
      if (board[i] === aiPlayer && checkWinnerAt(board, 3, 3, i, aiPlayer)) return 100 - depth;
      if (board[i] === humanPlayer && checkWinnerAt(board, 3, 3, i, humanPlayer)) return depth - 100;
    }
    const empty = getEmptyCells(board);
    if (empty.length === 0) return 0;

    if (isMax) {
      let best = -Infinity;
      for (const idx of empty) {
        board[idx] = aiPlayer;
        const val = minimax3x3(board, depth + 1, false, alpha, beta, aiPlayer, humanPlayer);
        board[idx] = null;
        best = Math.max(best, val);
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const idx of empty) {
        board[idx] = humanPlayer;
        const val = minimax3x3(board, depth + 1, true, alpha, beta, aiPlayer, humanPlayer);
        board[idx] = null;
        best = Math.min(best, val);
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  function alphaBeta(board, n, k, depth, isMax, alpha, beta, aiPlayer, humanPlayer, lastIdx, startTime, timeLimitMs) {
    const lastPlayer = isMax ? humanPlayer : aiPlayer;
    if (checkWinnerAt(board, n, k, lastIdx, lastPlayer)) {
      return lastPlayer === aiPlayer ? 1000000 + depth : -1000000 - depth;
    }
    if (depth === 0 || performance.now() - startTime > timeLimitMs) {
      return evaluateBoard(board, n, k, aiPlayer, humanPlayer);
    }

    const candidates = getCandidateMoves(board, n).slice(0, 10);
    if (candidates.length === 0) return 0;

    if (isMax) {
      let best = -Infinity;
      for (const idx of candidates) {
        board[idx] = aiPlayer;
        const val = alphaBeta(board, n, k, depth - 1, false, alpha, beta, aiPlayer, humanPlayer, idx, startTime, timeLimitMs);
        board[idx] = null;
        best = Math.max(best, val);
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const idx of candidates) {
        board[idx] = humanPlayer;
        const val = alphaBeta(board, n, k, depth - 1, true, alpha, beta, aiPlayer, humanPlayer, idx, startTime, timeLimitMs);
        board[idx] = null;
        best = Math.min(best, val);
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  // --- Event Listeners ---
  el.boardSize.addEventListener('change', () => {
    state.size = Number(el.boardSize.value);
    state.winLength = DEFAULT_WIN_LENGTH[state.size];
    populateWinLengthOptions();
    startNewRound();
  });

  el.winLength.addEventListener('change', () => {
    state.winLength = Number(el.winLength.value);
    startNewRound();
  });

  el.gameMode.addEventListener('change', () => {
    state.mode = el.gameMode.value;
    updateControlVisibility();
    startNewRound();
  });

  el.difficulty.addEventListener('change', () => {
    state.difficulty = el.difficulty.value;
    startNewRound();
  });

  el.playerSide.addEventListener('change', () => {
    state.playerSide = el.playerSide.value;
    updateControlVisibility();
    startNewRound();
  });

  el.undoBtn.addEventListener('click', undoMove);
  el.restartBtn.addEventListener('click', startNewRound);
  el.resetScoreBtn.addEventListener('click', () => {
    state.scores = { X: 0, O: 0, draw: 0 };
    startNewRound();
  });

  el.soundToggle.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    el.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
  });

  // Init
  populateWinLengthOptions();
  updateControlVisibility();
  startNewRound();
})();

