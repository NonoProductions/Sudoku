import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  generateSudoku,
  type Board as BoardType,
  type Difficulty,
  checkWin,
} from './utils/sudoku';
import {
  Timer,
  Heart,
  Pencil,
  Trophy,
  X,
  ChevronDown,
  Eraser,
  Undo2,
  Menu,
  CalendarDays,
  ListOrdered,
} from 'lucide-react';
import { supabase } from './lib/supabaseClient';

type GameState = 'playing' | 'won' | 'lost';
type Cell = {
  value: number;
  isInitial: boolean;
  notes: Set<number>;
};

type ViewMode = 'game' | 'menu';

type LeaderboardEntry = {
  playerName: string;
  points: number;
  wins: number;
  averageTime: number;
  averageMistakes: number;
};

type PlayerStats = {
  games: number;
  wins: number;
  points: number;
  averageTime: number;
  averageMistakes: number;
};

type DailyPuzzleRow = {
  id: string;
  puzzle_date: string;
  initial_grid: BoardType;
  solution_grid: BoardType;
  difficulty: Difficulty;
};

type DailyAttemptRow = {
  player_name: string;
  duration_seconds: number | null;
  mistakes: number | null;
  points: number | null;
  puzzle_date: string | null;
};

type AttemptSummary = {
  playerName: string;
  durationSeconds: number | null;
  mistakes: number | null;
  points: number | null;
  submittedAt: string | null;
};

const App: React.FC = () => {
  const difficulties: Difficulty[] = ['Beginner', 'Easy', 'Medium', 'Hard', 'Sandy'];
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [board, setBoard] = useState<Cell[][]>([]);
  const [solvedBoard, setSolvedBoard] = useState<BoardType>([]);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [lives, setLives] = useState(3);
  const [timer, setTimer] = useState(0);
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [gameState, setGameState] = useState<GameState>('playing');
  const [focusValue, setFocusValue] = useState<number | null>(null);
  const [history, setHistory] = useState<Cell[][][]>([]);
  const [cellFeedback, setCellFeedback] = useState<Record<string, 'correct' | 'wrong'>>({});
  const [showDifficultyOptions, setShowDifficultyOptions] = useState(false);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('sudoku-player') ?? '');
  const [friendName, setFriendName] = useState(() => localStorage.getItem('sudoku-friend') ?? '');
  const [profileId] = useState(() => {
    const existing = localStorage.getItem('sudoku-profile-id');
    if (existing) return existing;
    const generated = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    localStorage.setItem('sudoku-profile-id', generated);
    return generated;
  });
  const [view, setView] = useState<ViewMode>('game');
  const [isDailyMode, setIsDailyMode] = useState(false);
  const [hasDailyPuzzle, setHasDailyPuzzle] = useState(true);
  const [puzzleMeta, setPuzzleMeta] = useState<{ id: string | null; date: string | null; difficulty: Difficulty }>({
    id: null,
    date: null,
    difficulty,
  });
  const [isLoadingPuzzle, setIsLoadingPuzzle] = useState(false);
  const [puzzleError, setPuzzleError] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [todayResults, setTodayResults] = useState<AttemptSummary[]>([]);
  const [todayResultsLoading, setTodayResultsLoading] = useState(false);
  const [todayResultsError, setTodayResultsError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const attemptSubmittedRef = useRef(false);
  const expectedPlayers = useMemo(
    () => [playerName.trim(), friendName.trim()].filter((name) => name.length > 0),
    [playerName, friendName],
  );
  const todaysResultMap = useMemo(() => {
    const map = new Map<string, AttemptSummary>();
    todayResults.forEach((result) => {
      map.set(result.playerName.trim().toLowerCase(), result);
    });
    return map;
  }, [todayResults]);

  useEffect(() => {
    if (playerName) {
      localStorage.setItem('sudoku-player', playerName);
    }
  }, [playerName]);

  useEffect(() => {
    if (friendName) {
      localStorage.setItem('sudoku-friend', friendName);
    }
  }, [friendName]);

  const syncProfileFromSupabase = useCallback(async () => {
    if (!profileId) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const { data, error } = await supabase
        .from('player_profiles')
        .select('player_name, friend_name')
        .eq('id', profileId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        if (data.player_name) setPlayerName(data.player_name);
        if (data.friend_name) setFriendName(data.friend_name);
      }
    } catch (err) {
      console.error(err);
      setProfileError('Profil konnte nicht aus Supabase geladen werden.');
    } finally {
      setProfileLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    syncProfileFromSupabase();
  }, [syncProfileFromSupabase]);

  useEffect(() => {
    if (!profileId) return;
    const timeout = window.setTimeout(async () => {
      try {
        await supabase.from('player_profiles').upsert(
          {
            id: profileId,
            player_name: playerName || null,
            friend_name: friendName || null,
          },
          { onConflict: 'id' },
        );
        setProfileError(null);
      } catch (err) {
        console.error(err);
        setProfileError('Profil konnte nicht gespeichert werden.');
      }
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [playerName, friendName, profileId]);

  const applyPuzzleToState = useCallback(
    (
      initial: BoardType,
      solved: BoardType,
      meta?: { id?: string | null; mode?: 'daily' | 'free'; date?: string | null; difficulty?: Difficulty },
    ) => {
      const newBoard = initial.map((row) =>
        row.map((val) => ({
          value: val,
          isInitial: val !== 0,
          notes: new Set<number>(),
        })),
      );

      setBoard(newBoard);
      setSolvedBoard(solved);
      setLives(3);
      setTimer(0);
      setGameState('playing');
      setSelected(null);
      setFocusValue(null);
      setCellFeedback({});
      setHistory([]);
      setMistakes(0);
      setIsDailyMode(meta?.mode === 'daily');
      if (meta?.difficulty) {
        setDifficulty(meta.difficulty);
      }
      setPuzzleMeta({
        id: meta?.id ?? null,
        date: meta?.date ?? null,
        difficulty: meta?.difficulty ?? difficulty,
      });
      attemptSubmittedRef.current = false;
    },
    [difficulty],
  );

  const startNewGame = useCallback(
    (diff: Difficulty = difficulty) => {
      const { initial, solved } = generateSudoku(diff);
      applyPuzzleToState(initial, solved, { mode: 'free', difficulty: diff });
      setView('game');
    },
    [applyPuzzleToState, difficulty],
  );

  const loadTodayResults = useCallback(
    async (customPuzzleId?: string) => {
      const targetPuzzleId = customPuzzleId ?? puzzleMeta.id;
      if (!targetPuzzleId) return;
      setTodayResultsError(null);
      setTodayResultsLoading(true);
      try {
        const { data, error } = await supabase
          .from('daily_attempts')
          .select('player_name, duration_seconds, mistakes, points, submitted_at')
          .eq('puzzle_id', targetPuzzleId);
        if (error) throw error;
        const summaries =
          data?.map((attempt) => ({
            playerName: attempt.player_name ?? 'Unbekannt',
            durationSeconds: attempt.duration_seconds,
            mistakes: attempt.mistakes,
            points: attempt.points,
            submittedAt: attempt.submitted_at ?? null,
          })) ?? [];
        setTodayResults(summaries);
      } catch (err) {
        console.error(err);
        setTodayResultsError('Tagesergebnisse konnten nicht geladen werden.');
      } finally {
        setTodayResultsLoading(false);
      }
    },
    [puzzleMeta.id],
  );

  const loadDailyPuzzle = useCallback(async (options?: { navigate?: boolean }) => {
    setPuzzleError(null);
    setIsLoadingPuzzle(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      let { data, error } = await supabase
        .from('daily_puzzles')
        .select('id, puzzle_date, initial_grid, solution_grid, difficulty')
        .eq('puzzle_date', today)
        .maybeSingle();

      if (error) throw error;
      let puzzle = data as DailyPuzzleRow | null;
      if (!puzzle) {
        setHasDailyPuzzle(false);
        setPuzzleError('Für heute wurde noch kein tägliches Sudoku veröffentlicht.');
        return;
      }
      setHasDailyPuzzle(true);

      applyPuzzleToState(puzzle.initial_grid, puzzle.solution_grid, {
        id: puzzle.id,
        mode: 'daily',
        date: puzzle.puzzle_date,
        difficulty: puzzle.difficulty ?? difficulty,
      });
      loadTodayResults(puzzle.id);
    } catch (err) {
      console.error(err);
      setPuzzleError('Konnte das tägliche Sudoku nicht laden.');
      setHasDailyPuzzle(false);
    } finally {
      setIsLoadingPuzzle(false);
      if (options?.navigate) setView('game');
    }
  }, [applyPuzzleToState, difficulty, loadTodayResults, setView]);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardError(null);
    setLeaderboardLoading(true);
    try {
      const { data, error } = await supabase
        .from('daily_attempts')
        .select('player_name, duration_seconds, mistakes, points, puzzle_date');

      if (error) throw error;
      if (!data) {
        setLeaderboard([]);
        return;
      }
      const rows = data as DailyAttemptRow[];

      const aggregated = new Map<
        string,
        { points: number; totalTime: number; totalMistakes: number; wins: number }
      >();

      rows.forEach((attempt) => {
        if (!attempt.player_name) return;
        const existing =
          aggregated.get(attempt.player_name) ?? { points: 0, totalTime: 0, totalMistakes: 0, wins: 0 };
        existing.points += attempt.points ?? 0;
        if ((attempt.points ?? 0) > 0) {
          existing.wins += 1;
          existing.totalTime += attempt.duration_seconds ?? 0;
          existing.totalMistakes += attempt.mistakes ?? 0;
        }
        aggregated.set(attempt.player_name, existing);
      });

      const leaderboardRows = Array.from(aggregated.entries())
        .map(([playerName, stats]) => ({
          playerName,
          points: stats.points,
          wins: stats.wins,
          averageTime: stats.wins ? stats.totalTime / stats.wins : 0,
          averageMistakes: stats.wins ? stats.totalMistakes / stats.wins : 0,
        }))
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (a.averageTime !== b.averageTime) return a.averageTime - b.averageTime;
          return a.averageMistakes - b.averageMistakes;
        });

      setLeaderboard(leaderboardRows);

      if (playerName.trim()) {
        const normalized = playerName.trim().toLowerCase();
        const personalAttempts = rows.filter(
          (attempt) => attempt.player_name?.trim().toLowerCase() === normalized,
        );
        if (personalAttempts.length) {
          const wins = personalAttempts.filter((attempt) => (attempt.points ?? 0) > 0).length;
          const points = personalAttempts.reduce((sum, attempt) => sum + (attempt.points ?? 0), 0);
          const totalTime = personalAttempts
            .filter((attempt) => (attempt.points ?? 0) > 0)
            .reduce((sum, attempt) => sum + (attempt.duration_seconds ?? 0), 0);
          const totalMistakes = personalAttempts
            .filter((attempt) => (attempt.points ?? 0) > 0)
            .reduce((sum, attempt) => sum + (attempt.mistakes ?? 0), 0);

          setPlayerStats({
            games: personalAttempts.length,
            wins,
            points,
            averageTime: wins ? totalTime / wins : 0,
            averageMistakes: wins ? totalMistakes / wins : 0,
          });
        } else {
          setPlayerStats(null);
        }
      } else {
        setPlayerStats(null);
      }
    } catch (err) {
      console.error(err);
      setLeaderboardError('Leaderboard konnte nicht geladen werden.');
    } finally {
      setLeaderboardLoading(false);
    }
  }, [playerName]);

  const handleSubmitAttempt = useCallback(async () => {
    if (!playerName || !isDailyMode || !puzzleMeta.id || attemptSubmittedRef.current) return;
    attemptSubmittedRef.current = true;

    const payload = {
      player_name: playerName,
      puzzle_id: puzzleMeta.id,
      puzzle_date: puzzleMeta.date,
      duration_seconds: timer,
      mistakes,
      points: 100,
      submitted_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('daily_attempts').upsert(payload, {
      onConflict: 'player_name,puzzle_id',
    });

    if (error) {
      console.error(error);
      attemptSubmittedRef.current = false;
    } else {
      loadTodayResults();
    }
  }, [playerName, isDailyMode, puzzleMeta, timer, mistakes, loadTodayResults]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    const interval = window.setInterval(() => setTimer((t) => t + 1), 1000);
    return () => window.clearInterval(interval);
  }, [gameState]);

  useEffect(() => {
    loadDailyPuzzle();
  }, [loadDailyPuzzle]);

  useEffect(() => {
    if (view === 'menu') {
      loadLeaderboard();
    }
  }, [view, loadLeaderboard]);

  useEffect(() => {
    if (view === 'menu' && puzzleMeta.id) {
      loadTodayResults();
    }
  }, [view, puzzleMeta.id, loadTodayResults]);

  useEffect(() => {
    if (gameState === 'won') {
      handleSubmitAttempt();
    }
  }, [gameState, handleSubmitAttempt]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const triggerFeedback = useCallback((key: string, type: 'correct' | 'wrong') => {
    setCellFeedback((prev) => ({ ...prev, [key]: type }));
    window.setTimeout(() => {
      setCellFeedback((prev) => {
        if (prev[key] !== type) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 350);
  }, []);

  const handleCellClick = (r: number, c: number) => {
    if (gameState !== 'playing') return;
    const cell = board[r]?.[c];
    if (!cell) return;

    setSelected({ r, c });
    setFocusValue(cell.value || null);
  };

  const handleNumberInput = (num: number) => {
    if (gameState !== 'playing') {
      setFocusValue(num);
      return;
    }
    if (!selected) {
      setFocusValue(num);
      return;
    }
    setFocusValue(num);
    const { r, c } = selected;
    const cell = board[r][c];
    if (cell.isInitial) return;

    const newBoard = board.map((row, rowIdx) =>
      row.map((existing, colIdx) =>
        rowIdx === r && colIdx === c ? { ...existing } : existing,
      ),
    );

    if (isNoteMode) {
      const notes = newBoard[r][c].notes;
      if (notes.has(num)) notes.delete(num);
      else notes.add(num);
      setBoard(newBoard);
      return;
    }

    if (cell.value === num) return;
    const isCorrect = solvedBoard[r][c] === num;

    if (!isCorrect) {
      setMistakes((prev) => prev + 1);
      setLives((l) => {
        const next = l - 1;
        if (next <= 0) setGameState('lost');
        return next;
      });
    }

    setHistory((prev) => [...prev, board]);
    newBoard[r][c] = { value: num, isInitial: false, notes: new Set() };
    setBoard(newBoard);
    triggerFeedback(`${r}-${c}`, isCorrect ? 'correct' : 'wrong');

    if (isCorrect) {
      const flat = newBoard.map((row) => row.map((entry) => entry.value));
      if (checkWin(flat, solvedBoard)) setGameState('won');
    }
  };

  const handleErase = () => {
    if (gameState !== 'playing' || !selected) return;
    const { r, c } = selected;
    if (board[r][c].isInitial) return;

    const newBoard = board.map((row, rowIdx) =>
      row.map((cell, colIdx) =>
        rowIdx === r && colIdx === c ? { ...cell, value: 0 } : cell,
      ),
    );
    setHistory((prev) => [...prev, board]);
    setBoard(newBoard);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'playing') return;
      if (e.key >= '1' && e.key <= '9') {
        const value = Number(e.key);
        setFocusValue(value);
        handleNumberInput(value);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        handleErase();
      } else if (selected) {
        if (e.key === 'ArrowUp') setSelected({ r: Math.max(0, selected.r - 1), c: selected.c });
        if (e.key === 'ArrowDown') setSelected({ r: Math.min(8, selected.r + 1), c: selected.c });
        if (e.key === 'ArrowLeft') setSelected({ r: selected.r, c: Math.max(0, selected.c - 1) });
        if (e.key === 'ArrowRight') setSelected({ r: selected.r, c: Math.min(8, selected.c + 1) });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, selected, board, isNoteMode]);

  const remainingNumbers = useMemo(() => {
    const availability = new Map<number, boolean>();
    for (let num = 1; num <= 9; num++) {
      availability.set(num, true);
    }
    if (!solvedBoard.length) return availability;
    for (let num = 1; num <= 9; num++) {
      availability.set(num, false);
    }
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c].value !== solvedBoard[r][c]) {
          const target = solvedBoard[r][c];
          availability.set(target, true);
        }
      }
    }
    return availability;
  }, [board, solvedBoard]);

  if (view === 'menu') {
    return (
      <div className="min-h-screen w-full bg-slate-50 text-slate-900">
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-6">
          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Menü</p>
                <h1 className="text-2xl font-semibold text-slate-900">Gemeinsames Sudoku</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Hier verwaltest du Namen, tägliche Rätsel und das Leaderboard.
                </p>
              </div>
              <button
                onClick={() => setView('game')}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Undo2 className="h-4 w-4" />
                Zurück zum Spiel
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Spieler</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dein Name</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Spieler 1"
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Name deiner Freundin
                  </label>
                  <input
                    type="text"
                    value={friendName}
                    onChange={(e) => setFriendName(e.target.value)}
                    placeholder="Spieler 2"
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Die Namen werden automatisch lokal und in Supabase gespeichert, damit sie dauerhaft verfügbar sind.
              </p>
              {profileLoading ? (
                <p className="text-xs text-slate-400">Synchronisiere Profil…</p>
              ) : profileError ? (
                <p className="text-xs text-rose-500">{profileError}</p>
              ) : (
                <p className="text-xs text-emerald-600">Profil synchronisiert ✅</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Tägliches Sudoku</h2>
                <p className="text-sm text-slate-500">
                  Ihr beide bekommt jeden Tag dasselbe Rätsel. Gewinne bringen 100 Punkte.
                </p>
              </div>
              <button
                onClick={() => loadDailyPuzzle({ navigate: true })}
                disabled={isLoadingPuzzle || !hasDailyPuzzle}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                <CalendarDays className="h-4 w-4" />
                {isLoadingPuzzle ? 'Lädt…' : hasDailyPuzzle ? 'Heutiges Sudoku starten' : 'Noch nicht verfügbar'}
              </button>
            </div>
            <div className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Datum</p>
                <p className="text-base font-semibold text-slate-900">
                  {puzzleMeta.date ?? 'Noch nicht geladen'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Modus</p>
                <p className="text-base font-semibold text-slate-900">
                  {isDailyMode ? 'Aktives Tagesrätsel' : 'Freies Spiel'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Schwierigkeit</p>
                <p className="text-base font-semibold text-slate-900">{puzzleMeta.difficulty}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Fortschritt</p>
                <p className="text-base font-semibold text-slate-900">{formatTime(timer)}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
                <p className="text-base font-semibold text-slate-900">
                  {hasDailyPuzzle ? 'Bereit zum Spielen' : 'Noch nicht veröffentlicht'}
                </p>
              </div>
            </div>
            {puzzleError && (
              <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{puzzleError}</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Heutige Ergebnisse</h2>
              <button
                onClick={() => loadTodayResults()}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-50"
              >
                <ListOrdered className="h-4 w-4" />
                Refresh
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {todayResultsLoading ? (
                <p className="text-sm text-slate-500">Lade Ergebnisse…</p>
              ) : todayResultsError ? (
                <p className="text-sm text-rose-500">{todayResultsError}</p>
              ) : expectedPlayers.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Trage eure beiden Namen ein, damit ihr euch gegenseitig seht.
                </p>
              ) : (
                expectedPlayers.map((name) => {
                  const normalized = name.trim().toLowerCase();
                  const entry = todaysResultMap.get(normalized);
                  return (
                    <div
                      key={name}
                      className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{name}</p>
                        {entry ? (
                          <p className="text-xs text-slate-500">
                            Fertig in {entry.durationSeconds ? formatTime(entry.durationSeconds) : '—'} · Fehler{' '}
                            {entry.mistakes ?? 0} · {entry.points ?? 0} Punkte
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500">Noch kein Ergebnis eingegangen</p>
                        )}
                      </div>
                      {entry && entry.submittedAt && (
                        <span className="text-xs text-slate-400">
                          {new Date(entry.submittedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {expectedPlayers.length === 2 &&
              expectedPlayers.some(
                (name) => !todaysResultMap.get(name.trim().toLowerCase()),
              ) && (
                <p className="mt-3 text-xs text-amber-600">
                  Sobald die zweite Person fertig ist, erscheint die Zeit automatisch hier.
                </p>
              )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Leaderboard</h2>
              <button
                onClick={loadLeaderboard}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-50"
              >
                <ListOrdered className="h-4 w-4" />
                Aktualisieren
              </button>
            </div>
            <div className="mt-4">
              {leaderboardLoading ? (
                <p className="text-sm text-slate-500">Lädt Rangliste…</p>
              ) : leaderboardError ? (
                <p className="text-sm text-rose-500">{leaderboardError}</p>
              ) : leaderboard.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Noch keine Einträge – spielt zuerst ein tägliches Sudoku durch.
                </p>
              ) : (
                <ul className="space-y-3">
                  {leaderboard.map((entry, index) => (
                    <li
                      key={entry.playerName}
                      className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-500">#{index + 1}</span>
                          <span className="text-base font-semibold text-slate-900">{entry.playerName}</span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {entry.wins} Siege · Ø Zeit {formatTime(Math.round(entry.averageTime))} · Ø Fehler{' '}
                          {entry.averageMistakes.toFixed(1)}
                        </p>
                      </div>
                      <span className="text-lg font-bold text-amber-600">{entry.points} P</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Deine Statistiken</h2>
            {!playerName.trim() ? (
              <p className="mt-2 text-sm text-slate-500">Trage zuerst deinen Namen ein.</p>
            ) : !playerStats ? (
              <p className="mt-2 text-sm text-slate-500">
                Noch keine Daten – löse ein Tagesrätsel, um Statistiken zu erhalten.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Siege</p>
                  <p className="text-2xl font-semibold text-slate-900">{playerStats.wins}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Punkte</p>
                  <p className="text-2xl font-semibold text-slate-900">{playerStats.points}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Ø Zeit</p>
                  <p className="text-2xl font-semibold text-slate-900">{formatTime(Math.round(playerStats.averageTime))}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Ø Fehler</p>
                  <p className="text-2xl font-semibold text-slate-900">{playerStats.averageMistakes.toFixed(1)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Gesamtspiele</p>
                  <p className="text-2xl font-semibold text-slate-900">{playerStats.games}</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-6">
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-xl font-semibold">Sudoku</h1>
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <Timer className="h-4 w-4" />
                {formatTime(timer)}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="h-4 w-4 text-rose-500" />
                {lives}
              </span>
              <button
                onClick={() => setView('menu')}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-50"
              >
                <Menu className="h-3.5 w-3.5" />
                Menü
              </button>
            </div>
          </div>
          <div className="mt-4">
            <button
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
              onClick={() => setShowDifficultyOptions((prev) => !prev)}
            >
              <span>Schwierigkeit: {difficulty}</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showDifficultyOptions ? 'rotate-180' : ''}`}
              />
            </button>
            {showDifficultyOptions && (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-sm">
                {difficulties.map((level) => (
                  <button
                    key={level}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                      level === difficulty ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                    }`}
                    onClick={() => {
                      startNewGame(level);
                      setShowDifficultyOptions(false);
                    }}
                  >
                    {level}
                    {level === difficulty && <span className="text-xs uppercase">aktiv</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="w-full max-w-[min(90vw,520px)] aspect-square mx-auto rounded-2xl border-2 border-slate-300 bg-slate-100 p-1 shadow-inner">
            <div className="grid h-full w-full grid-rows-9 grid-cols-9 gap-[2px] bg-slate-400/40">
              {board.flatMap((row, r) =>
                row.map((cell, c) => {
                    const isSelected = selected?.r === r && selected?.c === c;
                    const isRelated =
                      selected &&
                      (selected.r === r ||
                        selected.c === c ||
                        (Math.floor(selected.r / 3) === Math.floor(r / 3) &&
                          Math.floor(selected.c / 3) === Math.floor(c / 3)));
                    const isSameValue =
                      selected &&
                      board[selected.r][selected.c].value !== 0 &&
                      board[selected.r][selected.c].value === cell.value;
                    const isError = cell.value !== 0 && cell.value !== solvedBoard[r][c];
                    const feedbackKey = `${r}-${c}`;
                    const feedbackState = cellFeedback[feedbackKey];
                    const matchesFocus =
                      focusValue !== null && cell.value === focusValue && cell.value !== 0;

                  return (
                    <button
                      key={`${r}-${c}`}
                      onClick={() => handleCellClick(r, c)}
                      className={`flex items-center justify-center text-xl font-semibold transition ${
                        isSelected
                          ? 'bg-slate-200 text-slate-900 shadow-inner ring-2 ring-slate-400'
                          : matchesFocus || isSameValue
                          ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-300'
                          : isRelated
                          ? 'bg-slate-200/70 text-slate-600'
                          : 'bg-white text-slate-700'
                      } ${isError ? 'bg-rose-100 text-rose-600' : ''} ${
                        feedbackState === 'correct'
                          ? 'animate-sudoku-pop bg-emerald-100 text-emerald-900'
                          : ''
                      } ${
                        feedbackState === 'wrong'
                          ? 'animate-sudoku-shake bg-rose-100 text-rose-700'
                          : ''
                      } ${
                        cell.isInitial ? 'font-bold text-slate-900' : 'font-semibold text-slate-500'
                      }`}
                      style={{
                        borderRight:
                          (c + 1) % 3 === 0 && c !== 8 ? '2px solid #cdd6e5' : '1px solid #e2e8f0',
                        borderBottom:
                          (r + 1) % 3 === 0 && r !== 8 ? '2px solid #cdd6e5' : '1px solid #e2e8f0',
                      }}
                    >
                      {cell.value !== 0 ? (
                        cell.value
                      ) : (
                        <div className="grid h-full w-full grid-cols-3 grid-rows-3 text-[10px] text-slate-400">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                            <span
                              key={n}
                              className={`flex items-center justify-center ${
                                cell.notes.has(n) ? 'opacity-100' : 'opacity-0'
                              }`}
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
            <button
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 ${
                isNoteMode ? 'border-slate-900 text-slate-900' : 'border-slate-200 text-slate-500'
              }`}
              onClick={() => setIsNoteMode((prev) => !prev)}
            >
              <Pencil className="h-5 w-5" />
              <span>Notizen {isNoteMode ? 'an' : 'aus'}</span>
            </button>
            <button
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2"
              onClick={() => {
                if (history.length === 0) return;
                const previous = history[history.length - 1];
                setHistory((prev) => prev.slice(0, -1));
                setBoard(previous);
              }}
            >
              <Undo2 className="h-5 w-5 text-slate-700" />
              <span>Zurück</span>
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-rows-2 gap-3">
              {[ [1, 2, 3, 4, 5], [6, 7, 8, 9, 'erase'] ].map((rowNums, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2">
                  {rowNums.map((entry) => {
                    if (entry === 'erase') {
                      return (
                        <button
                          key="erase"
                          onClick={handleErase}
                          className="rounded-lg py-3 shadow-sm transition hover:bg-slate-100 bg-white flex items-center justify-center"
                        >
                          <Eraser className="h-5 w-5 text-slate-700" />
                        </button>
                      );
                    }
                    const num = entry as number;
                    const isActive = focusValue === num;
                    const isAvailable = remainingNumbers.get(num) ?? true;
                    return (
                      <button
                        key={num}
                        onClick={() => handleNumberInput(num)}
                        disabled={!isAvailable}
                        className={`rounded-lg py-3 font-semibold shadow-sm transition ${
                          !isAvailable
                            ? 'bg-slate-100 text-slate-400 line-through cursor-not-allowed'
                            : isActive
                              ? 'bg-slate-900 text-white'
                              : 'bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className={isNoteMode ? 'text-base' : 'text-lg'}>{num}</span>
                      </button>
                    );
                  })}
                  {rowNums.length < 5 &&
                    Array.from({ length: 5 - rowNums.length }).map((_, i) => (
                      <div key={`spacer-${idx}-${i}`} />
                    ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {gameState !== 'playing' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
            <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg">
              {gameState === 'won' ? (
                <Trophy className="mx-auto h-12 w-12 text-amber-400" />
              ) : (
                <X className="mx-auto h-12 w-12 text-rose-500" />
              )}
              <h2 className="text-xl font-semibold">
                {gameState === 'won' ? 'Gut gemacht!' : 'Spiel vorbei'}
              </h2>
              <p className="text-sm text-slate-500">
                {gameState === 'won' ? `Zeit: ${formatTime(timer)}` : 'Versuch es noch einmal.'}
              </p>
              <button
                onClick={() => startNewGame()}
                className="w-full rounded-xl bg-slate-900 py-2 text-white"
              >
                Neues Spiel
              </button>
              {gameState === 'won' && (
                <button
                  onClick={() => {
                    setView('menu');
                    setGameState('playing');
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2 text-slate-700"
                >
                  Leaderboard ansehen
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;