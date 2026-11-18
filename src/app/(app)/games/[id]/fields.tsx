"use client";
import type { ReactNode } from "react";

/** Playfields for each game. Each one only reports the move; the server decides if it is legal. */

type FieldProps = { board: string[]; disabled: boolean; onPlay: (index: number) => void };

export function TicTacToeField({ board, disabled, onPlay, winLine }: FieldProps & { winLine: readonly number[] | null }) {
  return (
    <div role="grid" aria-label="Game board" className="card grid grid-cols-3 gap-2.5 p-3">
      {board.map((v, i) => (
        <button key={i} role="gridcell" disabled={disabled || v !== ""} onClick={() => onPlay(i)} aria-label={`Cell ${i + 1}${v ? `, ${v}` : ", empty"}`}
          className={`grid aspect-square place-items-center rounded-[18px] border border-line bg-surface2 text-5xl font-extrabold transition-colors enabled:hover:border-sky enabled:hover:bg-white ${winLine?.includes(i) ? "!border-sky !bg-ice" : ""} ${v === "X" ? "text-brandt" : "text-[#4757c9]"}`}>{v}</button>
      ))}
    </div>
  );
}

/** Drop Four: 7 columns, 6 rows. Board index = row * 7 + column, row 0 at the bottom. */
export function DropFourField({ board, disabled, onPlay }: FieldProps) {
  const cols = Array.from({ length: 7 }, (_, c) => c);
  const rows = Array.from({ length: 6 }, (_, r) => 5 - r); // draw the top row first
  return (
    <div role="grid" aria-label="Drop Four board" className="card grid gap-1.5 p-3">
      <div className="grid grid-cols-7 gap-1.5">
        {cols.map((c) => (
          <button key={c} disabled={disabled || board[5 * 7 + c] !== ""} onClick={() => onPlay(c)} aria-label={`Drop in column ${c + 1}`}
            className="grid h-8 place-items-center rounded-[10px] text-brandt transition-colors enabled:hover:bg-ice disabled:opacity-30">↓</button>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r} role="row" className="grid grid-cols-7 gap-1.5">
          {cols.map((c) => {
            const v = board[r * 7 + c] ?? "";
            return (
              <span key={c} role="gridcell" aria-label={`Row ${r + 1}, column ${c + 1}${v ? `, ${v === "X" ? "first player" : "second player"}` : ", empty"}`}
                className={`aspect-square rounded-full border border-line ${v === "X" ? "bg-brand" : v === "O" ? "bg-warm" : "bg-surface2"}`} />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Star Dots: 4x4 dots joined by 24 lines; 9 boxes. A 7x7 layout interleaves dots (even, even),
 * horizontal lines (even row, odd col), vertical lines (odd row, even col) and boxes (odd, odd).
 */
export function DotBoxField({ board, boxes, disabled, onPlay }: FieldProps & { boxes: string[] }) {
  const cells: ReactNode[] = [];
  for (let rr = 0; rr < 7; rr++) {
    for (let cc = 0; cc < 7; cc++) {
      const key = `${rr}-${cc}`;
      if (rr % 2 === 0 && cc % 2 === 0) {
        cells.push(<span key={key} aria-hidden className="grid place-items-center"><span className="size-2.5 rounded-full bg-ink" /></span>);
      } else if (rr % 2 === 0) {
        const idx = (rr / 2) * 3 + (cc - 1) / 2; // horizontal line
        const v = board[idx] ?? "";
        cells.push(
          <button key={key} disabled={disabled || v !== ""} onClick={() => onPlay(idx)} aria-label={`Horizontal line ${idx + 1}${v ? ", drawn" : ", open"}`}
            className={`h-2.5 rounded-full transition-colors ${v === "X" ? "bg-brand" : v === "O" ? "bg-warm" : "bg-line enabled:hover:bg-sky"}`} />,
        );
      } else if (cc % 2 === 0) {
        const idx = 12 + ((rr - 1) / 2) * 4 + cc / 2; // vertical line
        const v = board[idx] ?? "";
        cells.push(
          <button key={key} disabled={disabled || v !== ""} onClick={() => onPlay(idx)} aria-label={`Vertical line ${idx - 11}${v ? ", drawn" : ", open"}`}
            className={`w-2.5 justify-self-center rounded-full transition-colors ${v === "X" ? "bg-brand" : v === "O" ? "bg-warm" : "bg-line enabled:hover:bg-sky"}`} style={{ height: "100%" }} />,
        );
      } else {
        const idx = 3 * ((rr - 1) / 2) + (cc - 1) / 2; // box
        const owner = boxes[idx] ?? "";
        cells.push(
          <span key={key} aria-label={owner ? `Box ${idx + 1}, claimed by ${owner === "X" ? "first" : "second"} player` : undefined}
            className={`grid place-items-center rounded-[6px] text-sm font-extrabold ${owner === "X" ? "bg-brand/15 text-brandt" : owner === "O" ? "bg-warm/20 text-[#8a5a00]" : ""}`}>{owner}</span>,
        );
      }
    }
  }
  return (
    <div role="group" aria-label="Star Dots board" className="card p-3">
      <div className="grid aspect-square grid-cols-7 grid-rows-7 gap-1 sm:gap-1.5" style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}>{cells}</div>
    </div>
  );
}
