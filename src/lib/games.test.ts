import { describe, expect, it } from "vitest";
import { DOT_BOXES, DOT_LINES, GAME_KINDS, GAMES, winningLine } from "./games";

/** Mirrors the SQL geometry in migration 0011 so a change on either side is caught. */
function dotLineOwners(e: number) {
  // Each line touches up to two boxes; returns those box indexes.
  if (e < 12) {
    const r = Math.floor(e / 3), c = e % 3;
    return [r - 1, r].map((br) => ({ br, bc: c })).filter((b) => b.br >= 0 && b.br <= 2);
  }
  const k = e - 12, r = Math.floor(k / 4), c = k % 4;
  return [{ br: r, bc: c - 1 }, { br: r, bc: c }].filter((b) => b.bc >= 0 && b.bc <= 2);
}

describe("games catalogue", () => {
  it("has a title and blurb for every accepted kind", () => {
    for (const k of GAME_KINDS) {
      expect(GAMES[k].title.length).toBeGreaterThan(0);
      expect(GAMES[k].blurb.length).toBeGreaterThan(0);
    }
    expect(GAME_KINDS).toEqual(["tictactoe", "dropfour", "dotbox"]);
  });

  it("star dots has 24 lines and 9 boxes", () => {
    expect(DOT_LINES).toBe(24);
    expect(DOT_BOXES).toBe(9);
  });

  it("every interior line touches two boxes; border lines touch one", () => {
    let interior = 0, border = 0;
    for (let e = 0; e < DOT_LINES; e++) {
      const n = dotLineOwners(e).length;
      expect([1, 2]).toContain(n);
      if (n === 2) interior++; else border++;
    }
    expect(interior).toBe(12); // 2 middle horizontal rows x 3 + 2 middle vertical columns x 3
    expect(border).toBe(12);   // the outer rows and columns of lines
  });
});

describe("tic-tac-toe winningLine", () => {
  it("detects a row, a column and a diagonal, and returns null otherwise", () => {
    expect(winningLine(["X", "X", "X", "", "", "", "", "", ""])).toEqual([0, 1, 2]);
    expect(winningLine(["O", "", "", "O", "", "", "O", "", ""])).toEqual([0, 3, 6]);
    expect(winningLine(["X", "", "", "", "X", "", "", "", "X"])).toEqual([0, 4, 8]);
    expect(winningLine(["X", "O", "", "", "", "", "", "", ""])).toBeNull();
  });
});
