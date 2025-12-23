import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  generateSudoku,
  type Board as BoardType,
  type Difficulty,
  type GameMode,
  checkWin,
  isValidBoardState,
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
  Home,
  BarChart3,
  Settings,
  Play,
  XCircle,
} from 'lucide-react';
import { supabase } from './lib/supabaseClient';

// Login Form Component
const LoginForm: React.FC<{ onLogin: (username: PlayerName, password: string) => boolean }> = ({ onLogin }) => {
  const [username, setUsername] = useState<PlayerName>('Noe');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (onLogin(username, password)) {
      // Success handled by parent
    } else {
      setError('Falsches Passwort');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Spieler
        </label>
        <select
          value={username}
          onChange={(e) => setUsername(e.target.value as PlayerName)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        >
          <option value="Noe">Noe</option>
          <option value="Sandy">Sandy</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Passwort
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Passwort"
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          autoFocus
        />
      </div>
      {error && (
        <p className="text-sm text-rose-500">{error}</p>
      )}
      <button
        type="submit"
        className="w-full px-4 py-3 text-base font-semibold text-white transition"
        style={{
          backgroundColor: username === 'Sandy' ? '#d4a55e' : (username === 'Noe' ? '#3f3f3f' : '#0f172a'),
          borderColor: username === 'Sandy' ? '#d4a55e' : (username === 'Noe' ? '#53cd69' : '#0f172a'),
        } as React.CSSProperties}
        onMouseEnter={(e) => {
          e.currentTarget.style.setProperty('background-color', username === 'Sandy' ? '#c1944d' : (username === 'Noe' ? '#3f3f3f' : '#1e293b'), 'important');
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.setProperty('background-color', username === 'Sandy' ? '#d4a55e' : (username === 'Noe' ? '#3f3f3f' : '#0f172a'), 'important');
        }}
      >
        Anmelden
      </button>
    </form>
  );
};

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

type TeamMember = {
  id: string;
  name: string | null;
};

type TeamProgressEntry = {
  playerName: string;
  timerSeconds: number;
  mistakes: number;
  completionPercent: number;
  status: string;
  updatedAt: string | null;
};

type AttemptSummary = {
  playerName: string;
  durationSeconds: number | null;
  mistakes: number | null;
  points: number | null;
  submittedAt: string | null;
};

const getLocalDateString = () => {
  // Use Europe/Berlin timezone for consistency with server
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
};

type FreePlayState = {
  board: Cell[][];
  solvedBoard: BoardType;
  difficulty: Difficulty;
  timer: number;
  gameState: GameState;
  mistakes: number;
  history: Cell[][][];
  selected: { r: number; c: number } | null;
  focusValue: number | null;
  cellFeedback: Record<string, 'correct' | 'wrong'>;
};

const saveFreePlayState = (state: FreePlayState) => {
  try {
    const serialized = {
      ...state,
      board: state.board.map(row => row.map(cell => ({
        value: cell.value,
        isInitial: cell.isInitial,
        notes: Array.from(cell.notes),
      }))),
      history: state.history.map(h => h.map(row => row.map(cell => ({
        value: cell.value,
        isInitial: cell.isInitial,
        notes: Array.from(cell.notes),
      })))),
    };
    localStorage.setItem('sudoku-freeplay-state', JSON.stringify(serialized));
  } catch (err) {
    console.error('Failed to save free play state:', err);
  }
};

const loadFreePlayState = (): FreePlayState | null => {
  try {
    const saved = localStorage.getItem('sudoku-freeplay-state');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return {
      ...parsed,
      board: parsed.board.map((row: any[]) => row.map((cell: any) => ({
        value: cell.value,
        isInitial: cell.isInitial,
        notes: new Set(cell.notes || []),
      }))),
      history: parsed.history?.map((h: any[]) => h.map((row: any[]) => row.map((cell: any) => ({
        value: cell.value,
        isInitial: cell.isInitial,
        notes: new Set(cell.notes || []),
      })))) || [],
    };
  } catch (err) {
    console.error('Failed to load free play state:', err);
    return null;
  }
};

// Login credentials
const PLAYERS = {
  'Noe': 'Sandy',
  'Sandy': 'Nono',
} as const;

type PlayerName = keyof typeof PLAYERS;

// Color theme helper function (currently unused but may be needed in future)
// const getThemeColors = (playerName: string) => {
//   if (playerName === 'Sandy') {
//     return {
//       primary: '#d4a55e',    // Gold für Buttons/Akzente
//       dark: '#29274c',       // space-indigo für dunkle Elemente
//       accent: '#d295bf',     // lilac für Highlights
//       background: '#edafb8', // Hintergrund für Sandy
//       overlay: '#29274c',    // space-indigo für Overlays
//       textDark: '#012a36',   // jet-black für Text
//     };
//   }
//   // Default colors for Noe (slate theme)
//   return {
//     primary: '#0f172a',      // slate-900
//     dark: '#0f172a',         // slate-900
//     accent: '#f59e0b',       // amber-500
//     background: '#282828',   // dark background for Noe
//     overlay: '#0f172a',      // slate-900
//     textDark: '#0f172a',     // slate-900
//   };
// };

const App: React.FC = () => {
  const gameModes: GameMode[] = ['Beginner', 'Easy', 'Medium', 'Hard', 'Sandy', 'Täglisches Sodoku'];
  const [selectedMode, setSelectedMode] = useState<GameMode>('Medium');
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [board, setBoard] = useState<Cell[][]>([]);
  const [solvedBoard, setSolvedBoard] = useState<BoardType>([]);
  const [hasStartedGame, setHasStartedGame] = useState(false); // New state to track if a game is active
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [timer, setTimer] = useState(0);
  const [completionTime, setCompletionTime] = useState<number | null>(null);
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [gameState, setGameState] = useState<GameState>('playing');
  const [focusValue, setFocusValue] = useState<number | null>(null);
  const [history, setHistory] = useState<Cell[][][]>([]);
  const [cellFeedback, setCellFeedback] = useState<Record<string, 'correct' | 'wrong'>>({});
  const [showDifficultyOptions, setShowDifficultyOptions] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const saved = localStorage.getItem('sudoku-authenticated');
    const savedPlayer = localStorage.getItem('sudoku-player');
    return saved === 'true' && (savedPlayer === 'Noe' || savedPlayer === 'Sandy');
  });
  const [playerName, setPlayerName] = useState(() => {
    const saved = localStorage.getItem('sudoku-player');
    if (saved === 'Noe' || saved === 'Sandy') {
      return saved;
    }
    return '';
  });
  const [isNameLocked, setIsNameLocked] = useState(true);
  const [profileId] = useState(() => {
    const existing = localStorage.getItem('sudoku-profile-id');
    if (existing) return existing;
    const generated = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    localStorage.setItem('sudoku-profile-id', generated);
    return generated;
  });
  const [view, setView] = useState<ViewMode>('menu');
  const [menuTab, setMenuTab] = useState<'home' | 'daily' | 'stats'>('home');
  const [isDailyMode, setIsDailyMode] = useState(false);
  const [hasDailyPuzzle, setHasDailyPuzzle] = useState(true);
  const [isDailyCompleted, setIsDailyCompleted] = useState(false);
  const [savedDailyProgress, setSavedDailyProgress] = useState<{ timerSeconds: number; completionPercent: number; status: string } | null>(null);
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
  const [teamName, setTeamName] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamProgress, setTeamProgress] = useState<Map<string, TeamProgressEntry>>(() => new Map());
  const [teamProgressError, setTeamProgressError] = useState<string | null>(null);
  const [teamPlayerNames, setTeamPlayerNames] = useState<{ player1: string; player2: string }>({ player1: 'Noe', player2: 'Sandy' });
  // Fixed TypeScript error: prefix with underscore to mark as intentionally unused
  const [_isPlayerInTeam, setIsPlayerInTeam] = useState(true);
  const attemptSubmittedRef = useRef(false);
  const boardRef = useRef<Cell[][]>([]);
  const currentPuzzleIdRef = useRef<string | null>(null);
  const isDailyModeRef = useRef(false);
  const gameStateRef = useRef<GameState>('playing');
  const timerRef = useRef(0);
  const mistakesRef = useRef(0);
  const completionPercentRef = useRef(0);
  const statusRef = useRef('Noch nicht gestartet');
  const teammateName = useMemo(() => {
    if (!teamMembers.length) return '';
    const teammate = teamMembers.find((member) => member.id !== profileId);
    return teammate?.name?.trim() ?? '';
  }, [teamMembers, profileId]);
  
  // Get theme colors based on player (currently unused but may be needed in future)
  // const themeColors = useMemo(() => getThemeColors(playerName), [playerName]);
  
  // WICHTIG: expectedPlayers sollte direkt aus teamPlayerNames kommen, 
  // da das die autoritative Quelle für die beiden Spielernamen im Team ist
  const expectedPlayers = useMemo(() => {
    // Always return Noe and Sandy
    return ['Noe', 'Sandy'];
  }, []);
  const todaysResultMap = useMemo(() => {
    const map = new Map<string, AttemptSummary>();
    todayResults.forEach((result) => {
      map.set(result.playerName.trim().toLowerCase(), result);
    });
    return map;
  }, [todayResults]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    currentPuzzleIdRef.current = puzzleMeta.id;
  }, [puzzleMeta.id]);

  useEffect(() => {
    isDailyModeRef.current = isDailyMode;
  }, [isDailyMode]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);

  useEffect(() => {
    mistakesRef.current = mistakes;
  }, [mistakes]);


  useEffect(() => {
    if (playerName && playerName.trim().length > 0) {
      localStorage.setItem('sudoku-player', playerName);
    }
  }, [playerName]);

  const handleLogin = useCallback((username: PlayerName, password: string) => {
    if (PLAYERS[username] === password) {
      setIsAuthenticated(true);
      setPlayerName(username);
      setIsPlayerInTeam(true);
      setIsNameLocked(true);
      localStorage.setItem('sudoku-authenticated', 'true');
      localStorage.setItem('sudoku-player', username);
      localStorage.setItem('sudoku-name-locked', 'true');
      
      // Auto-setup team
      const teamNameValue = 'Noe & Sandy';
      setTeamName(teamNameValue);
      setTeamPlayerNames({ player1: 'Noe', player2: 'Sandy' });
      
      // Save to Supabase immediately to ensure correct player name is stored
      // This ensures Supabase knows which player is logged in
      if (profileId) {
        supabase.from('player_profiles').upsert(
          {
            id: profileId,
            player_name: username, // Always use login name - this is critical for correct data storage
            team_name: teamNameValue,
            team_player1: 'Noe',
            team_player2: 'Sandy',
          },
          { onConflict: 'id' },
        ).then(({ error }) => {
          if (error) console.error('Error saving profile:', error);
        });
      }
      return true;
    }
    return false;
  }, [profileId]);

  const syncProfileFromSupabase = useCallback(async () => {
    if (!profileId || !isAuthenticated) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      // Get current player name from login state (always authoritative)
      const currentPlayerName = playerName || localStorage.getItem('sudoku-player');
      if (!currentPlayerName || (currentPlayerName !== 'Noe' && currentPlayerName !== 'Sandy')) {
        console.warn('No valid player name found');
        return;
      }

      // Always set playerName from login state
      setPlayerName(currentPlayerName as PlayerName);
      
      const { data: _data, error } = await supabase
        .from('player_profiles')
        .select('player_name, team_name, team_player1, team_player2')
        .eq('id', profileId)
        .maybeSingle();
      if (error) throw error;
      
      // Always ensure team is set to Noe & Sandy
      const teamNameValue = 'Noe & Sandy';
      setTeamName(teamNameValue);
      setTeamPlayerNames({ player1: 'Noe', player2: 'Sandy' });
      setIsPlayerInTeam(true);
      setIsNameLocked(true);
      localStorage.setItem('sudoku-name-locked', 'true');
      
      // ALWAYS update Supabase with current login name - this ensures data is saved correctly
      await supabase.from('player_profiles').upsert(
        {
          id: profileId,
          player_name: currentPlayerName, // Always use login name, never from Supabase
          team_name: teamNameValue,
          team_player1: 'Noe',
          team_player2: 'Sandy',
        },
        { onConflict: 'id' },
      );
    } catch (err) {
      console.error(err);
      setProfileError('Profil konnte nicht aus Supabase geladen werden.');
    } finally {
      setProfileLoading(false);
    }
  }, [profileId, isAuthenticated, playerName]);

  useEffect(() => {
    if (isAuthenticated) {
      syncProfileFromSupabase();
    }
  }, [syncProfileFromSupabase, isAuthenticated]);


  useEffect(() => {
    if (!profileId || !isAuthenticated) return;
    const timeout = window.setTimeout(async () => {
      if (playerName && playerName.trim().length > 0 && isNameLocked) {
        try {
          await supabase.from('player_profiles').upsert(
            {
              id: profileId,
              player_name: playerName.trim(),
              team_name: teamName || 'Noe & Sandy',
              team_player1: teamPlayerNames?.player1 || 'Noe',
              team_player2: teamPlayerNames?.player2 || 'Sandy',
            },
            { onConflict: 'id' },
          );
          setProfileError(null);
        } catch (err) {
          console.error(err);
          setProfileError('Profil konnte nicht gespeichert werden.');
        }
      }
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [playerName, profileId, teamName, teamPlayerNames, isNameLocked, isAuthenticated]);

  const fetchTeamMembers = useCallback(
    async (teamNameValue: string) => {
      setTeamError(null);
      setTeamLoading(true);
      try {
        // Get all members of this team
        const { data: allMembers, error: membersError } = await supabase
          .from('player_profiles')
          .select('id, player_name, team_player1, team_player2')
          .eq('team_name', teamNameValue);
        if (membersError) throw membersError;
        
        const members: TeamMember[] =
          allMembers?.map((profile) => ({
            id: profile.id as string,
            name: profile.player_name ?? null,
          })) ?? [];
        setTeamMembers(members);
        
        // Get team player names from first member
        if (allMembers && allMembers.length > 0) {
          const firstMember = allMembers[0];
          const player1 = (firstMember as { team_player1?: string | null }).team_player1;
          const player2 = (firstMember as { team_player2?: string | null }).team_player2;
          if (player1 && player2) {
            setTeamPlayerNames({ player1, player2 });
          }
        }
      } catch (err) {
        console.error(err);
        setTeamMembers([]);
        setTeamError('Team konnte nicht geladen werden.');
      } finally {
        setTeamLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!teamName) {
      setTeamMembers([]);
      return;
    }
    fetchTeamMembers(teamName);
  }, [teamName, fetchTeamMembers]);


  const applyPuzzleToState = useCallback(
    (
      initial: BoardType,
      solved: BoardType,
      meta?: { id?: string | null; mode?: 'daily' | 'free'; date?: string | null; difficulty?: Difficulty },
      restoreState?: FreePlayState,
    ) => {
      if (restoreState && meta?.mode === 'free') {
        // Restore free play state
        setBoard(restoreState.board);
        setSolvedBoard(restoreState.solvedBoard);
        setTimer(restoreState.timer);
        setCompletionTime(null);
        setGameState(restoreState.gameState);
        setSelected(restoreState.selected);
        setFocusValue(restoreState.focusValue);
        setCellFeedback(restoreState.cellFeedback);
        setHistory(restoreState.history);
        setMistakes(restoreState.mistakes);
        setIsDailyMode(false);
        if (restoreState.difficulty) {
          setDifficulty(restoreState.difficulty);
        }
        // Don't update puzzleMeta for free play - keep daily puzzle metadata
        // setPuzzleMeta({
        //   id: null,
        //   date: null,
        //   difficulty: restoreState.difficulty,
        // });
      } else {
        // New game state
        const newBoard = initial.map((row) =>
          row.map((val) => ({
            value: val,
            isInitial: val !== 0,
            notes: new Set<number>(),
          })),
        );

        setBoard(newBoard);
        setSolvedBoard(solved);
        setTimer(0);
        setCompletionTime(null);
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
        // Only update puzzleMeta for daily puzzles, not for free play
        if (meta?.mode === 'daily') {
          setPuzzleMeta({
            id: meta?.id ?? null,
            date: meta?.date ?? null,
            difficulty: meta?.difficulty ?? difficulty,
          });
        }
        // For free play, don't update puzzleMeta - keep daily puzzle metadata
      }
      attemptSubmittedRef.current = false;
    },
    [difficulty],
  );

  const startNewGame = useCallback(
    (diff: Difficulty = difficulty) => {
      const { initial, solved } = generateSudoku(diff);
      applyPuzzleToState(initial, solved, { mode: 'free', difficulty: diff });
      setSelectedMode(diff);
      setHasStartedGame(true); // Mark game as started
      setView('game');
    },
    [applyPuzzleToState, difficulty],
  );

  const loadTodayResults = useCallback(
    async (customPuzzleId?: string) => {
      const targetPuzzleId = customPuzzleId ?? puzzleMeta.id;
      const today = getLocalDateString();
      
      // Only load results if puzzle date is today
      if (!targetPuzzleId || puzzleMeta.date !== today) {
        setTodayResults([]);
        setTodayResultsError(null);
        setTodayResultsLoading(false);
        return;
      }
      
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
    [puzzleMeta.id, puzzleMeta.date],
  );

  const loadTeamProgress = useCallback(async () => {
    const targetPuzzleId = puzzleMeta.id;
    const today = getLocalDateString();
    
    // Only load progress if puzzle date is today
    if (!targetPuzzleId || puzzleMeta.date !== today || expectedPlayers.length === 0) {
      setTeamProgress(new Map());
      return;
    }
    setTeamProgressError(null);
    try {
      const playerNames = expectedPlayers.map((name) => name.trim()).filter((name) => name.length > 0);
      if (playerNames.length === 0) {
        setTeamProgress(new Map());
        return;
      }

      // Build query with OR conditions instead of .in() to avoid potential RLS issues
      let query = supabase
        .from('daily_progress')
        .select('player_name, timer_seconds, mistakes, completion_percent, status, updated_at')
        .eq('puzzle_id', targetPuzzleId);
      
      // Use OR filter for player names
      if (playerNames.length === 1) {
        query = query.eq('player_name', playerNames[0]);
      } else {
        const orFilter = playerNames.map(name => `player_name.eq.${name}`).join(',');
        query = query.or(orFilter);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error loading team progress:', error);
        throw error;
      }
      
      const map = new Map<string, TeamProgressEntry>();
      data?.forEach((row) => {
        if (!row.player_name) return;
        map.set(row.player_name.trim().toLowerCase(), {
          playerName: row.player_name,
          timerSeconds: row.timer_seconds ?? 0,
          mistakes: row.mistakes ?? 0,
          completionPercent: row.completion_percent ?? 0,
          status: row.status ?? 'In Bearbeitung',
          updatedAt: row.updated_at ?? null,
        });
      });
      setTeamProgress(map);
    } catch (err: any) {
      console.error('Error in loadTeamProgress:', err);
      const errorMessage = err?.message || 'Unbekannter Fehler';
      setTeamProgressError(`Fortschritt konnte nicht geladen werden: ${errorMessage}`);
      setTeamProgress(new Map());
    }
  }, [expectedPlayers, puzzleMeta.id]);

  const loadDailyPuzzle = useCallback(async (options?: { navigate?: boolean; metadataOnly?: boolean }) => {
    setPuzzleError(null);
    setIsLoadingPuzzle(true);
    try {
      const today = getLocalDateString();
      let { data, error } = await supabase
        .from('daily_puzzles')
        .select('id, puzzle_date, initial_grid, solution_grid, difficulty')
        .eq('puzzle_date', today)
        .maybeSingle();

      if (error) throw error;
      let puzzle = data as DailyPuzzleRow | null;
      if (!puzzle) {
        const { data: fallback, error: fallbackError } = await supabase
          .from('daily_puzzles')
          .select('id, puzzle_date, initial_grid, solution_grid, difficulty')
          .order('puzzle_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallbackError) throw fallbackError;
        puzzle = fallback as DailyPuzzleRow | null;
        if (!puzzle) {
          setHasDailyPuzzle(false);
          setPuzzleError('Für heute wurde noch kein tägliches Sudoku veröffentlicht.');
          return;
        }
      }
      setHasDailyPuzzle(puzzle.puzzle_date === today);

      if (!options?.metadataOnly) {
         setHasStartedGame(false); // Reset when loading a new daily puzzle
      }

      // Validate the initial_grid from database - if invalid, log error and try to fix
      if (!isValidBoardState(puzzle.initial_grid)) {
        console.error('ERROR: Daily puzzle initial_grid is invalid (contains duplicates)! Puzzle ID:', puzzle.id);
        console.error('Invalid initial_grid:', JSON.stringify(puzzle.initial_grid, null, 2));
        // Don't load corrupted puzzle - set error instead
        setPuzzleError('Das tägliche Sudoku ist beschädigt. Bitte versuche es später erneut oder kontaktiere den Administrator.');
        setHasDailyPuzzle(false);
        setIsLoadingPuzzle(false);
        if (options?.navigate) setView('game');
        return;
      }

      // Check if there's saved progress for this puzzle
      let savedProgress: { current_grid?: any; timer_seconds?: number; mistakes?: number } | null = null;
      setIsDailyCompleted(false); // Reset by default
      
      // Check if puzzle date has changed - if so, clear old progress
      const previousPuzzleDate = puzzleMeta.date;
      const currentPuzzleDate = puzzle.puzzle_date;
      if (previousPuzzleDate && previousPuzzleDate !== currentPuzzleDate) {
        // Puzzle date has changed, clear old progress
        setSavedDailyProgress(null);
      }
      
      if (playerName.trim()) {
        const { data: progressData, error: progressError } = await supabase
          .from('daily_progress')
          .select('current_grid, timer_seconds, mistakes, completion_percent, status')
          .eq('puzzle_id', puzzle.id)
          .eq('player_name', playerName.trim())
          .maybeSingle();
        
        if (progressError) {
          console.error('Error loading daily progress:', progressError);
          // Check if it's a column error
          if (progressError.message?.includes('column') || progressError.message?.includes('does not exist') || progressError.message?.includes('current_grid')) {
            console.error('FEHLER: Die Spalte "current_grid" existiert nicht in der daily_progress Tabelle. Bitte füge sie in Supabase hinzu (siehe SUPABASE_SETUP.md)');
          }
          // Clear saved progress on error
          setSavedDailyProgress(null);
        } else if (progressData) {
          savedProgress = progressData;
          // Check if daily is already completed
          const isCompleted = progressData.status === 'Abgeschlossen' || progressData.completion_percent === 100;
          setIsDailyCompleted(isCompleted);
          // Only save progress data if puzzle date is today
          if (puzzle.puzzle_date === today) {
            setSavedDailyProgress({
              timerSeconds: progressData.timer_seconds ?? 0,
              completionPercent: progressData.completion_percent ?? 0,
              status: progressData.status ?? 'Noch nicht gestartet',
            });
          } else {
            // Puzzle date is not today - clear saved progress
            setSavedDailyProgress(null);
          }
        } else {
          // No progress found for this puzzle - clear saved progress
          setSavedDailyProgress(null);
        }
      } else {
        // No player name - clear saved progress
        setSavedDailyProgress(null);
      }

      // If metadataOnly mode, update metadata and load results but don't load the board
      if (options?.metadataOnly) {
        // Only update puzzleMeta if puzzle date is today
        if (puzzle.puzzle_date === today) {
          setPuzzleMeta({
            id: puzzle.id,
            date: puzzle.puzzle_date,
            difficulty: puzzle.difficulty ?? difficulty,
          });
          loadTodayResults(puzzle.id);
        } else {
          // Puzzle date is not today - clear puzzleMeta and savedDailyProgress
          setPuzzleMeta({
            id: null,
            date: null,
            difficulty: difficulty,
          });
          setSavedDailyProgress(null);
          setTodayResults([]); // Clear today's results
        }
        return;
      }

      const shouldResumeExisting =
        boardRef.current.length > 0 &&
        currentPuzzleIdRef.current === puzzle.id &&
        isDailyModeRef.current &&
        gameStateRef.current === 'playing';

      setHasStartedGame(true); // Mark game as started

      if (shouldResumeExisting) {
        loadTodayResults(puzzle.id);
        if (options?.navigate) setView('game');
      } else if (savedProgress && savedProgress.current_grid) {
        // Restore saved progress - but validate it first
        setSelectedMode('Täglisches Sodoku');
        const restoredBoard = savedProgress.current_grid.map((row: any[]) =>
          row.map((cell: any) => ({
            value: cell.value,
            isInitial: cell.isInitial,
            notes: new Set(cell.notes || []),
          }))
        );
        
        // Convert to BoardType for validation
        const boardForValidation: BoardType = restoredBoard.map((row: Cell[]) => 
          row.map((cell: Cell) => cell.value)
        );
        
        // Validate the restored board - if invalid, start fresh instead
        if (!isValidBoardState(boardForValidation)) {
          console.warn('Restored board state is invalid (contains duplicates), starting fresh instead');
          // Delete corrupted progress from database
          if (playerName.trim() && puzzle.id) {
            supabase
              .from('daily_progress')
              .delete()
              .eq('puzzle_id', puzzle.id)
              .eq('player_name', playerName.trim())
              .then(({ error }) => {
                if (error) {
                  console.error('Error deleting corrupted progress:', error);
                } else {
                  console.log('Corrupted progress deleted successfully');
                }
              });
          }
          // Start fresh instead of restoring corrupted data
          if (puzzle.puzzle_date === today) {
            applyPuzzleToState(puzzle.initial_grid, puzzle.solution_grid, {
              id: puzzle.id,
              mode: 'daily',
              date: puzzle.puzzle_date,
              difficulty: puzzle.difficulty ?? difficulty,
            });
            loadTodayResults(puzzle.id);
          } else {
            // Puzzle date is not today - clear puzzleMeta
            setPuzzleMeta({
              id: null,
              date: null,
              difficulty: difficulty,
            });
            setSavedDailyProgress(null);
            setTodayResults([]); // Clear today's results
            setTeamProgress(new Map()); // Clear team progress
          }
        } else {
          // Board is valid, restore it
          setBoard(restoredBoard);
          setSolvedBoard(puzzle.solution_grid);
          setMistakes(savedProgress.mistakes ?? 0);
          setTimer(savedProgress.timer_seconds ?? 0);
          setGameState('playing');
          setSelected(null);
          setFocusValue(null);
          setCellFeedback({});
          setHistory([]);
          setIsDailyMode(true);
          setDifficulty(puzzle.difficulty ?? difficulty);
          // Only set puzzleMeta if puzzle date is today
          if (puzzle.puzzle_date === today) {
            setPuzzleMeta({
              id: puzzle.id,
              date: puzzle.puzzle_date,
              difficulty: puzzle.difficulty ?? difficulty,
            });
            attemptSubmittedRef.current = false;
            loadTodayResults(puzzle.id);
          } else {
            // Puzzle date is not today - clear puzzleMeta
            setPuzzleMeta({
              id: null,
              date: null,
              difficulty: difficulty,
            });
            setSavedDailyProgress(null);
            setTodayResults([]); // Clear today's results
            setTeamProgress(new Map()); // Clear team progress
          }
        }
      } else {
        // Start fresh
        setSelectedMode('Täglisches Sodoku');
        // Only set puzzleMeta and load if puzzle date is today
        if (puzzle.puzzle_date === today) {
          applyPuzzleToState(puzzle.initial_grid, puzzle.solution_grid, {
            id: puzzle.id,
            mode: 'daily',
            date: puzzle.puzzle_date,
            difficulty: puzzle.difficulty ?? difficulty,
          });
          loadTodayResults(puzzle.id);
        } else {
          // Puzzle date is not today - clear puzzleMeta
          setPuzzleMeta({
            id: null,
            date: null,
            difficulty: difficulty,
          });
          setSavedDailyProgress(null);
          setTodayResults([]); // Clear today's results
          setTeamProgress(new Map()); // Clear team progress
        }
      }
    } catch (err) {
      console.error(err);
      setPuzzleError('Konnte das tägliche Sudoku nicht laden.');
      setHasDailyPuzzle(false);
    } finally {
      setIsLoadingPuzzle(false);
      if (options?.navigate) setView('game');
    }
  }, [applyPuzzleToState, difficulty, loadTodayResults]);

  const handleModeSwitch = useCallback(
    async (mode: GameMode) => {
      // Save current state before switching
      if (isDailyMode) {
        // Explicitly save daily mode state before switching
        await saveDailyProgress();
      } else if (board.length > 0 && solvedBoard.length > 0) {
        // Save free play state
        saveFreePlayState({
          board,
          solvedBoard,
          difficulty,
          timer,
          gameState,
          mistakes,
          history,
          selected,
          focusValue,
          cellFeedback,
        });
      }

      // Switch mode
      if (mode === 'Täglisches Sodoku') {
        setSelectedMode('Täglisches Sodoku');
        localStorage.setItem('sudoku-selected-mode', 'Täglisches Sodoku');
        // loadDailyPuzzle({ navigate: true }); // No longer auto-navigate to game
        loadDailyPuzzle({ navigate: false }); // Just load data, don't start
      } else {
        // Free play mode
        const diff = mode as Difficulty;
        setSelectedMode(diff);
        setDifficulty(diff);
        localStorage.setItem('sudoku-selected-mode', diff);
        localStorage.setItem('sudoku-difficulty', diff);
        const savedState = loadFreePlayState();
        if (savedState && savedState.difficulty === diff) {
          // Restore saved state
          applyPuzzleToState(savedState.solvedBoard, savedState.solvedBoard, { mode: 'free', difficulty: diff }, savedState);
        } else {
          // Start new game
          startNewGame(diff);
        }
      }
      setShowDifficultyOptions(false);
    },
    [isDailyMode, board, solvedBoard, difficulty, timer, gameState, mistakes, history, selected, focusValue, cellFeedback, loadDailyPuzzle, applyPuzzleToState, startNewGame],
  );

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

      // Get all team member names if in a team
      const relevantNames =
        teamName && teamMembers.length > 0
          ? teamMembers
              .map((member) => member.name?.trim())
              .filter((name): name is string => name !== null && name !== undefined && name.length > 0)
              .map((name) => name.toLowerCase())
          : [];
      const filteredRows =
        relevantNames.length > 0
          ? leaderboardRows.filter((entry) => relevantNames.includes(entry.playerName.trim().toLowerCase()))
          : leaderboardRows;

      setLeaderboard(filteredRows);

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
  }, [playerName, teamName, teamMembers]);

  const handleSubmitAttempt = useCallback(async () => {
    if (!playerName || !isDailyMode || !puzzleMeta.id || attemptSubmittedRef.current) return;
    attemptSubmittedRef.current = true;

    // Use completion time if available (game was won), otherwise use current timer
    const finalTime = completionTime !== null ? completionTime : timer;

    const payload = {
      player_name: playerName.trim(), // WICHTIG: trim() hinzugefügt für Konsistenz
      puzzle_id: puzzleMeta.id,
      puzzle_date: puzzleMeta.date,
      duration_seconds: finalTime,
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
  }, [playerName, isDailyMode, puzzleMeta, timer, completionTime, mistakes, loadTodayResults]);

  useEffect(() => {
    // Timer runs for both modes, but only saved for daily mode
    // Stop timer immediately when game is won or lost
    if (gameState !== 'playing' || view === 'menu') {
      return;
    }
    const interval = window.setInterval(() => setTimer((t) => t + 1), 1000);
    return () => window.clearInterval(interval);
  }, [gameState, view]);

  // Save free play state when it changes
  useEffect(() => {
    if (!isDailyMode && board.length > 0 && solvedBoard.length > 0 && gameState === 'playing') {
      saveFreePlayState({
        board,
        solvedBoard,
        difficulty,
        timer,
        gameState,
        mistakes,
        history,
        selected,
        focusValue,
        cellFeedback,
      });
    }
  }, [isDailyMode, board, solvedBoard, difficulty, timer, gameState, mistakes, history, selected, focusValue, cellFeedback]);

  // Load daily puzzle in background when user is authenticated
  useEffect(() => {
    if (isAuthenticated && playerName.trim()) {
      // Load daily puzzle metadata in background without loading the full board
      loadDailyPuzzle({ navigate: false, metadataOnly: true });

      // Check for new daily puzzle every 5 minutes
      const checkInterval = setInterval(() => {
        loadDailyPuzzle({ navigate: false, metadataOnly: true });
      }, 5 * 60 * 1000); // 5 minutes

      return () => clearInterval(checkInterval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, playerName]);

  // Initialize game state on mount
  useEffect(() => {
    if (selectedMode === 'Täglisches Sodoku') {
      // Load daily puzzle
      loadDailyPuzzle();
    } else {
      // Load free play state or start new game
      const diff = selectedMode as Difficulty;
      setDifficulty(diff);
      const savedState = loadFreePlayState();
      if (savedState && savedState.difficulty === diff) {
        // Restore saved state
        applyPuzzleToState(savedState.solvedBoard, savedState.solvedBoard, { mode: 'free', difficulty: diff }, savedState);
      } else {
        // Start new game if no saved state
        if (board.length === 0) {
          startNewGame(diff);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  useEffect(() => {
    if (view === 'menu') {
      loadLeaderboard();
      // Refresh daily puzzle data when menu is opened to ensure we have the latest data
      if (isAuthenticated && playerName.trim()) {
        loadDailyPuzzle({ navigate: false, metadataOnly: true });
      }
    }
  }, [view, loadLeaderboard, isAuthenticated, playerName, loadDailyPuzzle]);

  useEffect(() => {
    const today = getLocalDateString();
    // Only load results if puzzle date is today
    if (view === 'menu' && puzzleMeta.id && puzzleMeta.date === today) {
      loadTodayResults();
      
      // Realtime subscription für automatische Updates der heutigen Ergebnisse
      const channelName = `daily-attempts-${puzzleMeta.id}`;
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'daily_attempts',
            filter: `puzzle_id=eq.${puzzleMeta.id}`,
          },
          (payload) => {
            console.log('Realtime update für daily_attempts erhalten:', payload);
            // Lade Ergebnisse neu wenn jemand ein Ergebnis einreicht
            loadTodayResults();
          },
        )
        .subscribe((status) => {
          console.log('Realtime subscription status für daily_attempts:', status);
        });

      return () => {
        supabase.removeChannel(channel);
      };
    } else if (view === 'menu') {
      const todayCheck = getLocalDateString();
      // Clear results and progress if puzzle date is not today
      if (puzzleMeta.date !== todayCheck) {
        setTodayResults([]);
        setTeamProgress(new Map());
      }
    }
  }, [view, puzzleMeta.id, puzzleMeta.date, loadTodayResults]);

  useEffect(() => {
    const today = getLocalDateString();
    
    // Only load team progress if puzzle date is today
    if (!puzzleMeta.id || puzzleMeta.date !== today || expectedPlayers.length === 0) {
      setTeamProgress(new Map());
      return;
    }

    // Initial load
    loadTeamProgress();
    
    // Polling fallback (every 2 seconds)
    const interval = window.setInterval(() => {
      loadTeamProgress();
    }, 2000);

    // Realtime subscription
    const channelName = `daily-progress-${puzzleMeta.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_progress',
          filter: `puzzle_id=eq.${puzzleMeta.id}`,
        },
        (payload) => {
          console.log('Realtime update received:', payload);
          // Lade immer den Team-Fortschritt neu, wenn es ein Update gibt
          // loadTeamProgress() filtert selbst nach expectedPlayers
          loadTeamProgress();
        },
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to realtime updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Realtime subscription error');
        }
      });

    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [puzzleMeta.id, puzzleMeta.date, expectedPlayers, loadTeamProgress]);

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

  // Get the display time - use completion time if game is won, otherwise use current timer
  const displayTime = gameState === 'won' && completionTime !== null ? completionTime : timer;

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
    }

    setHistory((prev) => [...prev, board]);
    newBoard[r][c] = { value: num, isInitial: false, notes: new Set() };
    setBoard(newBoard);
    triggerFeedback(`${r}-${c}`, isCorrect ? 'correct' : 'wrong');

    if (isCorrect) {
      const flat = newBoard.map((row) => row.map((entry) => entry.value));
      if (checkWin(flat, solvedBoard)) {
        // Capture the completion time immediately
        setCompletionTime(timer);
        setGameState('won');
      }
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

  const { correctPlacements, totalPlacements } = useMemo(() => {
    if (!board.length || !solvedBoard.length) return { correctPlacements: 0, totalPlacements: 0 };
    let correct = 0;
    let total = 0;
    for (let r = 0; r < board.length && r < solvedBoard.length; r++) {
      for (let c = 0; c < board[r].length && c < solvedBoard[r].length; c++) {
        const cell = board[r][c];
        if (!cell || cell.isInitial) continue;
        total += 1;
        if (cell.value !== 0 && solvedBoard[r]?.[c] === cell.value) {
          correct += 1;
        }
      }
    }
    console.log('Progress calculation:', { correct, total, percent: total > 0 ? Math.round((correct / total) * 100) : 0 });
    return { correctPlacements: correct, totalPlacements: total };
  }, [board, solvedBoard]);

  const completionPercent = useMemo(() => {
    if (!totalPlacements) return 0;
    return Math.round((correctPlacements / totalPlacements) * 100);
  }, [correctPlacements, totalPlacements]);

  useEffect(() => {
    completionPercentRef.current = completionPercent;
    // Automatically set game state to won when 100% complete
    if (completionPercent === 100 && gameState === 'playing') {
      setCompletionTime(timer);
      setGameState('won');
    }
  }, [completionPercent, gameState, timer]);

  const dailyStatusLabel = useMemo(() => {
    // Check if puzzle date is today - if not, always show "Noch nicht gestartet"
    const isTodayPuzzle = puzzleMeta.date === getLocalDateString();
    
    // Check if daily is completed from background check
    if (isDailyCompleted && isTodayPuzzle) return 'Abgeschlossen';
    
    // If no puzzle metadata, not started
    if (!puzzleMeta.id) return 'Noch nicht gestartet';
    
    // If puzzle date is not today, show as not started
    if (!isTodayPuzzle) return 'Noch nicht gestartet';
    
    // If in daily mode, show current game status
    if (isDailyMode) {
      if (gameState === 'won' || completionPercent === 100) return 'Abgeschlossen';
      if (gameState === 'lost') return 'Aufgegeben';
      if (timer > 0) return 'In Bearbeitung';
      return 'Gestartet';
    }
    
    // If puzzle exists but not in daily mode yet, show as available
    return 'Noch nicht gestartet';
  }, [gameState, isDailyMode, puzzleMeta.id, puzzleMeta.date, timer, completionPercent, isDailyCompleted]);

  useEffect(() => {
    statusRef.current = dailyStatusLabel;
  }, [dailyStatusLabel]);

  // Function to save daily progress explicitly
  const saveDailyProgress = useCallback(async () => {
    if (!playerName.trim() || !isDailyMode || !puzzleMeta.id || !solvedBoard.length || !board.length) return;
    
    try {
      // Serialize board state
      const currentGrid = board.map(row => 
        row.map(cell => ({
          value: cell.value,
          isInitial: cell.isInitial,
          notes: Array.from(cell.notes),
        }))
      );
      
      // Validate board state before saving - prevent saving corrupted data
      const boardForValidation: BoardType = board.map(row => row.map(cell => cell.value));
      if (!isValidBoardState(boardForValidation)) {
        console.error('ERROR: Attempted to save invalid board state (contains duplicates)! Not saving to prevent corruption.');
        console.error('Invalid board state:', JSON.stringify(boardForValidation, null, 2));
        // Don't save corrupted data - instead, delete any existing corrupted progress
        await supabase
          .from('daily_progress')
          .delete()
          .eq('puzzle_id', puzzleMeta.id)
          .eq('player_name', playerName.trim());
        return;
      }
      
      const payload = {
        player_name: playerName.trim(),
        puzzle_id: puzzleMeta.id,
        timer_seconds: timer,
        mistakes: mistakes,
        completion_percent: completionPercent,
        status: dailyStatusLabel,
        current_grid: currentGrid,
        updated_at: new Date().toISOString(),
      };
      
      const { error, data } = await supabase.from('daily_progress').upsert(
        payload,
        { onConflict: 'player_name,puzzle_id' },
      );
      
      if (error) {
        console.error('Error saving daily progress:', error);
        console.error('Payload:', payload);
      } else {
        console.log('Progress saved successfully:', { completion_percent: completionPercent, data });
      }
    } catch (err: any) {
      console.error('Error saving daily progress:', err);
      // Check if it's a column error
      if (err?.message?.includes('column') || err?.message?.includes('does not exist') || err?.message?.includes('current_grid')) {
        console.error('FEHLER: Die Spalte "current_grid" existiert nicht in der daily_progress Tabelle. Bitte füge sie in Supabase hinzu (siehe SUPABASE_SETUP.md)');
      }
    }
  }, [playerName, isDailyMode, puzzleMeta.id, solvedBoard.length, board, timer, mistakes, completionPercent, dailyStatusLabel]);

  useEffect(() => {
    if (!playerName.trim() || !isDailyMode || !puzzleMeta.id || !solvedBoard.length) return;

    let cancelled = false;
    const syncProgress = async () => {
      if (cancelled) return;
      try {
        // Serialize board state
        const currentGrid = boardRef.current.map(row => 
          row.map(cell => ({
            value: cell.value,
            isInitial: cell.isInitial,
            notes: Array.from(cell.notes),
          }))
        );
        
        // Validate board state before saving - prevent saving corrupted data
        const boardForValidation: BoardType = boardRef.current.map(row => row.map(cell => cell.value));
        if (!isValidBoardState(boardForValidation)) {
          console.error('ERROR: Attempted to sync invalid board state (contains duplicates)! Not syncing to prevent corruption.');
          // Don't save corrupted data
          return;
        }
        
        const syncPayload = {
          player_name: playerName.trim(),
          puzzle_id: puzzleMeta.id,
          timer_seconds: timerRef.current,
          mistakes: mistakesRef.current,
          completion_percent: completionPercentRef.current,
          status: statusRef.current,
          current_grid: currentGrid,
          updated_at: new Date().toISOString(),
        };
        
        const { error: syncError } = await supabase.from('daily_progress').upsert(
          syncPayload,
          { onConflict: 'player_name,puzzle_id' },
        );
        
        if (syncError) {
          console.error('Error in syncProgress:', syncError);
        }
      } catch (err: any) {
        console.error('Error in syncProgress:', err);
        // Check if it's a column error
        if (err?.message?.includes('column') || err?.message?.includes('does not exist') || err?.message?.includes('current_grid')) {
          console.error('FEHLER: Die Spalte "current_grid" existiert nicht in der daily_progress Tabelle. Bitte füge sie in Supabase hinzu (siehe SUPABASE_SETUP.md)');
        }
      }
    };

    syncProgress();
    const interval = window.setInterval(syncProgress, 1000);
    
    // Save on page unload
    const handleBeforeUnload = () => {
      saveDailyProgress();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Final save on cleanup
      saveDailyProgress();
    };
  }, [playerName, isDailyMode, puzzleMeta.id, solvedBoard.length, saveDailyProgress]);

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    // Use default background for login screen
    return (
      <div className="min-h-screen w-full text-slate-900 flex items-center justify-center px-4" style={{ backgroundColor: '#f9fafb' } as React.CSSProperties}>
        <div 
          className="w-full max-w-md p-8"
          style={{ backgroundColor: 'transparent' } as React.CSSProperties}
        >
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Sudoku</h1>
          <p className="text-sm text-slate-500 mb-6">Bitte melde dich an, um zu spielen.</p>
          <LoginForm onLogin={handleLogin} />
        </div>
      </div>
    );
  }

  if (view === 'menu') {
    const themeColor = playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#53cd69' : '#64748b');
    const bgColor = playerName === 'Sandy' ? '#f7e1d7' : (playerName === 'Noe' ? '#282828' : '#dedbd2');
    const textColor = playerName === 'Noe' ? '#ffffff' : '#0f172a';
    const cardBg = playerName === 'Noe' ? '#3f3f3f' : '#ffffff';
    const activeTabColor = playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#53cd69' : '#0f172a');

    return (
      <div 
        className="min-h-screen w-full relative flex flex-col"
        style={{ backgroundColor: bgColor, color: textColor } as React.CSSProperties}
      >
        <header className="sticky top-0 z-10 px-6 py-4 backdrop-blur-xl border-b border-black/5 flex items-center justify-between shadow-sm"
          style={{ backgroundColor: bgColor + 'ee', borderColor: playerName === 'Noe' ? '#3f3f3f' : 'rgba(0,0,0,0.05)' }}>
           <h1 className="text-xl font-bold">
             {menuTab === 'home' ? 'Sudoku' : menuTab === 'daily' ? 'Täglich' : 'Statistiken'}
           </h1>
           <button
              onClick={() => setView('game')}
              className="p-2 rounded-full hover:bg-black/5 active:scale-95 transition"
              title="Zurück zum Spiel"
           >
             <X className="h-6 w-6" />
           </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-32 space-y-6">
          
          {menuTab === 'home' && (
             <div className="space-y-6 max-w-lg mx-auto w-full">
                {/* Profil Section */}
                <section className="rounded-3xl p-6 shadow-sm backdrop-blur-md transition-all hover:shadow-lg border border-black/5" style={{ backgroundColor: cardBg }}>
                   <div className="flex items-center gap-4 mb-6">
                      <div className="h-16 w-16 rounded-full flex items-center justify-center text-2xl font-bold shadow-inner" 
                           style={{ backgroundColor: themeColor, color: '#fff' }}>
                        {playerName.charAt(0)}
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold">{playerName}</h2>
                        <p className="text-sm opacity-60 font-medium">Sudoku Meister</p>
                      </div>
                   </div>

                   {/* Team Card embedded */}
                   <div className="rounded-2xl bg-black/5 p-4 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-3 opacity-10 transform translate-x-2 -translate-y-2 transition-transform group-hover:scale-110">
                        <Heart className="w-16 h-16 fill-current" />
                      </div>
                      
                      <div className="relative z-10">
                        <p className="text-xs font-bold uppercase tracking-wider opacity-60 mb-1">Dein Team</p>
                        {teamName ? (
                          <>
                             <p className="text-lg font-bold mb-3">{teamName}</p>
                             <div className="flex -space-x-3 overflow-hidden">
                                {teamPlayerNames ? (
                                  <>
                                    <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white flex items-center justify-center text-xs font-bold bg-slate-200 text-slate-600" title={teamPlayerNames.player1}>
                                      {teamPlayerNames.player1.charAt(0)}
                                    </div>
                                    <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white flex items-center justify-center text-xs font-bold bg-slate-300 text-slate-700" title={teamPlayerNames.player2}>
                                      {teamPlayerNames.player2.charAt(0)}
                                    </div>
                                  </>
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-slate-200 animate-pulse"></div>
                                )}
                             </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 text-sm opacity-70">
                            <span>Kein Team zugewiesen</span>
                          </div>
                        )}
                      </div>
                   </div>
                </section>

                {/* Game Mode Section */}
                <section className="rounded-3xl p-6 shadow-sm backdrop-blur-md transition-all hover:shadow-lg border border-black/5" style={{ backgroundColor: cardBg }}>
                   <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                     <Settings className="w-5 h-5" style={{ color: themeColor }} />
                     Spielmodus
                   </h2>
                   
                   <div className="grid grid-cols-2 gap-3 mb-4">
                      {['Täglisches Sodoku', 'Freies Spiel'].map((modeType) => {
                        const isActive = (modeType === 'Täglisches Sodoku' && selectedMode === 'Täglisches Sodoku') ||
                                         (modeType === 'Freies Spiel' && selectedMode !== 'Täglisches Sodoku');
                        
                        return (
                          <button
                            key={modeType}
                            onClick={() => {
                              if (modeType === 'Täglisches Sodoku') {
                                handleModeSwitch('Täglisches Sodoku');
                                setMenuTab('daily');
                              } else if (selectedMode === 'Täglisches Sodoku') {
                                handleModeSwitch('Medium'); // Default to Medium for free play
                              }
                            }}
                            className={`p-3 rounded-xl text-sm font-bold transition-all ${isActive ? 'shadow-md scale-[1.02]' : 'hover:bg-black/5 opacity-70'}`}
                            style={{ 
                              backgroundColor: isActive ? themeColor : 'rgba(0,0,0,0.05)',
                              color: isActive ? '#fff' : 'inherit'
                            }}
                          >
                            {modeType}
                          </button>
                        );
                      })}
                   </div>

                   {/* Difficulty Selector (only for Free Play) */}
                   {selectedMode !== 'Täglisches Sodoku' && (
                     <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <p className="text-xs font-bold uppercase tracking-wider opacity-60 pl-1">Schwierigkeit</p>
                        <div className="grid grid-cols-4 gap-2">
                           {['Easy', 'Medium', 'Hard', 'Sandy'].map((diff) => (
                             <button
                               key={diff}
                               onClick={() => handleModeSwitch(diff as GameMode)}
                               className={`py-2 px-1 rounded-lg text-xs font-bold transition-all border-2`}
                               style={{ 
                                 borderColor: difficulty === diff ? themeColor : 'transparent',
                                 backgroundColor: difficulty === diff ? (playerName === 'Noe' ? '#ffffff20' : '#00000008') : 'rgba(0,0,0,0.05)',
                                 color: difficulty === diff ? themeColor : 'inherit',
                                 opacity: difficulty === diff ? 1 : 0.7
                               }}
                             >
                               {diff === 'Easy' ? 'Leicht' : diff === 'Medium' ? 'Mittel' : diff === 'Hard' ? 'Schwer' : 'Sandy'}
                             </button>
                           ))}
                        </div>
                     </div>
                   )}
                </section>

                {/* Big Action Button */}
                <button
                  onClick={() => {
                    if (hasStartedGame) {
                      setView('game');
                    } else {
                      if (selectedMode === 'Täglisches Sodoku') {
                        loadDailyPuzzle({ navigate: true });
                      } else {
                        startNewGame(difficulty);
                      }
                    }
                  }}
                  className="w-full py-4 rounded-2xl text-lg font-bold shadow-xl transform transition hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 relative overflow-hidden group"
                  style={{ backgroundColor: themeColor, color: '#fff' }}
                >
                   <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                   {hasStartedGame ? <Undo2 className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                   <span>{hasStartedGame ? 'Zurück zum Spiel' : 'Neues Spiel starten'}</span>
                </button>
             </div>
          )}

          {menuTab === 'daily' && (
            <div className="space-y-6 max-w-lg mx-auto w-full">
               <section className="rounded-2xl p-6 shadow-md backdrop-blur-sm relative overflow-hidden text-white" 
                        style={{ background: `linear-gradient(135deg, ${themeColor}, ${playerName === 'Sandy' ? '#e8bc75' : '#4ade80'})` }}>
                  <div className="absolute top-0 right-0 p-4 opacity-20">
                    <CalendarDays className="w-32 h-32 transform rotate-12 translate-x-8 -translate-y-8" />
                  </div>
                  <div className="relative z-10">
                    <h2 className="text-2xl font-bold mb-2 text-shadow-sm">Tägliches Sudoku</h2>
                    <p className="opacity-90 mb-6 text-sm font-medium">Jeden Tag eine neue Herausforderung für dein Team.</p>
                    
                     <button
                      onClick={() => loadDailyPuzzle({ navigate: true })}
                      disabled={isLoadingPuzzle || !hasDailyPuzzle || isDailyCompleted}
                      className="w-full py-3.5 rounded-xl font-bold text-slate-900 bg-white shadow-lg transition transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                     >
                      {isLoadingPuzzle ? 'Lädt…' : isDailyCompleted ? 'Bereits abgeschlossen' : hasDailyPuzzle ? 'Jetzt Spielen' : 'Bald verfügbar'}
                     </button>

                     <div className="grid grid-cols-2 gap-3 mt-6">
                        <div className="bg-black/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
                          <span className="block text-xs font-bold uppercase opacity-70">Datum</span>
                          <span className="font-mono text-lg font-bold">{puzzleMeta.id && puzzleMeta.date === getLocalDateString() ? puzzleMeta.date : '—'}</span>
                        </div>
                        <div className="bg-black/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
                           <span className="block text-xs font-bold uppercase opacity-70">Status</span>
                           <span className="font-bold text-sm truncate">{dailyStatusLabel}</span>
                        </div>
                     </div>
                  </div>
               </section>

               <section className="rounded-2xl p-5 shadow-sm backdrop-blur-sm" style={{ backgroundColor: cardBg }}>
                  <div className="flex items-center gap-2 mb-4">
                      <Trophy className="h-5 w-5" style={{ color: themeColor }} />
                      <h3 className="font-bold text-lg">Ergebnisse von Heute</h3>
                  </div>
                  
                  {(() => {
                    const today = getLocalDateString();
                    if (puzzleMeta.date !== today || !puzzleMeta.id) return <p className="text-sm opacity-60">Noch keine Ergebnisse für heute.</p>;
                    
                    const filteredTeamProgress = new Map<string, TeamProgressEntry>();
                    if (puzzleMeta.date === today) {
                      teamProgress.forEach((value, key) => filteredTeamProgress.set(key, value));
                    }
                    
                    const hasAnyResults = expectedPlayers.some(name => {
                      const normalized = name.trim().toLowerCase();
                      return todaysResultMap.get(normalized) || filteredTeamProgress.get(normalized);
                    });
                    
                    if (!hasAnyResults) return <p className="text-sm opacity-60">Noch hat niemand gespielt.</p>;

                    return (
                      <div className="space-y-3">
                        {expectedPlayers.map((name) => {
                          const normalized = name.trim().toLowerCase();
                          const entry = todaysResultMap.get(normalized);
                          const progress = filteredTeamProgress.get(normalized);
                          if (!entry && !progress) return null;

                          return (
                            <div key={name} className="flex flex-col gap-1 p-3 rounded-xl bg-black/5">
                               <div className="flex justify-between items-center">
                                  <span className="font-bold">{name}</span>
                                  {entry && entry.submittedAt && <span className="text-xs opacity-60">{new Date(entry.submittedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>}
                               </div>
                               {entry ? (
                                  <div className="text-sm opacity-80 flex gap-3">
                                     <span>⏱️ {formatTime(entry.durationSeconds ?? 0)}</span>
                                     <span>❌ {entry.mistakes}</span>
                                     <span className="font-bold" style={{ color: themeColor }}>{entry.points} Pkt</span>
                                  </div>
                               ) : progress ? (
                                  <div className="text-sm opacity-80">
                                     {progress.status} · {progress.completionPercent}%
                                  </div>
                               ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
               </section>

               <section className="rounded-2xl p-5 shadow-sm backdrop-blur-sm" style={{ backgroundColor: cardBg }}>
                  <div className="flex items-center gap-2 mb-4">
                      <BarChart3 className="h-5 w-5" style={{ color: themeColor }} />
                      <h3 className="font-bold text-lg">Bestenliste</h3>
                  </div>
                  
                   {leaderboard.length === 0 ? (
                      <p className="text-sm opacity-60">Noch keine Ranglisteneinträge.</p>
                   ) : (
                      <ul className="space-y-3">
                        {leaderboard.map((entry, index) => (
                          <li key={entry.playerName} className="flex items-center justify-between p-3 rounded-xl hover:bg-black/5 transition">
                             <div className="flex items-center gap-3">
                                <span className="font-bold opacity-50 w-6">#{index + 1}</span>
                                <div>
                                   <p className="font-bold">{entry.playerName}</p>
                                   <p className="text-xs opacity-60">{entry.wins} Siege</p>
                                </div>
                             </div>
                             <span className="font-bold text-lg" style={{ color: themeColor }}>{entry.points}</span>
                          </li>
                        ))}
                      </ul>
                   )}
               </section>
            </div>
          )}

          {menuTab === 'stats' && (
             <div className="space-y-6 max-w-lg mx-auto w-full">
                <section className="rounded-2xl p-6 shadow-sm backdrop-blur-sm text-center" style={{ backgroundColor: cardBg }}>
                   <div className="mb-6">
                      <h2 className="text-2xl font-bold">Deine Statistiken</h2>
                      <p className="text-sm opacity-60">Deine gesamte Sudoku-Karriere</p>
                   </div>
                   
                   {!playerStats ? (
                      <p className="opacity-60">Spiele ein Puzzle, um Statistiken zu sehen.</p>
                   ) : (
                      <div className="grid grid-cols-2 gap-4">
                          <div className="bg-black/5 p-4 rounded-2xl">
                             <p className="text-xs uppercase font-bold opacity-50 mb-1">Siege</p>
                             <p className="text-3xl font-bold" style={{ color: themeColor }}>{playerStats.wins}</p>
                          </div>
                          <div className="bg-black/5 p-4 rounded-2xl">
                             <p className="text-xs uppercase font-bold opacity-50 mb-1">Punkte</p>
                             <p className="text-3xl font-bold" style={{ color: themeColor }}>{playerStats.points}</p>
                          </div>
                          <div className="bg-black/5 p-4 rounded-2xl">
                             <p className="text-xs uppercase font-bold opacity-50 mb-1">Ø Zeit</p>
                             <p className="text-xl font-bold">{formatTime(Math.round(playerStats.averageTime))}</p>
                          </div>
                          <div className="bg-black/5 p-4 rounded-2xl">
                             <p className="text-xs uppercase font-bold opacity-50 mb-1">Spiele</p>
                             <p className="text-xl font-bold">{playerStats.games}</p>
                          </div>
                      </div>
                   )}
                </section>
             </div>
          )}

        </main>

        <nav className="fixed bottom-0 left-0 right-0 backdrop-blur-lg border-t border-black/5 pb-safe z-50 transition-all"
             style={{ backgroundColor: playerName === 'Noe' ? '#1e1e1e99' : '#ffffffcc' }}>
           <div className="flex justify-around items-center p-2 max-w-md mx-auto">
              <button 
                onClick={() => setMenuTab('home')} 
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all w-24 ${menuTab === 'home' ? 'bg-black/5 scale-105' : 'opacity-40 hover:opacity-70'}`}
                style={{ color: menuTab === 'home' ? activeTabColor : 'inherit' }}
              >
                 <Home className={`w-6 h-6 ${menuTab === 'home' ? 'fill-current' : ''}`} />
                 <span className="text-[10px] font-extrabold uppercase tracking-widest">Home</span>
              </button>
              
              <button 
                onClick={() => setMenuTab('daily')} 
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all w-24 ${menuTab === 'daily' ? 'bg-black/5 scale-105' : 'opacity-40 hover:opacity-70'}`}
                style={{ color: menuTab === 'daily' ? activeTabColor : 'inherit' }}
              >
                 <CalendarDays className={`w-6 h-6 ${menuTab === 'daily' ? 'fill-current' : ''}`} />
                 <span className="text-[10px] font-extrabold uppercase tracking-widest">Täglich</span>
              </button>

              <button 
                onClick={() => setMenuTab('stats')} 
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all w-24 ${menuTab === 'stats' ? 'bg-black/5 scale-105' : 'opacity-40 hover:opacity-70'}`}
                style={{ color: menuTab === 'stats' ? activeTabColor : 'inherit' }}
              >
                 <BarChart3 className={`w-6 h-6 ${menuTab === 'stats' ? 'fill-current' : ''}`} />
                 <span className="text-[10px] font-extrabold uppercase tracking-widest">Statistik</span>
              </button>
           </div>
        </nav>
      </div>
    );
  }

  if (false) {
    return (
      <div 
        className="min-h-screen w-full"
        style={{ 
          backgroundColor: playerName === 'Sandy' ? '#f7e1d7' : (playerName === 'Noe' ? '#282828' : '#dedbd2'),
          color: playerName === 'Noe' ? '#ffffff' : '#0f172a'
        } as React.CSSProperties}
      >
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-6 md:max-w-5xl md:gap-8 md:px-6 md:py-8 lg:max-w-6xl lg:gap-10 lg:px-8">
          <section className="px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
            <div className="flex flex-wrap items-center justify-between gap-4 md:gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest md:text-sm" style={{ color: playerName === 'Noe' ? '#94a3b8' : '#64748b' } as React.CSSProperties}>Menü</p>
                <h1 className="text-2xl font-semibold md:text-3xl lg:text-4xl" style={{ color: playerName === 'Noe' ? '#ffffff' : undefined } as React.CSSProperties}>Gemeinsames Sudoku</h1>
                <p className="mt-1 text-sm md:text-base lg:text-lg" style={{ color: playerName === 'Noe' ? '#94a3b8' : '#64748b' } as React.CSSProperties}>
                  Hier verwaltest du Namen, tägliche Rätsel und das Leaderboard.
                </p>
              </div>
              <button
                onClick={() => setView('game')}
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition md:px-5 md:py-2.5 md:text-base lg:px-6 lg:py-3"
                style={{
                  borderColor: playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#53cd69' : '#94a3b8'),
                  color: playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#53cd69' : '#64748b'),
                  backgroundColor: playerName === 'Sandy' ? '#f7e1d7' : (playerName === 'Noe' ? '#3f3f3f' : '#dedbd2'),
                } as React.CSSProperties}
                onMouseEnter={(e) => {
                  e.currentTarget.style.setProperty('background-color', playerName === 'Sandy' ? '#f5e8f0' : (playerName === 'Noe' ? '#3f3f3f' : '#f1f5f9'), 'important');
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.setProperty('background-color', playerName === 'Sandy' ? '#f7e1d7' : (playerName === 'Noe' ? '#3f3f3f' : '#dedbd2'), 'important');
                }}
              >
                <Undo2 className="h-4 w-4 md:h-5 md:w-5" />
                Zurück zum Spiel
              </button>
            </div>
          </section>

          <section className="px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
            <div className="flex flex-col gap-5 md:gap-6 lg:gap-8">
              <div className="space-y-3 md:space-y-4">
                <h2 className="text-lg font-semibold md:text-xl lg:text-2xl">Spieler</h2>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dein Name</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={playerName}
                      readOnly
                      disabled={true}
                      placeholder="Dein Name"
                      className={`flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 md:px-4 md:py-3.5 md:text-base lg:px-5 lg:py-4 lg:text-lg ${
                        isNameLocked ? 'bg-slate-100 cursor-not-allowed opacity-75' : ''
                      }`}
                    />
                  </div>
                </div>
                {profileLoading ? (
                  <p className="text-xs text-slate-400">Synchronisiere Profil…</p>
                ) : profileError ? (
                  <p className="text-xs text-rose-500">{profileError}</p>
                ) : (
                  <p className="text-xs text-emerald-600">Profil synchronisiert ✅</p>
                )}
              </div>

              <div className="p-4 md:p-5 lg:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide md:text-sm text-slate-500">Team</p>
                    <p className="text-xs md:text-sm lg:text-base text-slate-600">Du und dein Partner spielen zusammen.</p>
                  </div>
                </div>
                {teamError && <p className="mt-2 text-xs text-rose-500">{teamError}</p>}
                {teamName ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm font-semibold text-slate-900">
                      Team: {teamName}
                    </p>
                    {teamLoading ? (
                      <p className="text-xs text-slate-400">Synchronisiere Team…</p>
                    ) : (
                      <div className="space-y-2 p-3 bg-slate-50">
                        {/* Zeige beide Spieler aus teamPlayerNames an, wenn verfügbar */}
                        {teamPlayerNames ? (
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-semibold" style={{ color: playerName === 'Noe' ? '#ffffff' : '#0f172a' } as React.CSSProperties}>
                                {teamPlayerNames.player1} {teamPlayerNames.player1.trim().toLowerCase() === playerName.trim().toLowerCase() ? '(Du)' : ''}
                              </span>
                              <span className="text-xs uppercase tracking-wide" style={{ color: playerName === 'Noe' ? '#ffffff' : '#94a3b8' } as React.CSSProperties}>
                                {teamPlayerNames.player1.trim().toLowerCase() === playerName.trim().toLowerCase() ? 'Du' : 'Partner'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-semibold" style={{ color: playerName === 'Noe' ? '#ffffff' : '#0f172a' } as React.CSSProperties}>
                                {teamPlayerNames.player2} {teamPlayerNames.player2.trim().toLowerCase() === playerName.trim().toLowerCase() ? '(Du)' : ''}
                              </span>
                              <span className="text-xs uppercase tracking-wide" style={{ color: playerName === 'Noe' ? '#ffffff' : '#94a3b8' } as React.CSSProperties}>
                                {teamPlayerNames.player2.trim().toLowerCase() === playerName.trim().toLowerCase() ? 'Du' : 'Partner'}
                              </span>
                            </div>
                            {/* Zeige zusätzlich Team-Mitglieder an, die bereits eingeloggt sind */}
                            {teamMembers.length > 0 && teamMembers.some(m => 
                              m.name?.trim().toLowerCase() !== teamPlayerNames.player1.trim().toLowerCase() &&
                              m.name?.trim().toLowerCase() !== teamPlayerNames.player2.trim().toLowerCase()
                            ) && (
                              <div className="mt-2 border-t border-slate-100 pt-2">
                                {teamMembers
                                  .filter(m => 
                                    m.name?.trim().toLowerCase() !== teamPlayerNames.player1.trim().toLowerCase() &&
                                    m.name?.trim().toLowerCase() !== teamPlayerNames.player2.trim().toLowerCase()
                                  )
                                  .map((member) => (
                                    <div key={member.id} className="flex items-center justify-between text-sm">
                                      <span className="font-semibold text-slate-900">
                                        {member.name ?? 'Unbekannt'} {member.id === profileId ? '(Du)' : ''}
                                      </span>
                                      <span className="text-xs uppercase tracking-wide text-slate-400">
                                        {member.id === profileId ? 'Du' : 'Partner'}
                                      </span>
                                    </div>
                                  ))
                                }
                              </div>
                            )}
                          </>
                        ) : teamMembers.length ? (
                          teamMembers.map((member) => (
                            <div key={member.id} className="flex items-center justify-between text-sm">
                              <span className="font-semibold text-slate-900">
                                {member.name ?? 'Unbekannt'} {member.id === profileId ? '(Du)' : ''}
                              </span>
                              <span className="text-xs uppercase tracking-wide text-slate-400">
                                {member.id === profileId ? 'Du' : 'Partner'}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500">Noch keine Mitglieder.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
            <h2 className="text-lg font-semibold md:text-xl lg:text-2xl mb-4 md:mb-5 lg:mb-6">Spielmodus & Schwierigkeit</h2>
            <div className="mt-4">
              <button
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-slate-50 md:px-4 md:py-2.5 md:text-base lg:px-5 lg:py-3 lg:text-lg text-slate-700"
                onClick={() => setShowDifficultyOptions((prev) => !prev)}
              >
                <span>Modus: {selectedMode === 'Täglisches Sodoku' ? 'Täglisches Sodoku' : `Schwierigkeit: ${difficulty}`}</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform md:h-5 md:w-5 lg:h-6 lg:w-6 ${showDifficultyOptions ? 'rotate-180' : ''}`}
                />
              </button>
              {showDifficultyOptions && (
                <div className="mt-2 md:mt-3 bg-slate-50">
                  {gameModes.map((mode) => (
                    <button
                      key={mode}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm md:px-5 md:py-2.5 md:text-base lg:px-6 lg:py-3 lg:text-lg ${
                        mode === selectedMode ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                      }`}
                      onClick={() => {
                        handleModeSwitch(mode);
                      }}
                    >
                      {mode}
                      {mode === selectedMode && <span className="text-xs uppercase md:text-sm">aktiv</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
            <div className="flex flex-wrap items-center justify-between gap-3 md:gap-4 lg:gap-6">
              <div>
                <h2 className="text-lg font-semibold md:text-xl lg:text-2xl">Tägliches Sudoku</h2>
                <p className="text-sm md:text-base lg:text-lg text-slate-600">
                  Ihr beide bekommt jeden Tag dasselbe Rätsel. Gewinne bringen 100 Punkte.
                </p>
              </div>
              <button
                onClick={() => loadDailyPuzzle({ navigate: true })}
                disabled={isLoadingPuzzle || !hasDailyPuzzle || isDailyCompleted}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-400 md:px-5 md:py-2.5 md:text-base lg:px-6 lg:py-3 lg:text-lg"
                style={{
                  backgroundColor: playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#53cd69' : '#0f172a'),
                } as React.CSSProperties}
              >
                <CalendarDays className="h-4 w-4 md:h-5 md:w-5" />
                {isLoadingPuzzle ? 'Lädt…' : isDailyCompleted ? 'Bereits abgeschlossen' : hasDailyPuzzle ? 'Heutiges Sudoku starten' : 'Noch nicht verfügbar'}
              </button>
            </div>
            <div className="mt-4 grid gap-3 p-4 text-sm sm:grid-cols-2 md:gap-4 md:p-5 md:text-base lg:gap-5 lg:p-6 lg:text-lg bg-slate-50">
              <div>
                <p className="text-xs uppercase tracking-wide md:text-sm text-slate-500">Datum</p>
                <p className="text-base font-semibold md:text-lg lg:text-xl text-slate-900">
                  {puzzleMeta.id && puzzleMeta.date === getLocalDateString() ? puzzleMeta.date : 'Noch nicht geladen'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide md:text-sm text-slate-500">Schwierigkeit</p>
                <p className="text-base font-semibold md:text-lg lg:text-xl text-slate-900">
                  {puzzleMeta.id && puzzleMeta.date === getLocalDateString() ? puzzleMeta.difficulty : '—'}
                </p>
              </div>
              {dailyStatusLabel !== 'Noch nicht gestartet' && (() => {
                const isToday = puzzleMeta.date === getLocalDateString();
                let progress: number | null = null;
                if (isToday && savedDailyProgress !== null) {
                  const progressData = savedDailyProgress!;
                  if (progressData.completionPercent > 0) {
                    progress = progressData.completionPercent;
                  }
                }
                return (
                  <div>
                    <p className="text-xs uppercase tracking-wide md:text-sm text-slate-500">Fortschritt</p>
                    <p className="text-base font-semibold md:text-lg lg:text-xl text-slate-900">
                      {progress !== null ? `${progress}%` : (isDailyMode ? formatTime(displayTime) : '0%')}
                    </p>
                  </div>
                );
              })()}
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wide md:text-sm text-slate-500">Status</p>
                <p className="text-base font-semibold md:text-lg lg:text-xl text-slate-900">
                  {hasDailyPuzzle ? 'Bereit zum Spielen' : 'Noch nicht veröffentlicht'}
                </p>
              </div>
            </div>
            <div className="mt-4 p-4 md:p-5 lg:p-6 bg-slate-50">
              <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide md:text-sm text-slate-500">Aktueller Stand</p>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold md:text-lg lg:text-xl text-slate-900">{dailyStatusLabel}</p>
                    {(gameState === 'won' || completionPercent === 100) && isDailyMode && (
                      <Trophy className="h-5 w-5 md:h-6 md:w-6" style={{ color: playerName === 'Sandy' ? '#d295bf' : '#fbbf24' } as React.CSSProperties} />
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide md:text-sm text-slate-500">Aktuelle Zeit</p>
                  <p className="text-sm font-semibold md:text-base lg:text-lg text-slate-900">
                    {dailyStatusLabel === 'Noch nicht gestartet' ? '—' : isDailyMode ? formatTime(displayTime) : (() => {
                      const isToday = puzzleMeta.date === getLocalDateString();
                      if (isToday && savedDailyProgress !== null) {
                        // savedDailyProgress is non-null here due to the check above
                        const progressData = savedDailyProgress!;
                        if (progressData.timerSeconds > 0) {
                          return formatTime(progressData.timerSeconds);
                        }
                      }
                      return '—';
                    })()}
                  </p>
                </div>
              </div>
              {isDailyMode && solvedBoard.length ? (
                <>
                  <div className="mt-4 md:mt-5 lg:mt-6">
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400 md:text-sm">
                      <span>Fortschritt</span>
                      <span>{completionPercent}%</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-200 md:h-2.5 lg:h-3">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ 
                          width: `${completionPercent}%`,
                          backgroundColor: playerName === 'Sandy' ? '#d295bf' : '#f59e0b',
                        } as React.CSSProperties}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500 md:text-sm lg:text-base">
                      {correctPlacements} / {totalPlacements || 0} Felder gelöst
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm md:text-base lg:text-lg">
                    <span className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Fehler</span>
                    <span className="flex items-center gap-1 font-semibold text-slate-900">
                      <XCircle className="h-3.5 w-3.5 text-rose-500 md:h-4 md:w-4 lg:h-5 lg:w-5" />
                      {mistakes}
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-slate-500 md:text-base lg:text-lg">
                  Starte das heutige Sudoku, um Fortschritt, Zeit und Fehler zu verfolgen.
                </p>
              )}
            </div>
            {puzzleError && (
              <p className="mt-3 bg-rose-50 px-3 py-2 text-sm text-rose-600 md:px-4 md:py-2.5 md:text-base lg:px-5 lg:py-3 lg:text-lg">{puzzleError}</p>
            )}
          </section>

          <section className="px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
            <h2 className="text-lg font-semibold md:text-xl lg:text-2xl">Heutige Ergebnisse</h2>
            {(() => {
              const today = getLocalDateString();
              
              // STRICT CHECK: Only show if puzzle date is exactly today
              if (puzzleMeta.date !== today || !puzzleMeta.id) {
                return null;
              }
              
              if (expectedPlayers.length === 0) {
                return (
                  <p className="mt-4 text-sm text-slate-500 md:text-base lg:text-lg">
                    Trage deinen Namen ein und erstelle ein Team, um eure Ergebnisse zu vergleichen.
                  </p>
                );
              }
              
              // Only use teamProgress if puzzle date is today - create filtered map
              const filteredTeamProgress = new Map<string, TeamProgressEntry>();
              if (puzzleMeta.date === today) {
                teamProgress.forEach((value, key) => {
                  filteredTeamProgress.set(key, value);
                });
              }
              
              // Check if there are any results or progress
              const hasAnyResults = expectedPlayers.some(name => {
                const normalized = name.trim().toLowerCase();
                return todaysResultMap.get(normalized) || filteredTeamProgress.get(normalized);
              });
              
              if (!hasAnyResults && !todayResultsLoading && !todayResultsError) {
                return null; // Don't show anything if no one has started
              }
              
              return (
                <div className="mt-4 space-y-3 md:space-y-4 lg:space-y-5">
                  {todayResultsLoading ? (
                    <p className="text-sm text-slate-500 md:text-base lg:text-lg">Lade Ergebnisse…</p>
                  ) : todayResultsError ? (
                    <p className="text-sm text-rose-500 md:text-base lg:text-lg">{todayResultsError}</p>
                  ) : (
                    expectedPlayers
                      .map((name) => {
                        const normalized = name.trim().toLowerCase();
                        const entry = todaysResultMap.get(normalized);
                        const progress = filteredTeamProgress.get(normalized);
                        
                        // Only show if there's an entry or progress
                        if (!entry && !progress) {
                          return null;
                        }
                        
                        return (
                          <div
                            key={name}
                            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:gap-3 md:px-5 md:py-4 lg:gap-4 lg:px-6 lg:py-5 bg-slate-50"
                          >
                            <div>
                              <p className="text-sm font-semibold md:text-base lg:text-lg text-slate-900">{name}</p>
                              {entry ? (
                                <p className="text-xs md:text-sm lg:text-base text-slate-600">
                                  Fertig in {entry.durationSeconds ? formatTime(entry.durationSeconds) : '—'} · Fehler{' '}
                                  {entry.mistakes ?? 0} · {entry.points ?? 0} Punkte
                                </p>
                              ) : progress ? (
                                <p className="text-xs md:text-sm lg:text-base text-slate-600">
                                  {progress.status} · {formatTime(progress.timerSeconds)} · {progress.completionPercent}% ·
                                  Fehler {progress.mistakes}
                                </p>
                              ) : null}
                            </div>
                            {entry && entry.submittedAt && (
                              <span className="text-xs md:text-sm lg:text-base text-slate-500">
                                {new Date(entry.submittedAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                          </div>
                        );
                      })
                      .filter(Boolean) // Remove null entries
                  )}
                </div>
              );
            })()}
              {teamProgressError && (
                <p className="mt-3 text-xs text-rose-500 md:text-sm lg:text-base">{teamProgressError}</p>
              )}
              {teamName && !teammateName && (
              <p className="mt-3 text-xs text-amber-600 md:text-sm lg:text-base">Dein Team ist noch nicht vollständig.</p>
            )}
          </section>

          <section className="px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
            <h2 className="text-lg font-semibold md:text-xl lg:text-2xl">Leaderboard</h2>
            {teamName && (
              <p className="mt-2 text-xs md:text-sm lg:text-base text-slate-600">Es werden nur die Spieler aus deinem Team angezeigt.</p>
            )}
            <div className="mt-4 md:mt-5 lg:mt-6">
              {leaderboardLoading ? (
                <p className="text-sm md:text-base lg:text-lg" style={{ color: playerName === 'Noe' ? '#ffffff' : '#64748b' } as React.CSSProperties}>Lädt Rangliste…</p>
              ) : leaderboardError ? (
                <p className="text-sm text-rose-500 md:text-base lg:text-lg">{leaderboardError}</p>
              ) : leaderboard.length === 0 ? (
                <p className="text-sm md:text-base lg:text-lg" style={{ color: playerName === 'Noe' ? '#ffffff' : '#64748b' } as React.CSSProperties}>
                  {teamName
                    ? 'Noch keine Einträge für euer Team – spielt zuerst ein tägliches Sudoku durch.'
                    : 'Noch keine Einträge – spielt zuerst ein tägliches Sudoku durch.'}
                </p>
              ) : (
                <ul className="space-y-3 md:space-y-4 lg:space-y-5">
                  {leaderboard.map((entry, index) => (
                    <li
                      key={entry.playerName}
                      className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 md:px-4 md:py-3 lg:px-5 lg:py-4"
                    >
                      <div>
                        <div className="flex items-center gap-2 md:gap-3">
                          <span className="text-sm font-semibold md:text-base lg:text-lg text-slate-600">#{index + 1}</span>
                          <span className="text-base font-semibold md:text-lg lg:text-xl text-slate-900">{entry.playerName}</span>
                        </div>
                        <p className="text-xs md:text-sm lg:text-base text-slate-600">
                          {entry.wins} Siege · Ø Zeit {formatTime(Math.round(entry.averageTime))} · Ø Fehler{' '}
                          {entry.averageMistakes.toFixed(1)}
                        </p>
                      </div>
                      <span className="text-lg font-bold md:text-xl lg:text-2xl text-amber-600">
                        {entry.points} P
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
            <h2 className="text-lg font-semibold md:text-xl lg:text-2xl">Deine Statistiken</h2>
            {!playerName.trim() ? (
              <p className="mt-2 text-sm text-slate-500 md:text-base lg:text-lg">Trage zuerst deinen Namen ein.</p>
            ) : !playerStats ? (
              <p className="mt-2 text-sm text-slate-500 md:text-base lg:text-lg">
                Noch keine Daten – löse ein Tagesrätsel, um Statistiken zu erhalten.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 md:gap-5 lg:gap-6">
                <div className="p-4 md:p-5 lg:p-6 bg-slate-50">
                  <p className="text-xs uppercase tracking-wide md:text-sm text-slate-500">Siege</p>
                  <p className="text-2xl font-semibold md:text-3xl lg:text-4xl text-slate-900">{playerStats!.wins}</p>
                </div>
                <div className="p-4 md:p-5 lg:p-6 bg-slate-50">
                  <p className="text-xs uppercase tracking-wide md:text-sm text-slate-500">Punkte</p>
                  <p className="text-2xl font-semibold md:text-3xl lg:text-4xl text-slate-900">{playerStats!.points}</p>
                </div>
                <div className="p-4 md:p-5 lg:p-6 bg-slate-50">
                  <p className="text-xs uppercase tracking-wide md:text-sm text-slate-500">Ø Zeit</p>
                  <p className="text-2xl font-semibold md:text-3xl lg:text-4xl text-slate-900">{formatTime(Math.round(playerStats!.averageTime))}</p>
                </div>
                <div className="p-4 md:p-5 lg:p-6 bg-slate-50">
                  <p className="text-xs uppercase tracking-wide md:text-sm text-slate-500">Ø Fehler</p>
                  <p className="text-2xl font-semibold md:text-3xl lg:text-4xl text-slate-900">{playerStats!.averageMistakes.toFixed(1)}</p>
                </div>
                <div className="p-4 sm:col-span-2 md:p-5 lg:p-6 bg-slate-50">
                  <p className="text-xs uppercase tracking-wide md:text-sm text-slate-500">Gesamtspiele</p>
                  <p className="text-2xl font-semibold md:text-3xl lg:text-4xl text-slate-900">{playerStats!.games}</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen w-full"
      style={{ 
        backgroundColor: playerName === 'Sandy' ? '#f7e1d7' : (playerName === 'Noe' ? '#282828' : '#dedbd2'),
        color: playerName === 'Noe' ? '#ffffff' : '#0f172a'
      } as React.CSSProperties}
    >
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-6 md:max-w-6xl md:gap-6 md:px-6 md:py-8 lg:max-w-7xl lg:gap-8 lg:px-8 lg:py-10">
        <section 
          className="px-4 py-4 md:px-6 md:py-5 lg:px-8 lg:py-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 md:gap-6">
            <div className="flex flex-col">
              <h1 className="text-xl font-semibold md:text-2xl lg:text-3xl" style={{ color: playerName === 'Noe' ? '#ffffff' : undefined } as React.CSSProperties}>Sudoku</h1>
              <span className="text-xs font-medium uppercase tracking-wide md:text-sm" style={{ color: playerName === 'Noe' ? '#94a3b8' : '#64748b' } as React.CSSProperties}>
                {selectedMode === 'Täglisches Sodoku' ? 'Tägliches Sudoku' : 
                 difficulty === 'Easy' ? 'Leicht' : 
                 difficulty === 'Medium' ? 'Mittel' : 
                 difficulty === 'Hard' ? 'Schwer' : 
                 difficulty === 'Beginner' ? 'Anfänger' : 
                 difficulty === 'Sandy' ? 'Sandy' : 
                 difficulty}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm md:gap-4 md:text-base lg:gap-5 lg:text-lg" style={{ color: playerName === 'Noe' ? '#ffffff' : '#475569' } as React.CSSProperties}>
              <span className="flex items-center gap-1">
                <Timer className="h-4 w-4 md:h-5 md:w-5" />
                {formatTime(displayTime)}
              </span>
              <span className="flex items-center gap-1">
                <XCircle className="h-4 w-4 md:h-5 md:w-5 text-rose-500" />
                {mistakes}
              </span>
              <button
                onClick={() => setView('menu')}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition md:px-4 md:py-1.5 md:text-sm lg:px-5 lg:py-2"
                style={{
                  borderColor: playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#53cd69' : '#94a3b8'),
                  color: playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#53cd69' : '#64748b'),
                  backgroundColor: playerName === 'Sandy' ? '#f7e1d7' : (playerName === 'Noe' ? '#3f3f3f' : '#dedbd2'),
                } as React.CSSProperties}
                onMouseEnter={(e) => {
                  e.currentTarget.style.setProperty('background-color', playerName === 'Sandy' ? '#f5e8f0' : (playerName === 'Noe' ? '#3f3f3f' : '#f1f5f9'), 'important');
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.setProperty('background-color', playerName === 'Sandy' ? '#f7e1d7' : (playerName === 'Noe' ? '#3f3f3f' : '#dedbd2'), 'important');
                }}
              >
                <Menu className="h-3.5 w-3.5 md:h-4 md:w-4" />
                Menü
              </button>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_380px] md:gap-6 lg:grid-cols-[1fr_420px] lg:gap-8">
          <section className="p-2 md:p-6 lg:p-8">
            {playerName === 'Sandy' ? (
              <div className="w-full aspect-square mx-auto rounded-2xl bg-slate-100 p-0 shadow-inner md:max-w-[min(95vw,1000px)] lg:max-w-[min(95vw,1100px)] overflow-hidden">
                <div className="grid h-full w-full grid-rows-9 grid-cols-9 gap-0">
                  {board.flatMap((row, r) =>
                    row.map((cell, c) => {
                      const isSelected = selected?.r === r && selected?.c === c;
                      const isRelated =
                        selected &&
                        !isSelected &&
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

                      // Bestimme welche Borders dicker sein sollen
                      const isEdgeRight = c === 8;
                      const isEdgeBottom = r === 8;
                      const isEdgeLeft = c === 0;
                      const isEdgeTop = r === 0;
                      const isBlockRight = (c + 1) % 3 === 0;
                      const isBlockBottom = (r + 1) % 3 === 0;
                      const isBlockLeft = c % 3 === 0;
                      const isBlockTop = r % 3 === 0;
                      
                      // Dicke Borders für Außenränder und Blockgrenzen
                      const hasThickRight = isBlockRight || isEdgeRight;
                      const hasThickBottom = isBlockBottom || isEdgeBottom;
                      const hasThickLeft = isBlockLeft || isEdgeLeft;
                      const hasThickTop = isBlockTop || isEdgeTop;

                      // Bestimme Border-Radius für Ecken (nur für Eck-Zellen)
                      // Die Border-Radius muss auf den äußeren Ecken sein und mit rounded-2xl (16px) übereinstimmen
                      const borderRadius = 
                        r === 0 && c === 0 ? '16px 0 0 0' :
                        r === 0 && c === 8 ? '0 16px 0 0' :
                        r === 8 && c === 0 ? '0 0 0 16px' :
                        r === 8 && c === 8 ? '0 0 16px 0' : '0';

                      return (
                        <button
                          key={`${r}-${c}`}
                          onClick={() => handleCellClick(r, c)}
                          className={`flex items-center justify-center text-xl font-semibold transition md:text-2xl lg:text-3xl ${
                            isSelected
                              ? ''
                              : matchesFocus || isSameValue
                              ? ''
                              : isRelated
                              ? ''
                              : 'text-slate-700'
                          } ${
                            feedbackState === 'correct'
                              ? 'animate-sudoku-pop'
                              : ''
                          } ${
                            feedbackState === 'wrong'
                              ? 'animate-sudoku-shake'
                              : ''
                          } ${
                            cell.isInitial ? 'font-bold text-slate-900' : 'font-semibold text-slate-500'
                          }`}
                          style={{
                            // Priorität 1: Fehlerzustände
                            ...(isError ? {
                              backgroundColor: '#dc2626',
                              color: '#ffffff',
                            } : feedbackState === 'wrong' ? {
                              backgroundColor: '#dc2626',
                              color: '#ffffff',
                            } : feedbackState === 'correct' ? {
                              backgroundColor: '#d1fae5',
                              color: '#065f46',
                            } : {}),
                            // Priorität 2: Sandy's matchesFocus/isSameValue UND isSelected - Gold (wenn das Feld eine Zahl hat)
                            ...((matchesFocus || isSameValue || (isSelected && board[r][c].value !== 0)) && !isError && !feedbackState ? {
                              backgroundColor: '#f5e8f0',
                              color: '#d4a55e',
                            } : {}),
                            // Priorität 4: Sandy's isSelected ohne Zahl - Grau
                            ...(isSelected && board[r][c].value === 0 && !isError && !feedbackState ? {
                              backgroundColor: '#e2e8f0',
                              color: '#475569',
                            } : {}),
                            // Priorität 6: Basis-Hintergrund (nur wenn keine speziellen Zustände)
                            ...((!isSelected && !matchesFocus && !isSameValue && !isError && !feedbackState && !cell.isInitial) ? {
                              backgroundColor: '#ffffff',
                              color: '#64748b',
                            } : {}),
                            // Priorität 3: Sandy's isRelated - Helles Lila mit 80% Deckkraft (ZUERST, damit vorgegebene Felder darüber liegen)
                            ...(isRelated && !matchesFocus && !isSameValue && !(isSelected && board[r][c].value !== 0) && !isError && !feedbackState ? {
                              backgroundColor: cell.isInitial ? 'rgba(245, 232, 240, 0.5)' : 'rgba(245, 232, 240, 0.8)',
                              color: '#475569',
                            } : {}),
                            // Priorität 5: Vorgegebene Felder hervorheben (NACH isRelated, überschreibt diese)
                            ...((!isSelected && !matchesFocus && !isSameValue && !isError && !feedbackState && cell.isInitial) ? {
                              backgroundColor: '#e2e8f0',
                              color: '#475569',
                            } : {}),
                            // Border-Radius für Ecken
                            borderRadius: borderRadius,
                            // Negative Margins für dicke Borders, damit sie über dünne Borders gehen
                            // ABER: Eck-Zellen haben keine negativen Margins nach außen
                            // Differenz zwischen dicken (5px) und dünnen (1px) Borders ist 4px
                            marginRight: (hasThickRight && !isEdgeRight) ? '-4px' : '0',
                            marginBottom: (hasThickBottom && !isEdgeBottom) ? '-4px' : '0',
                            marginLeft: (hasThickLeft && !isEdgeLeft) ? '-4px' : '0',
                            marginTop: (hasThickTop && !isEdgeTop) ? '-4px' : '0',
                            // Position und z-index für Layering (muss vor Borders kommen)
                            // Zellen mit dicken Borders bekommen höheren z-index, damit sie über dünne Borders liegen
                            position: 'relative',
                            zIndex: (hasThickRight || hasThickBottom || hasThickLeft || hasThickTop) ? 20 : 5,
                            // Borders: Dicke (5px) für Außenränder und Blockgrenzen, dünne (1px) für Zellgrenzen
                            // Sandy verwendet goldene Farben (#d4a55e für dick, #c1944d für dünn)
                            // Für Eck-Zellen: Nur die äußeren Borders sind dick, die inneren können dünn sein
                            borderRight: hasThickRight ? '5px solid #d4a55e' : '1px solid #c1944d',
                            borderBottom: hasThickBottom ? '5px solid #d4a55e' : '1px solid #c1944d',
                            borderLeft: hasThickLeft ? '5px solid #d4a55e' : '1px solid #c1944d',
                            borderTop: hasThickTop ? '5px solid #d4a55e' : '1px solid #c1944d',
                            // Overflow hidden für saubere Ecken
                            overflow: 'hidden',
                            // Box-sizing damit Borders innerhalb der Zelle bleiben
                            boxSizing: 'border-box',
                          } as React.CSSProperties}
                        >
                          {cell.value !== 0 ? (
                            cell.value
                          ) : (
                            <div className="grid h-full w-full grid-cols-3 grid-rows-3 text-[10px] md:text-xs lg:text-sm" style={{ color: '#94a3b8' } as React.CSSProperties}>
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
            ) : (
              <div className="w-full aspect-square mx-auto rounded-2xl border-3 bg-slate-100 p-0 shadow-inner md:max-w-[min(95vw,800px)] lg:max-w-[min(95vw,900px)] overflow-hidden" style={{ borderColor: playerName === 'Noe' ? '#8b8b8b' : '#475569', borderWidth: '4px', borderStyle: 'solid' } as React.CSSProperties}>
                <div className="grid h-full w-full grid-rows-9 grid-cols-9 gap-0">
                {board.flatMap((row, r) =>
                  row.map((cell, c) => {
                      const isSelected = selected?.r === r && selected?.c === c;
                      const isRelated =
                        selected &&
                        !isSelected &&
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
                        className={`flex items-center justify-center text-xl font-semibold transition-all duration-200 md:text-2xl lg:text-3xl ${
                          playerName === 'Sandy' ? 'rounded-lg' : (
                            // Abgerundete Ecken für die Eck-Zellen (nur für andere Spieler)
                            r === 0 && c === 0 ? 'rounded-tl-xl' :
                            r === 0 && c === 8 ? 'rounded-tr-xl' :
                            r === 8 && c === 0 ? 'rounded-bl-xl' :
                            r === 8 && c === 8 ? 'rounded-br-xl' : ''
                          )
                        } ${
                          isSelected
                            ? (playerName === 'Noe' ? '' : (playerName === 'Sandy' ? '' : 'bg-slate-200 text-slate-900 shadow-inner'))
                            : matchesFocus || isSameValue
                            ? (playerName === 'Sandy' ? '' : (playerName === 'Noe' ? '' : 'bg-amber-50 text-amber-900'))
                            : isRelated
                            ? (playerName === 'Noe' ? '' : (playerName === 'Sandy' ? '' : 'bg-slate-200/70 text-slate-600'))
                            : (playerName === 'Noe' ? '' : 'text-slate-700')
                        } ${
                          feedbackState === 'correct'
                            ? (playerName === 'Noe' ? 'animate-sudoku-pop' : 'animate-sudoku-pop bg-emerald-100 text-emerald-900')
                            : ''
                        } ${
                          feedbackState === 'wrong'
                            ? 'animate-sudoku-shake'
                            : ''
                        } ${
                          cell.isInitial ? (playerName === 'Noe' ? 'font-bold' : 'font-bold text-slate-900') : (playerName === 'Noe' ? 'font-semibold' : 'font-semibold text-slate-500')
                        }`}
                        style={{
                          // Priorität 1: Fehlerzustände
                          ...(isError ? {
                            backgroundColor: '#dc2626',
                            color: '#ffffff',
                            boxShadow: playerName === 'Sandy' ? '0 2px 8px rgba(220, 38, 38, 0.3)' : undefined,
                          } : feedbackState === 'wrong' ? {
                            backgroundColor: '#dc2626',
                            color: '#ffffff',
                            boxShadow: playerName === 'Sandy' ? '0 2px 8px rgba(220, 38, 38, 0.3)' : undefined,
                          } : feedbackState === 'correct' && playerName === 'Noe' ? {
                            color: '#ffffff',
                            backgroundColor: (!isSelected && !matchesFocus && !isSameValue && !isRelated) ? '#3f3f3f' : undefined,
                          } : {}),
                          // Priorität 2: Sandy's matchesFocus/isSameValue UND isSelected - Gold (wenn das Feld eine Zahl hat)
                          ...((matchesFocus || isSameValue || (isSelected && board[r][c].value !== 0)) && playerName === 'Sandy' && !isError && !feedbackState ? {
                            backgroundColor: '#f5e8f0',
                            color: '#d4a55e',
                            boxShadow: '0 4px 12px rgba(212, 165, 94, 0.25), 0 2px 4px rgba(212, 165, 94, 0.15)',
                            transform: 'scale(1.02)',
                          } : {}),
                          // Priorität 4: Sandy's isSelected ohne Zahl - Grau
                          ...(isSelected && playerName === 'Sandy' && board[r][c].value === 0 && !isError && !feedbackState ? {
                            backgroundColor: '#e2e8f0',
                            color: '#475569',
                            boxShadow: '0 2px 6px rgba(71, 85, 105, 0.15)',
                          } : {}),
                          // Priorität 5: isSelected für Noe
                          ...(isSelected && playerName === 'Noe' && !isError && !feedbackState ? {
                            backgroundColor: '#47ad5a',
                            color: '#ffffff',
                          } : {}),
                          // Priorität 6: matchesFocus/isSameValue für Noe (aber nicht wenn selected)
                          ...((matchesFocus || isSameValue) && playerName === 'Noe' && !isSelected && !isError && !feedbackState ? {
                            backgroundColor: '#47ad5a',
                            color: '#ffffff',
                          } : {}),
                          // Priorität 8: Basis-Hintergrund (nur wenn keine speziellen Zustände)
                          ...((!isSelected && !matchesFocus && !isSameValue && !isError && !feedbackState && !cell.isInitial) ? {
                            backgroundColor: playerName === 'Sandy' ? '#ffffff' : (playerName === 'Noe' ? '#3f3f3f' : '#dedbd2'),
                            color: playerName === 'Noe' ? '#ffffff' : (playerName === 'Sandy' ? '#475569' : undefined),
                            boxShadow: playerName === 'Sandy' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : undefined,
                          } : {}),
                          // Priorität 3: Sandy's isRelated - Helles Lila mit 80% Deckkraft (ZUERST, damit vorgegebene Felder darüber liegen)
                          ...(isRelated && playerName === 'Sandy' && !matchesFocus && !isSameValue && !(isSelected && board[r][c].value !== 0) && !isError && !feedbackState ? {
                            backgroundColor: cell.isInitial ? 'rgba(245, 232, 240, 0.5)' : 'rgba(245, 232, 240, 0.8)',
                            color: '#475569',
                            boxShadow: '0 2px 6px rgba(71, 85, 105, 0.15)',
                          } : {}),
                          // Priorität 9: isRelated für Noe - Hintergrundfarbe mit 80% Deckkraft (ZUERST, damit vorgegebene Felder darüber liegen)
                          ...(isRelated && playerName === 'Noe' && !isSelected && !isError && !feedbackState ? {
                            backgroundColor: cell.isInitial ? 'rgba(63, 63, 63, 0.5)' : 'rgba(63, 63, 63, 0.8)',
                            color: '#ffffff',
                          } : {}),
                          // Priorität 10: isRelated für andere Spieler - Hintergrundfarbe mit 80% Deckkraft (ZUERST, damit vorgegebene Felder darüber liegen)
                          ...(isRelated && playerName !== 'Sandy' && playerName !== 'Noe' && !isSelected && !matchesFocus && !isSameValue && !isError && !feedbackState ? {
                            backgroundColor: cell.isInitial ? 'rgba(222, 219, 210, 0.5)' : 'rgba(222, 219, 210, 0.8)',
                            color: undefined,
                          } : {}),
                          // Priorität 7: Vorgegebene Felder hervorheben (NACH isRelated, überschreibt diese)
                          ...((!isSelected && !matchesFocus && !isSameValue && !isError && !feedbackState && cell.isInitial) ? {
                            backgroundColor: playerName === 'Sandy' ? '#e2e8f0' : (playerName === 'Noe' ? '#2f733b' : '#e2e8f0'),
                            color: playerName === 'Noe' ? '#ffffff' : (playerName === 'Sandy' ? '#475569' : '#475569'),
                            boxShadow: playerName === 'Sandy' ? '0 2px 6px rgba(71, 85, 105, 0.15)' : undefined,
                          } : {}),
                          // Sandy: Keine Borders, sondern nur Schatten und Abstände
                          ...(playerName === 'Sandy' ? {
                            border: 'none',
                            margin: '0',
                            position: 'relative',
                            zIndex: 1,
                          } : {
                            // Negative Margins für dicke Borders, damit sie über dünne Borders gehen
                            marginRight: ((c + 1) % 3 === 0 || c === 8) ? '-3px' : '0',
                            marginBottom: ((r + 1) % 3 === 0 || r === 8) ? '-3px' : '0',
                            marginLeft: (c === 0 || (c % 3 === 0 && c !== 0)) ? '-3px' : '0',
                            marginTop: (r === 0 || (r % 3 === 0 && r !== 0)) ? '-3px' : '0',
                            // Position und z-index für Layering (muss vor Borders kommen)
                            // Zellen mit dicken Borders bekommen höheren z-index, damit sie über dünne Borders liegen
                            position: 'relative',
                            zIndex: ((c + 1) % 3 === 0 || c === 8 || c === 0 || (c % 3 === 0 && c !== 0)) || 
                                    ((r + 1) % 3 === 0 || r === 8 || r === 0 || (r % 3 === 0 && r !== 0)) ? 20 : 5,
                            // Vollständige Border-Logik: Jede Zelle bekommt ALLE ihre Borders
                            // Diese Borders müssen IMMER zuletzt gesetzt werden, damit sie nicht überschrieben werden
                            // Dicke Rahmen (4px) für Blockgrenzen und äußere Ränder, dünne Rahmen (1px) für Zellgrenzen
                            borderRight: ((c + 1) % 3 === 0 || c === 8) ? `4px solid ${playerName === 'Noe' ? '#8b8b8b' : '#64748b'}` : `1px solid ${playerName === 'Noe' ? '#8b8b8b' : '#94a3b8'}`,
                            borderBottom: ((r + 1) % 3 === 0 || r === 8) ? `4px solid ${playerName === 'Noe' ? '#8b8b8b' : '#64748b'}` : `1px solid ${playerName === 'Noe' ? '#8b8b8b' : '#94a3b8'}`,
                            borderLeft: (c === 0 || (c % 3 === 0 && c !== 0)) ? `4px solid ${playerName === 'Noe' ? '#8b8b8b' : '#64748b'}` : `1px solid ${playerName === 'Noe' ? '#8b8b8b' : '#94a3b8'}`,
                            borderTop: (r === 0 || (r % 3 === 0 && r !== 0)) ? `4px solid ${playerName === 'Noe' ? '#8b8b8b' : '#64748b'}` : `1px solid ${playerName === 'Noe' ? '#8b8b8b' : '#94a3b8'}`,
                            // Box-sizing damit Borders innerhalb der Zelle bleiben
                            boxSizing: 'border-box',
                            // Overflow hidden für saubere Ecken
                            overflow: 'hidden',
                          }),
                          
                        } as React.CSSProperties}
                      >
                        {cell.value !== 0 ? (
                          cell.value
                        ) : (
                          <div className="grid h-full w-full grid-cols-3 grid-rows-3 text-[10px] md:text-xs lg:text-sm" style={{ color: playerName === 'Noe' ? '#ffffff' : '#94a3b8' } as React.CSSProperties}>
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
            )}
          </section>

          <section className="p-2 md:p-5 md:sticky md:top-6 md:self-start lg:p-6">
          <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 md:gap-3 md:text-base lg:gap-4 lg:text-lg">
            <button
              className="flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 md:px-4 md:py-3 lg:px-5 lg:py-4"
              style={{
                borderColor: playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#53cd69' : (isNoteMode ? '#0f172a' : '#94a3b8')),
                color: playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#53cd69' : (isNoteMode ? '#0f172a' : '#64748b')),
                backgroundColor: isNoteMode ? (playerName === 'Sandy' ? '#f5e8f0' : (playerName === 'Noe' ? '#3f3f3f' : '#f8fafc')) : (playerName === 'Sandy' ? '#f7e1d7' : (playerName === 'Noe' ? '#3f3f3f' : '#dedbd2')),
              } as React.CSSProperties}
              onClick={() => setIsNoteMode((prev) => !prev)}
            >
              <Pencil className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" />
              <span>Notizen {isNoteMode ? 'an' : 'aus'}</span>
            </button>
            <button
              className="flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 md:px-4 md:py-3 lg:px-5 lg:py-4"
              style={{
                borderColor: playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#53cd69' : '#94a3b8'),
                color: playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#53cd69' : '#64748b'),
                backgroundColor: playerName === 'Sandy' ? '#f7e1d7' : (playerName === 'Noe' ? '#3f3f3f' : '#dedbd2'),
              } as React.CSSProperties}
              onClick={() => {
                if (history.length === 0) return;
                const previous = history[history.length - 1];
                setHistory((prev) => prev.slice(0, -1));
                setBoard(previous);
              }}
            >
              <Undo2 className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" />
              <span>Zurück</span>
            </button>
          </div>

          <div 
            className="mt-4 p-3 md:p-4 md:mt-5 lg:p-5 lg:mt-6 rounded-2xl"
            style={{ 
              backgroundColor: playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#575757' : '#dedbd2')
            } as React.CSSProperties}
          >
            <div className="grid grid-rows-2 gap-3 md:gap-4 lg:gap-5">
              {[ [1, 2, 3, 4, 5], [6, 7, 8, 9, 'erase'] ].map((rowNums, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2 md:gap-3 lg:gap-4">
                  {rowNums.map((entry) => {
                    if (entry === 'erase') {
                      return (
                        <button
                          key="erase"
                          onClick={handleErase}
                          className="rounded-lg py-3 shadow-sm transition hover:bg-slate-100 flex items-center justify-center md:py-4 lg:py-5"
                          style={{ backgroundColor: playerName === 'Sandy' ? '#f7e1d7' : (playerName === 'Noe' ? '#3f3f3f' : '#ffffff') } as React.CSSProperties}
                        >
                          <Eraser className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" style={{ color: playerName === 'Noe' ? '#53cd69' : '#334155' } as React.CSSProperties} />
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
                        className={`rounded-lg py-3 font-semibold shadow-sm transition md:py-4 lg:py-5 ${
                          !isAvailable
                            ? 'cursor-not-allowed opacity-50'
                            : isActive
                              ? 'text-white'
                              : 'text-slate-700 hover:bg-slate-100'
                        }`}
                        style={!isAvailable ? {
                          backgroundColor: playerName === 'Sandy' ? '#e5e7eb' : (playerName === 'Noe' ? '#2a2a2a' : '#e5e7eb'),
                          color: playerName === 'Sandy' ? '#9ca3af' : (playerName === 'Noe' ? '#6b7280' : '#9ca3af'),
                          textDecoration: 'line-through',
                          border: playerName === 'Noe' ? '2px solid #1a1a1a' : '1px solid #d1d5db',
                        } as React.CSSProperties : isActive ? {
                          backgroundColor: playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#53cd69' : '#0f172a'),
                          color: playerName === 'Noe' ? '#ffffff' : undefined,
                        } as React.CSSProperties : {
                          backgroundColor: playerName === 'Sandy' ? '#f7e1d7' : (playerName === 'Noe' ? '#3f3f3f' : '#dedbd2'),
                          color: playerName === 'Noe' ? '#ffffff' : undefined,
                        } as React.CSSProperties}
                      >
                        <span className={isNoteMode ? 'text-base md:text-lg lg:text-xl' : 'text-lg md:text-xl lg:text-2xl'}>{num}</span>
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
        </div>

        {gameState !== 'playing' && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{
              backgroundColor: playerName === 'Sandy' ? 'rgba(41, 39, 76, 0.5)' : 'rgba(15, 23, 42, 0.5)',
            } as React.CSSProperties}
          >
            <div 
              className="w-full max-w-sm space-y-4 rounded-2xl border p-6 text-center shadow-lg md:max-w-md md:space-y-5 md:p-8 lg:max-w-lg lg:space-y-6 lg:p-10"
              style={{ 
                backgroundColor: playerName === 'Noe' ? '#3f3f3f' : '#dedbd2',
                borderColor: playerName === 'Noe' ? '#3f3f3f' : '#e2e8f0',
                color: playerName === 'Noe' ? '#ffffff' : undefined
              } as React.CSSProperties}
            >
              {gameState === 'won' ? (
                <Trophy 
                  className="mx-auto h-12 w-12 md:h-16 md:w-16 lg:h-20 lg:w-20" 
                  style={{ color: playerName === 'Sandy' ? '#d295bf' : '#fbbf24' } as React.CSSProperties}
                />
              ) : (
                <X className="mx-auto h-12 w-12 text-rose-500 md:h-16 md:w-16 lg:h-20 lg:w-20" />
              )}
              <h2 className="text-xl font-semibold md:text-2xl lg:text-3xl">
                {gameState === 'won' ? 'Gut gemacht!' : 'Spiel vorbei'}
              </h2>
              <p className="text-sm text-slate-500 md:text-base lg:text-lg">
                {gameState === 'won' ? `Zeit: ${formatTime(displayTime)}` : 'Versuch es noch einmal.'}
              </p>
              <button
                onClick={() => startNewGame()}
                className="w-full rounded-xl py-2 text-white md:py-2.5 md:text-base lg:py-3 lg:text-lg"
                style={{
                  backgroundColor: playerName === 'Sandy' ? '#d4a55e' : (playerName === 'Noe' ? '#3f3f3f' : '#0f172a'),
                  color: playerName === 'Noe' ? '#53cd69' : undefined,
                } as React.CSSProperties}
              >
                Neues Spiel
              </button>
              {gameState === 'won' && (
                <button
                  onClick={() => {
                    setView('menu');
                    setGameState('playing');
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2 text-slate-700 md:py-2.5 md:text-base lg:py-3 lg:text-lg"
                  style={{
                    borderColor: playerName === 'Noe' ? '#3f3f3f' : '#e2e8f0',
                    color: playerName === 'Noe' ? '#ffffff' : '#334155'
                  } as React.CSSProperties}
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