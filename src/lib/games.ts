export type TttState = { board: string[]; marks: Record<string, "X" | "O"> };
export const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]] as const;
export function winningLine(board: string[]): readonly number[] | null {
  for (const l of WIN_LINES) {
    const [a, b, c] = l as unknown as [number, number, number];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return l;
  }
  return null;
}
