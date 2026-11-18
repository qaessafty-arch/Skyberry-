export type TttState = { board: string[]; marks: Record<string, "X" | "O"> };
export const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]] as const;
export function winningLine(board: string[]): readonly number[] | null {
  for (const l of WIN_LINES) {
    const [a, b, c] = l as unknown as [number, number, number];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return l;
  }
  return null;
}

/** Every game the server accepts. Keep in sync with the kind check in migrations 0006 and 0011. */
export const GAME_KINDS = ["tictactoe", "dropfour", "dotbox"] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export const GAMES: Record<GameKind, { title: string; blurb: string }> = {
  tictactoe: { title: "Tic-Tac-Toe", blurb: "Three in a row before your friend does." },
  dropfour: { title: "Drop Four", blurb: "Drop discs into columns. First to connect four wins." },
  dotbox: { title: "Star Dots", blurb: "Draw lines between dots. Close a box to claim it and play again." },
};

/** Star Dots geometry: 4x4 dots, 24 lines, 9 boxes. Lines 0-11 are horizontal, 12-23 vertical. */
export const DOT_LINES = 24;
export const DOT_BOXES = 9;
