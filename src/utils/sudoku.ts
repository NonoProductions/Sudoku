
export type Board = number[][];
export type Difficulty = 'Beginner' | 'Easy' | 'Medium' | 'Hard' | 'Sandy';

const BLANK = 0;

export const getEmptyBoard = (): Board => Array.from({ length: 9 }, () => Array(9).fill(BLANK));

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

const shuffle = (array: number[]) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
};

export const generateSudoku = (difficulty: Difficulty): { initial: Board; solved: Board } => {
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

  while (cluesToRemove > 0) {
    let row = Math.floor(Math.random() * 9);
    let col = Math.floor(Math.random() * 9);
    while (initial[row][col] === BLANK) {
      row = Math.floor(Math.random() * 9);
      col = Math.floor(Math.random() * 9);
    }
    initial[row][col] = BLANK;
    cluesToRemove--;
  }

  return { initial, solved };
};

export const checkWin = (board: Board, solved: Board): boolean => {
    for(let i=0; i<9; i++) {
        for(let j=0; j<9; j++) {
            if (board[i][j] !== solved[i][j]) return false;
        }
    }
    return true;
};

