import { beforeEach, describe, expect, it } from "bun:test";
import {
  createVimState,
  finishOneShotIfComplete,
  handleNormalKey,
  handleVisualKey,
  type PromptAccess,
  type VimState,
} from "../../src/vim";
import { findChar, firstNonBlank } from "../../src/vim/text";
import { cursorTos, deleteRanges, ev, saveUndoSnapshots, selectRanges } from "../support";

let state: VimState;
let text: string;
let cursor: number;
const prompt: PromptAccess = {
  getLine: (n) => text.split("\n")[n] ?? "",
  getLineCount: () => text.split("\n").length,
  getCursorLine: () => text.slice(0, cursor).split("\n").length - 1,
  getCursorOffset: () => cursor,
  getPlainText: () => text,
};

beforeEach(() => {
  state = createVimState();
  state.mode = "normal";
  text = "xaxbxcx";
  cursor = 0;
});

function press(key: string) {
  const handler = state.mode === "visual" ? handleVisualKey : handleNormalKey;
  const result = handler(state, key, ev(key), prompt);
  finishOneShotIfComplete(state, result);
  for (const offset of cursorTos(result.actions)) cursor = offset;
  return result;
}

describe("character-find algorithms", () => {
  it("initializes without a remembered find", () => {
    expect(state.lastFind).toBeNull();
  });
  it("finds counted occurrences without matching under the cursor", () => {
    expect(findChar("abacad", 0, "a", "forward")).toBe(2);
    expect(findChar("abacad", 5, "a", "backward")).toBe(4);
    expect(findChar("abacad", 0, "a", "forward", 2)).toBe(4);
    expect(findChar("abacad", 5, "a", "backward", 2)).toBe(2);
  });
  it("does not cross lines, match newlines or accept absent/invalid characters", () => {
    expect(findChar("abc\ndef", 2, "d", "forward")).toBeNull();
    expect(findChar("abc\ndef", 4, "c", "backward")).toBeNull();
    expect(findChar("abc\ndef", 0, "\n", "forward")).toBeNull();
    expect(findChar("abc", 0, "z", "forward")).toBeNull();
    expect(findChar("abc", 0, "return", "forward")).toBeNull();
    expect(findChar("", 0, "a", "forward")).toBeNull();
  });
  it("cannot repeat the first character backwards at column zero", () => {
    expect(findChar("abc", 0, "a", "backward")).toBeNull();
    expect(findChar("abacad", 5, "a", "backward", 4)).toBeNull();
  });
  it("finds first nonblank or the start of an empty/blank line", () => {
    expect(firstNonBlank("first\n \tsecond", 12)).toBe(8);
    expect(firstNonBlank("first\n\nthird", 6)).toBe(6);
    expect(firstNonBlank("first\n   \nthird", 8)).toBe(6);
    expect(firstNonBlank("first\n", 6)).toBe(6);
    expect(firstNonBlank("", 0)).toBe(0);
    expect(firstNonBlank("\nsecond", 0)).toBe(0);
  });
});

describe("normal character finds", () => {
  it("waits for the character, moves and clears pending state", () => {
    expect(press("f").actions).toEqual([]);
    expect(state.pending).toEqual({ kind: "find", direction: "forward", op: undefined });
    expect(cursorTos(press("x").actions)).toEqual([2]);
    expect(state.pending).toEqual({ kind: "none" });
  });
  it("supports forward/backward counts and remembers direction", () => {
    press("2");
    press("f");
    press("x");
    expect(cursor).toBe(4);
    press("F");
    press("x");
    expect(cursor).toBe(2);
    expect(state.lastFind).toEqual({ char: "x", direction: "backward" });
  });
  for (const [key, char] of [
    ["space", " "],
    ["tab", "\t"],
    ["2", "2"],
    [";", ";"],
    [",", ","],
  ]) {
    it(`accepts ${key} as a character argument rather than a command`, () => {
      text = `a${char}b`;
      press("f");
      expect(cursorTos(press(key).actions)).toEqual([1]);
    });
  }
  it("clears operator/count on failure and remembers the attempted find", () => {
    press("d");
    press("3");
    press("f");
    expect(press("z").actions).toEqual([]);
    expect(state.pending).toEqual({ kind: "none" });
    expect(state.count).toBe(0);
    expect(state.lastFind).toEqual({ char: "z", direction: "forward" });
  });
  it("cancels a pending find without replacing the last find", () => {
    state.lastFind = { char: "x", direction: "backward" };
    press("d");
    press("2");
    press("f");
    press("escape");
    expect(state.pending).toEqual({ kind: "none" });
    expect(state.count).toBe(0);
    expect(state.lastFind).toEqual({ char: "x", direction: "backward" });
  });
  it("repeats, reverses without changing direction, then resumes forward", () => {
    press("f");
    press("x");
    expect(cursorTos(press(";").actions)).toEqual([4]);
    expect(cursorTos(press(",").actions)).toEqual([2]);
    expect(state.lastFind).toEqual({ char: "x", direction: "forward" });
    expect(cursorTos(press(";").actions)).toEqual([4]);
  });
  it("repeats backward finds", () => {
    cursor = 6;
    press("F");
    press("x");
    expect(cursorTos(press(";").actions)).toEqual([2]);
  });
  it("supports counted repeat and preserves the remembered find on failure", () => {
    press("f");
    press("x");
    press("2");
    expect(cursorTos(press(";").actions)).toEqual([6]);
    expect(press(";").actions).toEqual([]);
    expect(state.lastFind).toEqual({ char: "x", direction: "forward" });
  });
  it("a repeat without history cancels a pending operator", () => {
    press("d");
    press("2");
    expect(press(";").actions).toEqual([]);
    expect(state.pending).toEqual({ kind: "none" });
    expect(state.count).toBe(0);
  });
  it("an unsuccessful explicit find replaces the remembered find", () => {
    press("f");
    press("x");
    press("f");
    press("z");
    expect(state.lastFind).toEqual({ char: "z", direction: "forward" });
  });
  for (const op of ["d", "c", "y"] as const) {
    for (const motion of ["f", "F", ";", ","] as const) {
      it(`${op}${motion} uses Vim's inclusive-forward/exclusive-backward ranges`, () => {
        text = "abxcdzexh";
        cursor = 5;
        state.lastFind = { char: "x", direction: "forward" };
        press(op);
        let result = press(motion);
        if (motion === "f" || motion === "F") result = press("x");
        const range = motion === "F" || motion === "," ? { start: 2, end: 4 } : { start: 5, end: 7 };
        if (op === "y") {
          expect(state.yankRegister).toBe(text.slice(range.start, range.end + 1));
          expect(result.actions).toEqual([
            { type: "yank", text: state.yankRegister },
            ...(motion === "F" || motion === "," ? [{ type: "cursorTo", offset: range.start }] : []),
          ]);
        } else {
          expect(deleteRanges(result.actions)).toEqual([range]);
          expect(saveUndoSnapshots(result.actions)).toHaveLength(1);
          expect(state.mode).toBe(op === "c" ? "insert" : "normal");
        }
        expect(state.pending).toEqual({ kind: "none" });
      });
    }
  }
  for (const motion of ["f", ";"]) {
    it(`supports d2${motion}`, () => {
      state.lastFind = { char: "x", direction: "forward" };
      press("d");
      press("2");
      let result = press(motion);
      if (motion === "f") result = press("x");
      expect(deleteRanges(result.actions)).toEqual([{ start: 0, end: 4 }]);
    });
  }
  it("holds one-shot normal until the character argument completes", () => {
    state.oneShotNormal = true;
    press("f");
    expect(state.mode).toBe("normal");
    const result = press("x");
    expect(cursor).toBe(2);
    expect(state.mode).toBe("insert");
    expect(state.oneShotNormal).toBe(false);
    expect(result.actions).toContainEqual({ type: "mode", mode: "insert" });
  });
  it("returns from a one-shot repeat", () => {
    state.oneShotNormal = true;
    state.lastFind = { char: "x", direction: "forward" };
    press(";");
    expect(cursor).toBe(2);
    expect(state.mode).toBe("insert");
    expect(state.oneShotNormal).toBe(false);
  });
  for (const [value, offset, target] of [
    ["  hello", 6, 2],
    ["first\n\nthird", 6, 6],
  ] as const) {
    it(`I enters insert at ${target} in ${JSON.stringify(value)}`, () => {
      text = value;
      cursor = offset;
      const result = press("I");
      expect(cursor).toBe(target);
      expect(state.mode).toBe("insert");
      expect(result.actions).toContainEqual({ type: "mode", mode: "insert" });
    });
  }
});

describe("visual character finds", () => {
  beforeEach(() => {
    state.mode = "visual";
    state.visualAnchor = 0;
  });
  it("finds forward, repeats and reverses while keeping the anchor", () => {
    press("f");
    expect(selectRanges(press("x").actions)).toEqual([{ start: 0, end: 2 }]);
    expect(selectRanges(press(";").actions)).toEqual([{ start: 0, end: 4 }]);
    expect(selectRanges(press(",").actions)).toEqual([{ start: 0, end: 2 }]);
    expect(state.lastFind).toEqual({ char: "x", direction: "forward" });
  });
  it("extends backward from the original anchor", () => {
    state.visualAnchor = 6;
    cursor = 6;
    press("F");
    expect(selectRanges(press("x").actions)).toEqual([{ start: 6, end: 4 }]);
    expect(cursor).toBe(4);
  });
  for (const motion of ["f", ";"]) {
    it(`supports 2${motion} in visual mode`, () => {
      state.lastFind = { char: "x", direction: "forward" };
      press("2");
      let result = press(motion);
      if (motion === "f") result = press("x");
      expect(selectRanges(result.actions)).toEqual([{ start: 0, end: 4 }]);
      expect(cursor).toBe(4);
    });
  }
  it("Escape cancels a find and exits visual without leaking count/pending state", () => {
    press("2");
    press("f");
    const result = press("escape");
    expect(state.mode).toBe("normal");
    expect(state.pending).toEqual({ kind: "none" });
    expect(state.count).toBe(0);
    expect(result.actions).toContainEqual({ type: "clearSelection" });
  });
  it("does not move on failure or without a remembered find", () => {
    press("2");
    expect(press(";").actions).toEqual([]);
    expect(state.count).toBe(0);
    press("f");
    expect(press("z").actions).toEqual([]);
    expect(cursor).toBe(0);
    expect(state.pending).toEqual({ kind: "none" });
  });
  it("still supports text objects after a character find", () => {
    text = "one two three";
    press("f");
    press("t");
    press("i");
    expect(selectRanges(press("w").actions)).toEqual([{ start: 4, end: 6 }]);
  });
});
