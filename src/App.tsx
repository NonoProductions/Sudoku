import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  generateSudoku,
  type Board as BoardType,
  type Difficulty,
  type GameMode,
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

type TeamMember = {
  id: string;
  name: string | null;
};

type TeamProgressEntry = {
  playerName: string;
  timerSeconds: number;
  livesRemaining: number;
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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type FreePlayState = {
  board: Cell[][];
  solvedBoard: BoardType;
  difficulty: Difficulty;
  lives: number;
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

const App: React.FC = () => {
  const gameModes: GameMode[] = ['Beginner', 'Easy', 'Medium', 'Hard', 'Sandy', 'Täglisches Sodoku'];
  const [selectedMode, setSelectedMode] = useState<GameMode>('Medium');
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
  const [isNameLocked, setIsNameLocked] = useState(() => {
    const locked = localStorage.getItem('sudoku-name-locked');
    const savedName = localStorage.getItem('sudoku-player');
    return locked === 'true' || (savedName !== null && savedName.trim().length > 0);
  });
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
  const [teamName, setTeamName] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamProgress, setTeamProgress] = useState<Map<string, TeamProgressEntry>>(() => new Map());
  const [teamProgressError, setTeamProgressError] = useState<string | null>(null);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [player2NameInput, setPlayer2NameInput] = useState('');
  const [teamPlayerNames, setTeamPlayerNames] = useState<{ player1: string; player2: string } | null>(null);
  const [showTeamCreateForm, setShowTeamCreateForm] = useState(false);
  const [isPlayerInTeam, setIsPlayerInTeam] = useState(false);
  const attemptSubmittedRef = useRef(false);
  const boardRef = useRef<Cell[][]>([]);
  const currentPuzzleIdRef = useRef<string | null>(null);
  const isDailyModeRef = useRef(false);
  const gameStateRef = useRef<GameState>('playing');
  const timerRef = useRef(0);
  const livesRef = useRef(3);
  const completionPercentRef = useRef(0);
  const statusRef = useRef('Noch nicht gestartet');
  const teammateName = useMemo(() => {
    if (!teamMembers.length) return '';
    const teammate = teamMembers.find((member) => member.id !== profileId);
    return teammate?.name?.trim() ?? '';
  }, [teamMembers, profileId]);
  
  // WICHTIG: expectedPlayers sollte direkt aus teamPlayerNames kommen, 
  // da das die autoritative Quelle für die beiden Spielernamen im Team ist
  const expectedPlayers = useMemo(() => {
    // Wenn teamPlayerNames gesetzt ist, verwende diese (sind die autoritativen Namen)
    if (teamPlayerNames) {
      const players = [
        teamPlayerNames.player1.trim(),
        teamPlayerNames.player2.trim()
      ].filter((name) => name.length > 0);
      if (players.length === 2) {
        return players;
      }
    }
    // Fallback: Verwende playerName und teammateName (für Kompatibilität)
    return [playerName.trim(), teammateName.trim()].filter((name) => name.length > 0);
  }, [playerName, teammateName, teamPlayerNames]);
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
    livesRef.current = lives;
  }, [lives]);


  useEffect(() => {
    if (playerName && playerName.trim().length > 0) {
      localStorage.setItem('sudoku-player', playerName);
    }
  }, [playerName]);

  const syncProfileFromSupabase = useCallback(async () => {
    if (!profileId) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const { data, error } = await supabase
        .from('player_profiles')
        .select('player_name, team_name, team_player1, team_player2')
        .eq('id', profileId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        if (data.player_name) {
          setPlayerName(data.player_name);
          const teamNameValue = (data as { team_name?: string | null }).team_name;
          if (teamNameValue) {
            setTeamName(teamNameValue);
            setIsPlayerInTeam(true);
            setIsNameLocked(true);
            localStorage.setItem('sudoku-name-locked', 'true');
            const player1 = (data as { team_player1?: string | null }).team_player1;
            const player2 = (data as { team_player2?: string | null }).team_player2;
            if (player1 && player2) {
              setTeamPlayerNames({ player1, player2 });
            }
          } else {
            setIsPlayerInTeam(false);
          }
        }
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

  // Check if player name exists in a team and auto-login
  const checkPlayerInTeam = useCallback(async (name: string) => {
    if (!name.trim()) {
      setIsPlayerInTeam(false);
      return;
    }
    
    setTeamLoading(true);
    try {
      const trimmedName = name.trim();
      
      // First, check if player is already in a team (by player_name)
      const { data: profilesByName, error: nameError } = await supabase
        .from('player_profiles')
        .select('id, player_name, team_name, team_player1, team_player2')
        .eq('player_name', trimmedName);
      
      if (nameError) {
        // Check if it's a column error
        if (nameError.message?.includes('column') || nameError.message?.includes('does not exist')) {
          console.warn('Team-Spalten existieren möglicherweise nicht. Versuche alternative Abfrage...');
          setIsPlayerInTeam(false);
          setTeamError(null);
          setTeamLoading(false);
          return;
        }
        throw nameError;
      }
      
      // Check if player is listed as team_player1 or team_player2 in any team
      const { data: teamsWithPlayer, error: teamError } = await supabase
        .from('player_profiles')
        .select('id, team_name, team_player1, team_player2')
        .or(`team_player1.eq.${trimmedName},team_player2.eq.${trimmedName}`)
        .not('team_name', 'is', null);
      
      if (teamError) {
        console.error('Fehler beim Suchen nach Teams:', teamError);
        // Continue with name-based check
      }
      
      // Find the team this player belongs to
      let teamData: { team_name: string; team_player1: string; team_player2: string } | null = null;
      
      // First, check if player is already logged in with this name
      const existingProfile = profilesByName?.find(p => {
        const profile = p as { team_name?: string | null };
        return profile.team_name && profile.team_name.trim().length > 0;
      });
      
      if (existingProfile) {
        const profile = existingProfile as { team_name?: string | null; team_player1?: string | null; team_player2?: string | null };
        if (profile.team_name) {
          teamData = {
            team_name: profile.team_name,
            team_player1: profile.team_player1 || '',
            team_player2: profile.team_player2 || '',
          };
        }
      } else if (teamsWithPlayer && teamsWithPlayer.length > 0) {
        // Player is listed in a team but not yet logged in
        const team = teamsWithPlayer[0];
        const teamNameValue = (team as { team_name?: string | null }).team_name;
        const player1 = (team as { team_player1?: string | null }).team_player1 || '';
        const player2 = (team as { team_player2?: string | null }).team_player2 || '';
        
        if (teamNameValue) {
          teamData = {
            team_name: teamNameValue,
            team_player1: player1,
            team_player2: player2,
          };
        }
      }
      
      if (teamData && teamData.team_name) {
        // Player is in a team - check if already logged in from another device
        const { data: loggedIn, error: loggedInError } = await supabase
          .from('player_profiles')
          .select('id, player_name, team_name')
          .eq('team_name', teamData.team_name)
          .eq('player_name', trimmedName);
        
        if (loggedInError) {
          console.error('Fehler beim Prüfen der eingeloggten Spieler:', loggedInError);
          // Continue anyway
        } else if (loggedIn && loggedIn.length > 0) {
          const otherProfile = loggedIn.find(p => p.id !== profileId);
          if (otherProfile) {
            // Another profile is already using this name in this team
            setTeamError(`Der Spieler "${trimmedName}" ist bereits in diesem Team eingeloggt.`);
            setIsPlayerInTeam(true);
            setTeamLoading(false);
            return;
          }
        }
        
        // Auto-login to existing team
        const { error: upsertError } = await supabase.from('player_profiles').upsert(
          {
            id: profileId,
            player_name: trimmedName,
            team_name: teamData.team_name,
            team_player1: teamData.team_player1 || null,
            team_player2: teamData.team_player2 || null,
          },
          { onConflict: 'id' },
        );
        
        if (upsertError) {
          console.error('Fehler beim Speichern des Teams:', upsertError);
          throw upsertError;
        }
        
        setTeamName(teamData.team_name);
        if (teamData.team_player1 && teamData.team_player2) {
          setTeamPlayerNames({ player1: teamData.team_player1, player2: teamData.team_player2 });
        }
        setIsPlayerInTeam(true);
        setIsNameLocked(true);
        localStorage.setItem('sudoku-name-locked', 'true');
        setTeamError(null);
      } else {
        // Player not in any team - allow team creation
        setTeamName(null);
        setTeamPlayerNames(null);
        setIsPlayerInTeam(false);
        setTeamError(null);
      }
    } catch (err: any) {
      console.error('Fehler beim Prüfen des Spielernamens:', err);
      const errorMessage = err?.message || err?.error_description || err?.toString() || 'Unbekannter Fehler';
      
      // Check if it's a column error
      if (errorMessage.includes('column') || errorMessage.includes('does not exist') || errorMessage.includes('Could not find')) {
        setTeamError('Die Datenbankstruktur ist nicht korrekt. Bitte füge die Spalten team_name, team_player1 und team_player2 zur player_profiles Tabelle hinzu.');
      } else {
        setTeamError(`Fehler beim Prüfen des Spielernamens: ${errorMessage}`);
      }
      setIsPlayerInTeam(false);
    } finally {
      setTeamLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return;
    const timeout = window.setTimeout(async () => {
      if (playerName && playerName.trim().length > 0 && isNameLocked) {
        try {
          await supabase.from('player_profiles').upsert(
            {
              id: profileId,
              player_name: playerName.trim(),
              team_name: teamName || null,
              team_player1: teamPlayerNames?.player1 || null,
              team_player2: teamPlayerNames?.player2 || null,
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
  }, [playerName, profileId, teamName, teamPlayerNames, isNameLocked]);

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

  const handleCreateTeam = useCallback(async () => {
    const trimmedTeamName = teamNameInput.trim();
    const trimmedPlayer2 = player2NameInput.trim();
    const trimmedCurrentPlayer = playerName.trim();
    
    if (!trimmedTeamName) {
      setTeamError('Bitte gib einen Teamnamen ein.');
      return;
    }
    if (!trimmedPlayer2) {
      setTeamError('Bitte gib den Namen des zweiten Spielers ein.');
      return;
    }
    if (trimmedCurrentPlayer === trimmedPlayer2) {
      setTeamError('Die Spielernamen müssen unterschiedlich sein.');
      return;
    }
    if (!trimmedCurrentPlayer) {
      setTeamError('Bitte gib zuerst deinen Namen ein.');
      return;
    }
    
    setTeamError(null);
    setTeamLoading(true);
    try {
      // Check if team name already exists
      const { data: existingTeam, error: teamCheckError } = await supabase
        .from('player_profiles')
        .select('team_name')
        .eq('team_name', trimmedTeamName)
        .limit(1)
        .maybeSingle();
      
      if (teamCheckError) throw teamCheckError;
      
      if (existingTeam) {
        setTeamError(`Ein Team mit dem Namen "${trimmedTeamName}" existiert bereits.`);
        setTeamLoading(false);
        return;
      }
      
      // Check if player2 is already in a team
      const { data: existingPlayer2, error: checkError } = await supabase
        .from('player_profiles')
        .select('player_name, team_name')
        .eq('player_name', trimmedPlayer2)
        .not('team_name', 'is', null)
        .limit(1)
        .maybeSingle();
      
      if (checkError) throw checkError;
      
      if (existingPlayer2) {
        setTeamError(`Der Spieler "${trimmedPlayer2}" ist bereits in einem Team.`);
        setTeamLoading(false);
        return;
      }
      
      await supabase.from('player_profiles').upsert(
        {
          id: profileId,
          player_name: trimmedCurrentPlayer,
          team_name: trimmedTeamName,
          team_player1: trimmedCurrentPlayer,
          team_player2: trimmedPlayer2,
        },
        { onConflict: 'id' },
      );
      setTeamName(trimmedTeamName);
      setTeamPlayerNames({ player1: trimmedCurrentPlayer, player2: trimmedPlayer2 });
      setIsPlayerInTeam(true);
      setIsNameLocked(true);
      localStorage.setItem('sudoku-name-locked', 'true');
      setTeamNameInput('');
      setPlayer2NameInput('');
      setShowTeamCreateForm(false);
      setTeamError(null);
    } catch (err) {
      console.error(err);
      setTeamError('Team konnte nicht erstellt werden.');
    } finally {
      setTeamLoading(false);
    }
  }, [teamNameInput, player2NameInput, playerName, profileId]);


  const handleLeaveTeam = useCallback(async () => {
    if (!teamName) return;
    setTeamError(null);
    setTeamLoading(true);
    try {
      await supabase.from('player_profiles').upsert(
        {
          id: profileId,
          player_name: playerName.trim() || null,
          team_name: null,
          team_player1: null,
          team_player2: null,
        },
        { onConflict: 'id' },
      );
      setTeamName(null);
      setTeamMembers([]);
      setTeamPlayerNames(null);
      setIsPlayerInTeam(false);
      setShowTeamCreateForm(false);
    } catch (err) {
      console.error(err);
      setTeamError('Team konnte nicht verlassen werden.');
    } finally {
      setTeamLoading(false);
    }
  }, [playerName, profileId, teamName]);

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
        setLives(restoreState.lives);
        setTimer(restoreState.timer);
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
        setPuzzleMeta({
          id: null,
          date: null,
          difficulty: restoreState.difficulty,
        });
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

  const loadTeamProgress = useCallback(async () => {
    const targetPuzzleId = puzzleMeta.id;
    if (!targetPuzzleId || expectedPlayers.length === 0) {
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
        .select('player_name, timer_seconds, lives_remaining, completion_percent, status, updated_at')
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
          livesRemaining: row.lives_remaining ?? 0,
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

  const loadDailyPuzzle = useCallback(async (options?: { navigate?: boolean }) => {
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

      // Check if there's saved progress for this puzzle
      let savedProgress: { current_grid?: any; timer_seconds?: number; lives_remaining?: number; mistakes?: number } | null = null;
      if (playerName.trim()) {
        const { data: progressData, error: progressError } = await supabase
          .from('daily_progress')
          .select('current_grid, timer_seconds, lives_remaining, completion_percent, status')
          .eq('puzzle_id', puzzle.id)
          .eq('player_name', playerName.trim())
          .maybeSingle();
        
        if (progressError) {
          console.error('Error loading daily progress:', progressError);
          // Check if it's a column error
          if (progressError.message?.includes('column') || progressError.message?.includes('does not exist') || progressError.message?.includes('current_grid')) {
            console.error('FEHLER: Die Spalte "current_grid" existiert nicht in der daily_progress Tabelle. Bitte füge sie in Supabase hinzu (siehe SUPABASE_SETUP.md)');
          }
        } else if (progressData) {
          savedProgress = progressData;
        }
      }

      const shouldResumeExisting =
        boardRef.current.length > 0 &&
        currentPuzzleIdRef.current === puzzle.id &&
        isDailyModeRef.current &&
        gameStateRef.current === 'playing';

      if (shouldResumeExisting) {
        loadTodayResults(puzzle.id);
        if (options?.navigate) setView('game');
      } else if (savedProgress && savedProgress.current_grid) {
        // Restore saved progress
        setSelectedMode('Täglisches Sodoku');
        const restoredBoard = savedProgress.current_grid.map((row: any[]) =>
          row.map((cell: any) => ({
            value: cell.value,
            isInitial: cell.isInitial,
            notes: new Set(cell.notes || []),
          }))
        );
        
        setBoard(restoredBoard);
        setSolvedBoard(puzzle.solution_grid);
        setLives(savedProgress.lives_remaining ?? 3);
        setTimer(savedProgress.timer_seconds ?? 0);
        setGameState('playing');
        setSelected(null);
        setFocusValue(null);
        setCellFeedback({});
        setHistory([]);
        setMistakes(0);
        setIsDailyMode(true);
        setDifficulty(puzzle.difficulty ?? difficulty);
        setPuzzleMeta({
          id: puzzle.id,
          date: puzzle.puzzle_date,
          difficulty: puzzle.difficulty ?? difficulty,
        });
        attemptSubmittedRef.current = false;
        loadTodayResults(puzzle.id);
      } else {
        // Start fresh
        setSelectedMode('Täglisches Sodoku');
        applyPuzzleToState(puzzle.initial_grid, puzzle.solution_grid, {
          id: puzzle.id,
          mode: 'daily',
          date: puzzle.puzzle_date,
          difficulty: puzzle.difficulty ?? difficulty,
        });
        loadTodayResults(puzzle.id);
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
          lives,
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
        loadDailyPuzzle({ navigate: true });
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
    [isDailyMode, board, solvedBoard, difficulty, lives, timer, gameState, mistakes, history, selected, focusValue, cellFeedback, loadDailyPuzzle, applyPuzzleToState, startNewGame],
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

    const payload = {
      player_name: playerName.trim(), // WICHTIG: trim() hinzugefügt für Konsistenz
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
    // Timer runs for both modes, but only saved for daily mode
    if (gameState !== 'playing' || view === 'menu') return;
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
        lives,
        timer,
        gameState,
        mistakes,
        history,
        selected,
        focusValue,
        cellFeedback,
      });
    }
  }, [isDailyMode, board, solvedBoard, difficulty, lives, timer, gameState, mistakes, history, selected, focusValue, cellFeedback]);

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
    }
  }, [view, loadLeaderboard]);

  useEffect(() => {
    if (view === 'menu' && puzzleMeta.id) {
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
    }
  }, [view, puzzleMeta.id, loadTodayResults]);

  useEffect(() => {
    if (!puzzleMeta.id || expectedPlayers.length === 0) {
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
  }, [puzzleMeta.id, expectedPlayers, loadTeamProgress]);

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
  }, [completionPercent]);

  const dailyStatusLabel = useMemo(() => {
    if (!isDailyMode || !puzzleMeta.id) return 'Noch nicht gestartet';
    if (gameState === 'won') return 'Abgeschlossen';
    if (gameState === 'lost') return 'Aufgegeben';
    if (timer > 0) return 'In Bearbeitung';
    return 'Gestartet';
  }, [gameState, isDailyMode, puzzleMeta.id, timer]);

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
      
      const payload = {
        player_name: playerName.trim(),
        puzzle_id: puzzleMeta.id,
        timer_seconds: timer,
        lives_remaining: lives,
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
  }, [playerName, isDailyMode, puzzleMeta.id, solvedBoard.length, board, timer, lives, completionPercent, dailyStatusLabel]);

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
        
        const syncPayload = {
          player_name: playerName.trim(),
          puzzle_id: puzzleMeta.id,
          timer_seconds: timerRef.current,
          lives_remaining: livesRef.current,
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

  if (view === 'menu') {
    return (
      <div className="min-h-screen w-full bg-slate-50 text-slate-900">
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-6 md:max-w-5xl md:gap-8 md:px-6 md:py-8 lg:max-w-6xl lg:gap-10 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm md:px-6 md:py-6 lg:px-8 lg:py-8">
            <div className="flex flex-wrap items-center justify-between gap-4 md:gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 md:text-sm">Menü</p>
                <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl lg:text-4xl">Gemeinsames Sudoku</h1>
                <p className="mt-1 text-sm text-slate-500 md:text-base lg:text-lg">
                  Hier verwaltest du Namen, tägliche Rätsel und das Leaderboard.
                </p>
              </div>
              <button
                onClick={() => setView('game')}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 md:px-5 md:py-2.5 md:text-base lg:px-6 lg:py-3"
              >
                <Undo2 className="h-4 w-4 md:h-5 md:w-5" />
                Zurück zum Spiel
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm md:px-6 md:py-6 lg:px-8 lg:py-8">
            <div className="flex flex-col gap-5 md:gap-6 lg:gap-8">
              <div className="space-y-3 md:space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 md:text-xl lg:text-2xl">Spieler</h2>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dein Name</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={playerName}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setPlayerName(newName);
                        setTeamError(null);
                        // Reset team status when name changes
                        if (!isNameLocked) {
                          setIsPlayerInTeam(false);
                          setTeamName(null);
                          setTeamPlayerNames(null);
                        }
                      }}
                      onBlur={() => {
                        if (playerName.trim() && !isNameLocked) {
                          checkPlayerInTeam(playerName.trim());
                        }
                      }}
                      disabled={isNameLocked}
                      placeholder="Dein Name"
                      className={`flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 md:px-4 md:py-3.5 md:text-base lg:px-5 lg:py-4 lg:text-lg ${
                        isNameLocked ? 'bg-slate-100 cursor-not-allowed opacity-75' : ''
                      }`}
                    />
                    {isNameLocked && (
                      <button
                        onClick={() => {
                          setIsNameLocked(false);
                          localStorage.removeItem('sudoku-name-locked');
                          setTeamName(null);
                          setTeamPlayerNames(null);
                          setIsPlayerInTeam(false);
                        }}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white md:px-4 md:py-2.5 md:text-sm"
                      >
                        Ändern
                      </button>
                    )}
                  </div>
                  {teamLoading && !isNameLocked && playerName.trim() && (
                    <p className="text-xs text-slate-400">Prüfe Team-Status…</p>
                  )}
                </div>
                {profileLoading ? (
                  <p className="text-xs text-slate-400">Synchronisiere Profil…</p>
                ) : profileError ? (
                  <p className="text-xs text-rose-500">{profileError}</p>
                ) : (
                  <p className="text-xs text-emerald-600">Profil synchronisiert ✅</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:p-5 lg:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:text-sm">Team</p>
                    <p className="text-xs text-slate-500 md:text-sm lg:text-base">Maximal zwei Personen pro Team.</p>
                  </div>
                  {teamName && (
                    <button
                      onClick={handleLeaveTeam}
                      disabled={teamLoading}
                      className="text-xs font-semibold text-rose-600 transition hover:text-rose-500 disabled:opacity-60"
                    >
                      Team verlassen
                    </button>
                  )}
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
                      <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-3">
                        {/* Zeige beide Spieler aus teamPlayerNames an, wenn verfügbar */}
                        {teamPlayerNames ? (
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-semibold text-slate-900">
                                {teamPlayerNames.player1} {teamPlayerNames.player1.trim().toLowerCase() === playerName.trim().toLowerCase() ? '(Du)' : ''}
                              </span>
                              <span className="text-xs uppercase tracking-wide text-slate-400">
                                {teamPlayerNames.player1.trim().toLowerCase() === playerName.trim().toLowerCase() ? 'Du' : 'Partner'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-semibold text-slate-900">
                                {teamPlayerNames.player2} {teamPlayerNames.player2.trim().toLowerCase() === playerName.trim().toLowerCase() ? '(Du)' : ''}
                              </span>
                              <span className="text-xs uppercase tracking-wide text-slate-400">
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
                ) : !playerName.trim() ? (
                  <div className="mt-3">
                    <p className="text-xs text-slate-500">
                      Gib zuerst deinen Namen ein, um ein Team zu erstellen oder beizutreten.
                    </p>
                  </div>
                ) : teamLoading ? (
                  <div className="mt-3">
                    <p className="text-xs text-slate-400">Prüfe Team-Status…</p>
                  </div>
                ) : !isPlayerInTeam && playerName.trim() && !teamLoading ? (
                  <div className="mt-3 space-y-3">
                    {!showTeamCreateForm ? (
                      <>
                        <p className="text-xs text-slate-600">
                          Der Name "{playerName.trim()}" ist noch nicht in einem Team.
                        </p>
                        <button
                          onClick={() => setShowTeamCreateForm(true)}
                          disabled={teamLoading}
                          className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 md:px-5 md:py-2.5 md:text-base lg:px-6 lg:py-3 lg:text-lg"
                        >
                          Team erstellen
                        </button>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-slate-600">
                          Du bist: <span className="font-semibold">{playerName.trim()}</span>
                        </p>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Teamname
                          </label>
                          <input
                            type="text"
                            value={teamNameInput}
                            onChange={(e) => setTeamNameInput(e.target.value)}
                            placeholder="z.B. Team Alpha"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 md:px-4 md:py-2.5 md:text-base lg:px-5 lg:py-3 lg:text-lg"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Name des zweiten Spielers
                          </label>
                          <input
                            type="text"
                            value={player2NameInput}
                            onChange={(e) => setPlayer2NameInput(e.target.value)}
                            placeholder="Name des zweiten Spielers"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 md:px-4 md:py-2.5 md:text-base lg:px-5 lg:py-3 lg:text-lg"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setShowTeamCreateForm(false);
                              setTeamNameInput('');
                              setPlayer2NameInput('');
                              setTeamError(null);
                            }}
                            className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white md:px-5 md:py-2.5 md:text-base lg:px-6 lg:py-3 lg:text-lg"
                          >
                            Abbrechen
                          </button>
                          <button
                            onClick={handleCreateTeam}
                            disabled={teamLoading || !player2NameInput.trim() || !teamNameInput.trim()}
                            className="flex-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 md:px-5 md:py-2.5 md:text-base lg:px-6 lg:py-3 lg:text-lg"
                          >
                            {teamLoading ? 'Lädt…' : 'Erstellen'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm md:px-6 md:py-6 lg:px-8 lg:py-8">
            <div className="flex flex-wrap items-center justify-between gap-3 md:gap-4 lg:gap-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 md:text-xl lg:text-2xl">Tägliches Sudoku</h2>
                <p className="text-sm text-slate-500 md:text-base lg:text-lg">
                  Ihr beide bekommt jeden Tag dasselbe Rätsel. Gewinne bringen 100 Punkte.
                </p>
              </div>
              <button
                onClick={() => loadDailyPuzzle({ navigate: true })}
                disabled={isLoadingPuzzle || !hasDailyPuzzle}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-400 md:px-5 md:py-2.5 md:text-base lg:px-6 lg:py-3 lg:text-lg"
              >
                <CalendarDays className="h-4 w-4 md:h-5 md:w-5" />
                {isLoadingPuzzle ? 'Lädt…' : hasDailyPuzzle ? 'Heutiges Sudoku starten' : 'Noch nicht verfügbar'}
              </button>
            </div>
            <div className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2 md:gap-4 md:p-5 md:text-base lg:gap-5 lg:p-6 lg:text-lg">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Datum</p>
                <p className="text-base font-semibold text-slate-900 md:text-lg lg:text-xl">
                  {puzzleMeta.date ?? 'Noch nicht geladen'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Modus</p>
                <p className="text-base font-semibold text-slate-900 md:text-lg lg:text-xl">
                  {isDailyMode ? 'Aktives Tagesrätsel' : 'Freies Spiel'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Schwierigkeit</p>
                <p className="text-base font-semibold text-slate-900 md:text-lg lg:text-xl">{puzzleMeta.difficulty}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Fortschritt</p>
                <p className="text-base font-semibold text-slate-900 md:text-lg lg:text-xl">{formatTime(timer)}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Status</p>
                <p className="text-base font-semibold text-slate-900 md:text-lg lg:text-xl">
                  {hasDailyPuzzle ? 'Bereit zum Spielen' : 'Noch nicht veröffentlicht'}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4 md:p-5 lg:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Aktueller Stand</p>
                  <p className="text-base font-semibold text-slate-900 md:text-lg lg:text-xl">{dailyStatusLabel}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Aktuelle Zeit</p>
                  <p className="text-sm font-semibold text-slate-900 md:text-base lg:text-lg">{formatTime(timer)}</p>
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
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${completionPercent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500 md:text-sm lg:text-base">
                      {correctPlacements} / {totalPlacements || 0} Felder gelöst
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm md:text-base lg:text-lg">
                    <span className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Verbleibende Leben</span>
                    <span className="flex items-center gap-1 font-semibold text-slate-900">
                      <Heart className="h-3.5 w-3.5 text-rose-500 md:h-4 md:w-4 lg:h-5 lg:w-5" />
                      {lives}
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-slate-500 md:text-base lg:text-lg">
                  Starte das heutige Sudoku, um Fortschritt, Zeit und Leben zu verfolgen.
                </p>
              )}
            </div>
            {puzzleError && (
              <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 md:px-4 md:py-2.5 md:text-base lg:px-5 lg:py-3 lg:text-lg">{puzzleError}</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm md:px-6 md:py-6 lg:px-8 lg:py-8">
            <h2 className="text-lg font-semibold text-slate-900 md:text-xl lg:text-2xl">Heutige Ergebnisse</h2>
            <div className="mt-4 space-y-3 md:space-y-4 lg:space-y-5">
              {todayResultsLoading ? (
                <p className="text-sm text-slate-500 md:text-base lg:text-lg">Lade Ergebnisse…</p>
              ) : todayResultsError ? (
                <p className="text-sm text-rose-500 md:text-base lg:text-lg">{todayResultsError}</p>
              ) : expectedPlayers.length === 0 ? (
                <p className="text-sm text-slate-500 md:text-base lg:text-lg">
                  Trage deinen Namen ein und erstelle ein Team, um eure Ergebnisse zu vergleichen.
                </p>
              ) : (
                expectedPlayers.map((name) => {
                  const normalized = name.trim().toLowerCase();
                  const entry = todaysResultMap.get(normalized);
                  const progress = teamProgress.get(normalized);
                  return (
                    <div
                      key={name}
                      className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:gap-3 md:px-5 md:py-4 lg:gap-4 lg:px-6 lg:py-5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900 md:text-base lg:text-lg">{name}</p>
                        {entry ? (
                          <p className="text-xs text-slate-500 md:text-sm lg:text-base">
                            Fertig in {entry.durationSeconds ? formatTime(entry.durationSeconds) : '—'} · Fehler{' '}
                            {entry.mistakes ?? 0} · {entry.points ?? 0} Punkte
                          </p>
                        ) : progress ? (
                          <p className="text-xs text-slate-500 md:text-sm lg:text-base">
                            {progress.status} · {formatTime(progress.timerSeconds)} · {progress.completionPercent}% ·
                            Leben {progress.livesRemaining}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500 md:text-sm lg:text-base">Noch kein Ergebnis eingegangen</p>
                        )}
                      </div>
                      {entry && entry.submittedAt && (
                        <span className="text-xs text-slate-400 md:text-sm lg:text-base">
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
              {teamProgressError && (
                <p className="mt-3 text-xs text-rose-500 md:text-sm lg:text-base">{teamProgressError}</p>
              )}
              {teamName && !teammateName && (
              <p className="mt-3 text-xs text-amber-600 md:text-sm lg:text-base">Dein Team ist noch nicht vollständig.</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm md:px-6 md:py-6 lg:px-8 lg:py-8">
            <h2 className="text-lg font-semibold text-slate-900 md:text-xl lg:text-2xl">Leaderboard</h2>
            {teamName && (
              <p className="mt-2 text-xs text-slate-500 md:text-sm lg:text-base">Es werden nur die Spieler aus deinem Team angezeigt.</p>
            )}
            <div className="mt-4 md:mt-5 lg:mt-6">
              {leaderboardLoading ? (
                <p className="text-sm text-slate-500 md:text-base lg:text-lg">Lädt Rangliste…</p>
              ) : leaderboardError ? (
                <p className="text-sm text-rose-500 md:text-base lg:text-lg">{leaderboardError}</p>
              ) : leaderboard.length === 0 ? (
                <p className="text-sm text-slate-500 md:text-base lg:text-lg">
                  {teamName
                    ? 'Noch keine Einträge für euer Team – spielt zuerst ein tägliches Sudoku durch.'
                    : 'Noch keine Einträge – spielt zuerst ein tägliches Sudoku durch.'}
                </p>
              ) : (
                <ul className="space-y-3 md:space-y-4 lg:space-y-5">
                  {leaderboard.map((entry, index) => (
                    <li
                      key={entry.playerName}
                      className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 md:px-4 md:py-3 lg:px-5 lg:py-4"
                    >
                      <div>
                        <div className="flex items-center gap-2 md:gap-3">
                          <span className="text-sm font-semibold text-slate-500 md:text-base lg:text-lg">#{index + 1}</span>
                          <span className="text-base font-semibold text-slate-900 md:text-lg lg:text-xl">{entry.playerName}</span>
                        </div>
                        <p className="text-xs text-slate-500 md:text-sm lg:text-base">
                          {entry.wins} Siege · Ø Zeit {formatTime(Math.round(entry.averageTime))} · Ø Fehler{' '}
                          {entry.averageMistakes.toFixed(1)}
                        </p>
                      </div>
                      <span className="text-lg font-bold text-amber-600 md:text-xl lg:text-2xl">{entry.points} P</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm md:px-6 md:py-6 lg:px-8 lg:py-8">
            <h2 className="text-lg font-semibold text-slate-900 md:text-xl lg:text-2xl">Deine Statistiken</h2>
            {!playerName.trim() ? (
              <p className="mt-2 text-sm text-slate-500 md:text-base lg:text-lg">Trage zuerst deinen Namen ein.</p>
            ) : !playerStats ? (
              <p className="mt-2 text-sm text-slate-500 md:text-base lg:text-lg">
                Noch keine Daten – löse ein Tagesrätsel, um Statistiken zu erhalten.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 md:gap-5 lg:gap-6">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:p-5 lg:p-6">
                  <p className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Siege</p>
                  <p className="text-2xl font-semibold text-slate-900 md:text-3xl lg:text-4xl">{playerStats.wins}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:p-5 lg:p-6">
                  <p className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Punkte</p>
                  <p className="text-2xl font-semibold text-slate-900 md:text-3xl lg:text-4xl">{playerStats.points}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:p-5 lg:p-6">
                  <p className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Ø Zeit</p>
                  <p className="text-2xl font-semibold text-slate-900 md:text-3xl lg:text-4xl">{formatTime(Math.round(playerStats.averageTime))}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:p-5 lg:p-6">
                  <p className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Ø Fehler</p>
                  <p className="text-2xl font-semibold text-slate-900 md:text-3xl lg:text-4xl">{playerStats.averageMistakes.toFixed(1)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2 md:p-5 lg:p-6">
                  <p className="text-xs uppercase tracking-wide text-slate-400 md:text-sm">Gesamtspiele</p>
                  <p className="text-2xl font-semibold text-slate-900 md:text-3xl lg:text-4xl">{playerStats.games}</p>
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
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-6 md:max-w-6xl md:gap-6 md:px-6 md:py-8 lg:max-w-7xl lg:gap-8 lg:px-8 lg:py-10">
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm md:px-6 md:py-5 lg:px-8 lg:py-6">
          <div className="flex flex-wrap items-center justify-between gap-4 md:gap-6">
            <h1 className="text-xl font-semibold md:text-2xl lg:text-3xl">Sudoku</h1>
            <div className="flex items-center gap-3 text-sm text-slate-600 md:gap-4 md:text-base lg:gap-5 lg:text-lg">
              <span className="flex items-center gap-1">
                <Timer className="h-4 w-4 md:h-5 md:w-5" />
                {formatTime(timer)}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="h-4 w-4 text-rose-500 md:h-5 md:w-5" />
                {lives}
              </span>
              <button
                onClick={() => setView('menu')}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-50 md:px-4 md:py-1.5 md:text-sm lg:px-5 lg:py-2"
              >
                <Menu className="h-3.5 w-3.5 md:h-4 md:w-4" />
                Menü
              </button>
            </div>
          </div>
          <div className="mt-4">
            <button
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 md:px-4 md:py-2.5 md:text-base lg:px-5 lg:py-3 lg:text-lg"
              onClick={() => setShowDifficultyOptions((prev) => !prev)}
            >
              <span>Modus: {selectedMode === 'Täglisches Sodoku' ? 'Täglisches Sodoku' : `Schwierigkeit: ${difficulty}`}</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform md:h-5 md:w-5 lg:h-6 lg:w-6 ${showDifficultyOptions ? 'rotate-180' : ''}`}
              />
            </button>
            {showDifficultyOptions && (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-sm md:mt-3">
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

        <div className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_400px] md:gap-6 lg:grid-cols-[1fr_450px] lg:gap-8">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6 lg:p-8">
            <div className="w-full max-w-[min(90vw,520px)] aspect-square mx-auto rounded-2xl border-2 border-slate-300 bg-slate-100 p-1 shadow-inner md:max-w-full lg:max-w-full">
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
                        className={`flex items-center justify-center text-xl font-semibold transition md:text-2xl lg:text-3xl ${
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
                          <div className="grid h-full w-full grid-cols-3 grid-rows-3 text-[10px] text-slate-400 md:text-xs lg:text-sm">
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

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 md:sticky md:top-6 md:self-start lg:p-6">
          <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 md:gap-3 md:text-base lg:gap-4 lg:text-lg">
            <button
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 md:px-4 md:py-3 lg:px-5 lg:py-4 ${
                isNoteMode ? 'border-slate-900 text-slate-900' : 'border-slate-200 text-slate-500'
              }`}
              onClick={() => setIsNoteMode((prev) => !prev)}
            >
              <Pencil className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" />
              <span>Notizen {isNoteMode ? 'an' : 'aus'}</span>
            </button>
            <button
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2 md:px-4 md:py-3 lg:px-5 lg:py-4"
              onClick={() => {
                if (history.length === 0) return;
                const previous = history[history.length - 1];
                setHistory((prev) => prev.slice(0, -1));
                setBoard(previous);
              }}
            >
              <Undo2 className="h-5 w-5 text-slate-700 md:h-6 md:w-6 lg:h-7 lg:w-7" />
              <span>Zurück</span>
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:p-4 md:mt-5 lg:p-5 lg:mt-6">
            <div className="grid grid-rows-2 gap-3 md:gap-4 lg:gap-5">
              {[ [1, 2, 3, 4, 5], [6, 7, 8, 9, 'erase'] ].map((rowNums, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2 md:gap-3 lg:gap-4">
                  {rowNums.map((entry) => {
                    if (entry === 'erase') {
                      return (
                        <button
                          key="erase"
                          onClick={handleErase}
                          className="rounded-lg py-3 shadow-sm transition hover:bg-slate-100 bg-white flex items-center justify-center md:py-4 lg:py-5"
                        >
                          <Eraser className="h-5 w-5 text-slate-700 md:h-6 md:w-6 lg:h-7 lg:w-7" />
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
                            ? 'bg-slate-100 text-slate-400 line-through cursor-not-allowed'
                            : isActive
                              ? 'bg-slate-900 text-white'
                              : 'bg-white text-slate-700 hover:bg-slate-100'
                        }`}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
            <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg md:max-w-md md:space-y-5 md:p-8 lg:max-w-lg lg:space-y-6 lg:p-10">
              {gameState === 'won' ? (
                <Trophy className="mx-auto h-12 w-12 text-amber-400 md:h-16 md:w-16 lg:h-20 lg:w-20" />
              ) : (
                <X className="mx-auto h-12 w-12 text-rose-500 md:h-16 md:w-16 lg:h-20 lg:w-20" />
              )}
              <h2 className="text-xl font-semibold md:text-2xl lg:text-3xl">
                {gameState === 'won' ? 'Gut gemacht!' : 'Spiel vorbei'}
              </h2>
              <p className="text-sm text-slate-500 md:text-base lg:text-lg">
                {gameState === 'won' ? `Zeit: ${formatTime(timer)}` : 'Versuch es noch einmal.'}
              </p>
              <button
                onClick={() => startNewGame()}
                className="w-full rounded-xl bg-slate-900 py-2 text-white md:py-2.5 md:text-base lg:py-3 lg:text-lg"
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