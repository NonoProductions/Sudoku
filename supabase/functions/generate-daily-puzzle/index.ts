// Supabase Edge Function: Generate Daily Puzzle
// This function generates a new daily Sudoku puzzle and inserts it into the database

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Types
type Board = number[][];
type Difficulty = 'Beginner' | 'Easy' | 'Medium' | 'Hard' | 'Sandy';

const BLANK = 0;

// Sudoku generation logic (ported from src/utils/sudoku.ts)
const getEmptyBoard = (): Board => Array.from({ length: 9 }, () => Array(9).fill(BLANK));

const isValid = (board: Board, row: number, col: number, num: number): boolean => {
  // Row
  for (let x = 0; x < 9; x++) {
    if (board[row][x] === num) return false;
  }

  // Column
  for (let x = 0; x < 9; x++) {
    if (board[x][col] === num) return false;
  }

  // 3x3 Box
  const startRow = Math.floor(row / 3) * 3;
  const startCol = Math.floor(col / 3) * 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (board[i + startRow][j + startCol] === num) return false;
    }
  }

  return true;
};

const solveBoard = (board: Board): boolean => {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === BLANK) {
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        shuffle(nums); // Randomize for generation
        for (const num of nums) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num;
            if (solveBoard(board)) return true;
            board[row][col] = BLANK;
          }
        }
        return false;
      }
    }
  }
  return true;
};

// Count the number of solutions to a puzzle (stops at 2 for efficiency)
const countSolutions = (board: Board, limit: number = 2): number => {
  let count = 0;
  
  const solve = (board: Board): void => {
    // If we've found enough solutions, stop
    if (count >= limit) return;
    
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (board[row][col] === BLANK) {
          for (let num = 1; num <= 9; num++) {
            if (isValid(board, row, col, num)) {
              board[row][col] = num;
              solve(board);
              board[row][col] = BLANK;
              if (count >= limit) return; // Stop early if we found enough solutions
            }
          }
          return; // No valid number found for this cell
        }
      }
    }
    // If we get here, the board is completely filled (a solution)
    count++;
  };
  
  solve(board);
  return count;
};

const shuffle = <T,>(array: T[]): void => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
};

const generateSudoku = (difficulty: Difficulty): { initial: Board; solved: Board } => {
  // 1. Create a full valid board
  const solved = getEmptyBoard();
  solveBoard(solved);
  
  // 2. Copy to create the puzzle
  const initial = solved.map(row => [...row]);
  
  // 3. Remove numbers based on difficulty
  // Better difficulty logic based on clues remaining
  let cluesToRemove = 0;
  switch (difficulty) {
    case 'Beginner': cluesToRemove = 15; break; // Very easy
    case 'Easy': cluesToRemove = 30; break;
    case 'Medium': cluesToRemove = 40; break;
    case 'Hard': cluesToRemove = 50; break;
    case 'Sandy': cluesToRemove = 60; break;
  }

  // Get all filled cells and shuffle them for random removal
  const filledCells: { row: number; col: number }[] = [];
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (initial[row][col] !== BLANK) {
        filledCells.push({ row, col });
      }
    }
  }
  shuffle(filledCells);

  let removed = 0;
  let attempts = 0;
  const maxAttempts = filledCells.length * 2; // Prevent infinite loops

  while (removed < cluesToRemove && attempts < maxAttempts) {
    attempts++;
    
    // Try to remove from shuffled list
    if (filledCells.length === 0) break;
    
    const cell = filledCells.pop()!;
    if (initial[cell.row][cell.col] === BLANK) continue;
    
    // Save the value before removing
    const savedValue = initial[cell.row][cell.col];
    initial[cell.row][cell.col] = BLANK;
    
    // Check if puzzle still has exactly one solution
    const testBoard = initial.map(row => [...row]);
    const solutionCount = countSolutions(testBoard, 2);
    
    if (solutionCount === 1) {
      // Valid removal - puzzle is still uniquely solvable
      removed++;
    } else {
      // Invalid removal - restore the value
      initial[cell.row][cell.col] = savedValue;
    }
  }

  return { initial, solved };
};

// Get today's date in YYYY-MM-DD format
const getTodayDateString = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

serve(async (req) => {
  const startTime = Date.now();
  console.log('=== Edge Function started ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  
  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('SUPABASE_URL exists:', !!supabaseUrl);
    console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!supabaseServiceKey);

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Missing Supabase configuration' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today's date
    const today = getTodayDateString();
    console.log('Today date:', today);

    // Check if puzzle for today already exists
    console.log('Checking for existing puzzle...');
    const { data: existingPuzzle, error: checkError } = await supabase
      .from('daily_puzzles')
      .select('id')
      .eq('puzzle_date', today)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error checking for existing puzzle:', checkError);
      return new Response(
        JSON.stringify({ error: 'Failed to check for existing puzzle', details: checkError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (existingPuzzle) {
      console.log('Puzzle for today already exists:', existingPuzzle.id);
      return new Response(
        JSON.stringify({ 
          message: 'Puzzle for today already exists',
          puzzle_id: existingPuzzle.id,
          date: today
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('No existing puzzle found, generating new one...');

    // Generate a new puzzle (using Medium difficulty for daily puzzles)
    const difficulty: Difficulty = 'Medium';
    console.log('Generating Sudoku puzzle with difficulty:', difficulty);
    const { initial, solved } = generateSudoku(difficulty);
    console.log('Puzzle generated successfully');

    // Insert the puzzle into the database
    console.log('Inserting puzzle into database...');
    const { data: newPuzzle, error: insertError } = await supabase
      .from('daily_puzzles')
      .insert({
        puzzle_date: today,
        initial_grid: initial,
        solution_grid: solved,
        difficulty: difficulty
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting puzzle:', insertError);
      console.error('Error details:', JSON.stringify(insertError, null, 2));
      return new Response(
        JSON.stringify({ error: 'Failed to insert puzzle', details: insertError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const duration = Date.now() - startTime;
    console.log('Puzzle created successfully:', newPuzzle.id);
    console.log('Execution time:', duration, 'ms');
    console.log('=== Edge Function completed ===');

    return new Response(
      JSON.stringify({
        message: 'Daily puzzle created successfully',
        puzzle_id: newPuzzle.id,
        date: today,
        difficulty: difficulty,
        execution_time_ms: duration
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Unexpected error:', error);
    console.error('Error stack:', error.stack);
    console.error('Execution time before error:', duration, 'ms');
    console.log('=== Edge Function failed ===');
    return new Response(
      JSON.stringify({ error: 'Unexpected error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
