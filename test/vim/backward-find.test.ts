import { describe, expect, it } from "bun:test";
import { createVimState, handleNormalKey, type PromptAccess } from "../../src/vim";
import { deleteRanges, ev, saveUndoSnapshots } from "../support";

describe("backward character-find operator endpoints", () => {
  for (const op of ["d", "c", "y"] as const) {
    for (const motion of ["F", ";", ",", "till-repeat"] as const) {
      for (const count of [1, 2] as const) {
        it(`${op}${count === 2 ? "2" : ""}${motion} includes the destination and excludes the original cursor`, () => {
          const text = "axbxcdez";
          const offset = 7;
          const prompt: PromptAccess = {
            getLine: () => text,
            getLineCount: () => 1,
            getCursorLine: () => 0,
            getCursorOffset: () => offset,
            getPlainText: () => text,
          };
          const state = createVimState();
          state.mode = "normal";
          state.lastFind = {
            char: "x",
            direction: motion === ";" ? "backward" : "forward",
            ...(motion === "till-repeat" ? { till: true } : {}),
          };
          const press = (key: string) => handleNormalKey(state, key, ev(key), prompt);
          press(op);
          if (count === 2) press("2");
          let result = press(motion === "till-repeat" ? "," : motion);
          if (motion === "F") result = press("x");
          const ranges = {
            1: { find: [3, "xcde", "axbz"], till: [4, "cde", "axbxz"] },
            2: { find: [1, "xbxcde", "az"], till: [2, "bxcde", "axz"] },
          } as const;
          const [start, expected, remaining] = ranges[count][motion === "till-repeat" ? "till" : "find"];
          if (op === "y") {
            expect(result.actions).toEqual([
              { type: "yank", text: expected },
              { type: "cursorTo", offset: start },
            ]);
            expect(state.yankRegister).toBe(expected);
            expect(state.mode).toBe("normal");
          } else {
            expect(deleteRanges(result.actions)).toEqual([{ start, end: 6 }]);
            const range = deleteRanges(result.actions)[0];
            expect(text.slice(0, range.start) + text.slice(range.end + 1)).toBe(remaining);
            expect(saveUndoSnapshots(result.actions)).toHaveLength(1);
            expect(state.mode).toBe(op === "c" ? "insert" : "normal");
          }
          expect(state.pending).toEqual({ kind: "none" });
          expect(state.count).toBe(0);
        });
      }
    }
  }

  for (const value of ["xz", "x\nz", "abz"]) {
    it(`handles an adjacent match or a failed search in ${JSON.stringify(value)}`, () => {
      const state = createVimState();
      state.mode = "normal";
      const prompt: PromptAccess = {
        getLine: (n) => value.split("\n")[n] ?? "",
        getLineCount: () => value.split("\n").length,
        getCursorLine: () => value.split("\n").length - 1,
        getCursorOffset: () => value.length - 1,
        getPlainText: () => value,
      };
      const press = (key: string) => handleNormalKey(state, key, ev(key), prompt);
      press("d");
      press("F");
      const result = press("x");
      expect(deleteRanges(result.actions)).toEqual(value === "xz" ? [{ start: 0, end: 0 }] : []);
      expect(saveUndoSnapshots(result.actions)).toHaveLength(value === "xz" ? 1 : 0);
      expect(state.pending).toEqual({ kind: "none" });
    });
  }
});
