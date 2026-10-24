import { beforeEach, describe, expect, it } from "bun:test";
import {
  createVimState,
  finishOneShotIfComplete,
  handleNormalKey,
  handleVisualKey,
  type PromptAccess,
  type VimState,
} from "../../src/vim";
import { findCharMotion } from "../../src/vim/text";
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
  text = "abc,def,ghi,jkl";
  cursor = 0;
});

function press(key: string) {
  const handler = state.mode === "visual" ? handleVisualKey : handleNormalKey;
  const result = handler(state, key, ev(key), prompt);
  finishOneShotIfComplete(state, result);
  for (const offset of cursorTos(result.actions)) cursor = offset;
  return result;
}

describe("till motion resolution", () => {
  it("stops before a counted match in either direction", () => {
    expect(findCharMotion(text, 0, ",", "forward", 2, { till: true })).toBe(6);
    expect(findCharMotion(text, 12, ",", "backward", 2, { till: true })).toBe(8);
  });
  it("skips an adjacent match for a single repeat, but counts it in counted repeats", () => {
    expect(findCharMotion(text, 2, ",", "forward", 1, { till: true, repeat: true })).toBe(6);
    expect(findCharMotion(text, 2, ",", "forward", 2, { till: true, repeat: true })).toBe(6);
    expect(findCharMotion(text, 8, ",", "backward", 1, { till: true, repeat: true })).toBe(4);
    expect(findCharMotion(text, 8, ",", "backward", 2, { till: true, repeat: true })).toBe(4);
  });
  it("does not skip an adjacent match for an explicit till", () => {
    expect(findCharMotion(text, 2, ",", "forward", 1, { till: true })).toBe(2);
  });
  it("fails without a further match rather than crossing a newline or moving out of bounds", () => {
    for (const [value, offset, char, direction, repeat] of [
      ["abc\ndef", 0, "d", "forward", false],
      ["abc\ndef", 4, "c", "backward", false],
      ["a,\nb,", 0, ",", "forward", true],
      [",a", 1, ",", "backward", true],
      ["", 0, ",", "forward", false],
      ["abc", 0, "return", "forward", false],
      ["abc\ndef", 0, "\n", "forward", false],
    ] as const) {
      expect(findCharMotion(value, offset, char, direction, 1, { till: true, repeat })).toBeNull();
    }
  });
});

describe("normal till motions", () => {
  it("waits for a target and remembers the motion kind", () => {
    expect(press("t").actions).toEqual([]);
    expect(state.pending).toEqual({ kind: "find", direction: "forward", op: undefined, till: true });
    expect(cursorTos(press(",").actions)).toEqual([2]);
    expect(state.lastFind).toEqual({ char: ",", direction: "forward", till: true });
    expect(state.pending).toEqual({ kind: "none" });
  });
  for (const op of ["d", "c", "y"] as const) {
    for (const adjacent of [false, true]) {
      it(`${op}t excludes the target${adjacent ? " when adjacent" : ""}`, () => {
        if (adjacent) cursor = 2;
        press(op);
        press("t");
        const result = press(",");
        const start = adjacent ? 2 : 0;
        if (op === "y") {
          expect(state.yankRegister).toBe(text.slice(start, 3));
          expect(result.actions).toEqual([{ type: "yank", text: text.slice(start, 3) }]);
        } else {
          expect(deleteRanges(result.actions)).toEqual([{ start, end: 2 }]);
          expect(saveUndoSnapshots(result.actions)).toHaveLength(1);
          expect(state.mode).toBe(op === "c" ? "insert" : "normal");
        }
        expect(state.pending).toEqual({ kind: "none" });
      });
    }
  }
  for (const prefix of ["2dt", "d2t", "2t"]) {
    it(`supports ${prefix} counts`, () => {
      for (const key of prefix) press(key);
      const result = press(",");
      if (prefix.includes("d")) expect(deleteRanges(result.actions)).toEqual([{ start: 0, end: 6 }]);
      else expect(cursor).toBe(6);
      expect(state.count).toBe(0);
    });
  }
  for (const [key, char] of [
    ["space", " "],
    ["tab", "\t"],
    ["2", "2"],
    [";", ";"],
    ["t", "t"],
  ]) {
    it(`accepts literal ${key} targets`, () => {
      text = `ab${char}cd`;
      press("d");
      press("t");
      expect(deleteRanges(press(key).actions)).toEqual([{ start: 0, end: 1 }]);
    });
  }
  it("repeats till, reverses it, and keeps the original direction", () => {
    press("t");
    press(",");
    expect(cursorTos(press(";").actions)).toEqual([6]);
    expect(cursorTos(press(";").actions)).toEqual([10]);
    expect(cursorTos(press(",").actions)).toEqual([8]);
    expect(cursorTos(press(",").actions)).toEqual([4]);
    expect(cursorTos(press(";").actions)).toEqual([6]);
    expect(state.lastFind).toEqual({ char: ",", direction: "forward", till: true });
  });
  it("counts the adjacent occurrence in a counted repeat", () => {
    press("t");
    press(",");
    press("2");
    expect(cursorTos(press(";").actions)).toEqual([6]);
    expect(state.count).toBe(0);
  });
  for (const value of ["abc,def", "abc\ndef,"]) {
    it(`does not partially delete when the requested occurrence is missing in ${JSON.stringify(value)}`, () => {
      text = value;
      for (const key of "d2t") press(key);
      expect(press(",").actions).toEqual([]);
      expect(cursor).toBe(0);
      expect(state.pending).toEqual({ kind: "none" });
      expect(state.count).toBe(0);
    });
  }
  for (const reverse of [false, true]) {
    it(`applies operators to ${reverse ? "reverse" : "forward"} till repeats`, () => {
      press("t");
      press(",");
      cursor = reverse ? 10 : 2;
      press("d");
      const result = press(reverse ? "," : ";");
      expect(deleteRanges(result.actions)).toEqual([reverse ? { start: 8, end: 9 } : { start: 2, end: 6 }]);
    });
  }
  it("clears pending/count on failure without editing or entering insert", () => {
    for (const key of "c3t") press(key);
    expect(press("z").actions).toEqual([]);
    expect(state.mode).toBe("normal");
    expect(state.count).toBe(0);
    expect(state.pending).toEqual({ kind: "none" });
    expect(state.lastFind).toEqual({ char: "z", direction: "forward", till: true });
  });
  it("cancels without replacing history and lets explicit f replace till history", () => {
    press("f");
    press(",");
    const history = state.lastFind;
    for (const key of "d2t") press(key);
    press("escape");
    expect(state.lastFind).toEqual(history);
    expect(state.pending).toEqual({ kind: "none" });
    expect(state.count).toBe(0);
    press("t");
    press(",");
    press("f");
    press(",");
    expect(state.lastFind).toEqual({ char: ",", direction: "forward" });
  });
  for (const target of [",", "z", "escape"]) {
    it(`completes one-shot normal after a till ${target}`, () => {
      state.oneShotNormal = true;
      press("d");
      press("t");
      expect(state.mode).toBe("normal");
      const result = press(target);
      expect(state.mode).toBe("insert");
      expect(state.oneShotNormal).toBe(false);
      expect(result.actions).toContainEqual({ type: "mode", mode: "insert" });
    });
  }
});

describe("visual till motions", () => {
  beforeEach(() => {
    state.mode = "visual";
    state.visualAnchor = 0;
  });
  it("moves before selecting, repeats and reverses without changing the anchor", () => {
    press("t");
    expect(press(",").actions).toEqual([
      { type: "cursorTo", offset: 2 },
      { type: "selectRange", start: 0, end: 2 },
    ]);
    expect(selectRanges(press(";").actions)).toEqual([{ start: 0, end: 6 }]);
    expect(selectRanges(press(",").actions)).toEqual([{ start: 0, end: 4 }]);
    expect(state.visualAnchor).toBe(0);
  });
  it("supports counts and preserves selection on a failed repeat", () => {
    press("2");
    press("t");
    expect(selectRanges(press(",").actions)).toEqual([{ start: 0, end: 6 }]);
    press(";");
    expect(press(";").actions).toEqual([]);
    expect(cursor).toBe(10);
    expect(state.count).toBe(0);
  });
  it("cancels till and exits visual without replacing history", () => {
    press("t");
    press(",");
    const history = state.lastFind;
    press("2");
    press("t");
    const result = press("escape");
    expect(state.mode).toBe("normal");
    expect(state.pending).toEqual({ kind: "none" });
    expect(state.count).toBe(0);
    expect(state.lastFind).toEqual(history);
    expect(result.actions).toContainEqual({ type: "clearSelection" });
  });
});
