import { consumeCount, enterInsert, enterNormal, exitVisual, resetPending } from "./state";
import { SELECT_MOTIONS } from "./tables";
import { endOfWord, findChar } from "./text";
import { resolveTextObject } from "./textobject";
import type { Action, FindDirection, HandlerResult, KeyEvent, PromptAccess, VimState } from "./types";
import { characterArgument, oppositeDirection, PASS, pushN } from "./util";

export function handleVisualKey(state: VimState, key: string, ev: KeyEvent, prompt: PromptAccess): HandlerResult {
  if (ev.meta || ev.super) return PASS;
  if (ev.ctrl) return PASS;

  // Arrow keys are host navigation, not selection motions, so pass them
  // through so vimcode never traps them (issue #63).
  if (ev.name === "up" || ev.name === "down" || ev.name === "left" || ev.name === "right") return PASS;

  const actions: Action[] = [];

  if (state.pending.kind === "find") {
    if (ev.name === "escape") resetPending(state);
    else return applyVisualFind(state, prompt, characterArgument(key), state.pending.direction, true);
  }

  // Pending g prefix in visual mode
  if (state.pending.kind === "goto") {
    state.pending = { kind: "none" };
    if (key === "g") {
      actions.push({ type: "cmd", cmd: "input.select.buffer.home" });
      state.count = 0;
      return { consume: true, actions };
    }
    // Unknown g-combo or escape — fall through to normal visual handling
  }

  // Pending text object: object char after i/a (viw, vaw, ...). Selects the
  // resolved range. Must run before the object char is treated as a selection
  // motion (e.g. w, b).
  if (state.pending.kind === "textobject") {
    const around = state.pending.around;
    state.pending = { kind: "none" };
    const range = resolveTextObject(prompt.getPlainText(), prompt.getCursorOffset(), key, around);
    if (range) {
      state.visualAnchor = range.start;
      actions.push({ type: "selectRange", start: range.start, end: range.end });
      actions.push({ type: "cursorTo", offset: range.end });
    }
    return { consume: true, actions };
  }

  // Count accumulation
  if (/[1-9]/.test(key) || (key === "0" && state.count > 0)) {
    state.count = state.count * 10 + parseInt(key, 10);
    return { consume: true, actions };
  }

  // Exit visual mode
  if (ev.name === "escape" || key === "v") {
    exitVisual(state, actions);
    return { consume: true, actions };
  }

  // Operators act on selection
  if (key === "d" || key === "x") {
    actions.push({ type: "cmd", cmd: "input.backspace" });
    enterNormal(state, actions);
    return { consume: true, actions };
  }

  if (key === "c") {
    actions.push({ type: "cmd", cmd: "input.backspace" });
    enterInsert(state, actions);
    return { consume: true, actions };
  }

  if (key === "y") {
    actions.push({ type: "yankSelection" });
    enterNormal(state, actions);
    return { consume: true, actions };
  }

  // e — extend selection to end of word (custom, not a host command)
  if (key === "e") {
    const n = consumeCount(state);
    const target = endOfWord(prompt.getPlainText(), prompt.getCursorOffset(), n);
    actions.push({ type: "selectRange", start: state.visualAnchor ?? 0, end: target });
    actions.push({ type: "cursorTo", offset: target });
    return { consume: true, actions };
  }

  if (key === "f" || key === "F") {
    state.pending = { kind: "find", direction: key === "f" ? "forward" : "backward" };
    return { consume: true, actions };
  }

  if (key === ";" || key === ",") {
    if (!state.lastFind) {
      resetPending(state);
      return { consume: true, actions };
    }
    const direction = key === ";" ? state.lastFind.direction : oppositeDirection(state.lastFind.direction);
    return applyVisualFind(state, prompt, state.lastFind.char, direction, false);
  }

  // Motions extend selection
  if (key in SELECT_MOTIONS) {
    pushN(actions, SELECT_MOTIONS[key], consumeCount(state));
    return { consume: true, actions };
  }

  // i/a begin a text object (viw, vaw, ...); wait for the object char.
  if (key === "i" || key === "a") {
    state.pending = { kind: "textobject", around: key === "a" };
    return { consume: true, actions };
  }

  // g prefix — wait for second keypress
  if (key === "g") {
    state.pending = { kind: "goto" };
    return { consume: true, actions };
  }

  // Unbound key — consume to prevent typing
  return { consume: true, actions };
}

function applyVisualFind(
  state: VimState,
  prompt: PromptAccess,
  char: string,
  direction: FindDirection,
  remember: boolean,
): HandlerResult {
  if (remember) state.lastFind = { char, direction };
  const target = findChar(prompt.getPlainText(), prompt.getCursorOffset(), char, direction, consumeCount(state));
  resetPending(state);
  const actions: Action[] = [];
  if (target !== null) {
    // V2's cursor setter clears selection, so move before selecting the range.
    actions.push({ type: "cursorTo", offset: target });
    actions.push({ type: "selectRange", start: state.visualAnchor ?? 0, end: target });
  }
  return { consume: true, actions };
}
