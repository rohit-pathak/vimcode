<h1 align="center">vimcode</h1>

<p align="center"><strong>Vim keybindings for the <a href="https://opencode.ai">OpenCode</a> prompt.</strong></p>

<p align="center"><em>Experimental. Things will break.</em></p>

<p align="center">
  <video src="https://github.com/user-attachments/assets/d0afa749-96c2-4f1c-adcb-5ab388d5798e" width="800" controls></video>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#support-policy">Support policy</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#what-it-does">What it does</a> ·
  <a href="#keybindings">Keybindings</a> ·
  <a href="#known-gaps">Known gaps</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## Support policy

This fork's **v0.21.0** builds on upstream **v0.19.2**, preserves `I`, `f`/`F`, and `;`/`,` from the fork's v0.16.0, and adds `t{char}` till motions. Upstream provenance is tracked in the changelog, while this fork uses its own minor releases.

OpenCode v2 support is rolling out gradually, starting with experimental support in vimcode v0.19.0. Future maintenance will move to v2 only. This release still includes v1 support.

| OpenCode version | Recommended fork pin | Status |
|------------------|-------------------------|--------|
| v1 | `v0.21.0` | Retained compatibility; E2E tested on OpenCode 1.18.34 on macOS. |
| v2 | `v0.21.0` | Experimental; installed-package checks on OpenCode 2.1.4 and E2E checks on 2.0.15 on macOS. |

V1 users can stay on an older pinned release instead of following the v2 rollout. We have not set a date for removing v1 support.

## Install

Use the instructions for your OpenCode major version. Both versions use the same package and release tag, but their config files differ.

### OpenCode v1

Use `v0.21.0` for the fork's bindings, including till motions, plus upstream's subagent-navigation and question-answer fixes. Existing V1 users can stay pinned to the fork's `v0.16.0` if they prefer their previous behavior. Upstream's V1-only `v0.18.1` is another option, but does not include the fork's custom bindings.

Add to your `tui.json` (or `.opencode/tui.json`):

```json
{
  "plugin": ["vimcode@git+https://github.com/rohit-pathak/vimcode.git#v0.21.0"]
}
```

> **Why a versioned ref?** OpenCode resolves `@latest` once and caches it forever. Bumping the version in your config is the only reliable way to get updates.

By default, you'll see a toast when a newer vimcode version is available. If you stay on the legacy v1 pin, set `updateCheck: false` using the [v1 options example](#opencode-v1-options) to suppress those notifications.

### OpenCode v2 (experimental)

Pin `v0.21.0` in `~/.config/opencode/cli.json`. Replace any previous vimcode entry so only one copy loads. The fork's old `v0.16.0` tag does **not** support v2.

```json
{
  "plugins": [
    {
      "package": "vimcode@git+https://github.com/rohit-pathak/vimcode.git#v0.21.0"
    }
  ]
}
```

See [the v2 POC instructions](docs/opencode-v2-poc.md) for isolated development, tarball installation, and compatibility limits. You can also replace `package` with `/absolute/path/to/vimcode` to load a local checkout. To roll back v2, remove the plugin entry; a V1-only release cannot be used as a v2 fallback.

This fork passed 86 installed-package checks on OpenCode **2.1.3** on macOS ARM64, with the inherited tab-offset and snapshot-redo known gaps unchanged. Local-directory loading also passed 19 fork-binding checks. To try it without changing your live configuration, run `just dev2 /absolute/path/to/opencode`.

## Configuration

### OpenCode v1 options

Use the tuple form in `tui.json`:

```json
{
  "plugin": [["vimcode@git+https://github.com/rohit-pathak/vimcode.git#v0.21.0", { "updateCheck": false }]]
}
```

### OpenCode v2 options

Put `options` alongside `package` in `cli.json`:

```json
{
  "plugins": [
    {
      "package": "vimcode@git+https://github.com/rohit-pathak/vimcode.git#v0.21.0",
      "options": { "updateCheck": false }
    }
  ]
}
```

### Available options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `updateCheck` | `boolean` | `true` | On startup, check GitHub for new versions (at most once per day). This is the only network request vimcode makes. Set to `false` to disable. |
| `modeIndicator` | `"toast"` \| `"none"` | `"toast"` | How to show the current mode. `"toast"` flashes a brief notification on each switch. `"none"` disables it, relying on cursor shape alone. |
| `startMode` | `"insert"` \| `"normal"` | `"insert"` | Which mode to start in when OpenCode launches. |
| `experimentalV2Leader` | `string` \| `string[]` \| `false` | `"ctrl+x"` | v2 only. Must match the host's leader key. Use `false` or `"none"` if the host leader is disabled. |

## What it does

Adds normal/insert mode to OpenCode's prompt input. Escape enters normal mode, `i` goes back to insert. A brief toast shows the current mode on each switch (configurable).

In insert mode, typing works normally. Enter adds a newline, Ctrl+Enter submits. The file picker and autocomplete keep working: Enter picks the selected item, Escape closes the picker without leaving insert.

In normal mode, keys are vim commands. Unrecognized keys get swallowed so you don't accidentally type into the prompt. `:` opens the command palette.

### Overlay passthrough

When OpenCode shows its own UI (command palette, `/sessions`, the `@` file picker, question choices, permission prompts) vimcode steps aside. Those controls keep their native keybindings.

### Question answers

On both OpenCode v1 and v2, a question's **Type your own answer** editor starts in insert mode with a line cursor. Escape switches to normal without closing the editor; motions, operators, text objects, visual mode and undo work on the answer. `i` returns to insert. A further Escape in normal mode reaches OpenCode's cancel handler, which can discard an unsubmitted draft on v1.

Enter, Ctrl+Enter and Tab keep OpenCode's native question behavior, rather than vimcode's main-prompt submit/newline bindings. Each answer editor has its own Vim mode, pending commands, yank register and undo snapshots; returning to the main prompt restores its previous state. This also applies to child-session questions. `p` pastes the answer's own yank register, and empty-answer `j`/`k` never loads prompt history.

`:` still opens the command palette, which owns its keys until it closes. Timeline and conversation-navigation Vim shortcuts are inactive while editing an answer. Question choices and confirmation screens remain host-controlled.

### Subagent navigation

Read-only child-session views pass keys to OpenCode without changing your Vim mode. On v2, the Composer also owns its navigation keys. Returning to the parent prompt preserves the mode you were using.

### Escape behavior

First Escape in insert mode switches to normal - it won't trigger OpenCode's double-escape interrupt. So canceling a running response from insert mode takes 3 escapes: one for normal, two more for the interrupt.

### Leader key

On OpenCode v1, vimcode reads the leader key from your `tui.json` keybinds automatically. On v2, it cannot read the host's configured leader, so `experimentalV2Leader` must match it. The default `ctrl+x` needs no extra plugin option.

In **normal and visual mode**, the leader key and the follow-up key pass straight through to OpenCode, so leader shortcuts (`<leader>c` for copy, etc.) work as expected.

In **insert mode**, printable leaders (like space) insert their character. Non-printable leaders (like `ctrl+x`) pass through to OpenCode, so leader shortcuts work from any mode.

For a `space` leader on **v1**, set it in `tui.json`:

```json
{
  "keybinds": {
    "leader": "space"
  }
}
```

On **v2**, set both the host keybind and the plugin option in `cli.json`:

```json
{
  "keybinds": { "leader": "space" },
  "plugins": [
    {
      "package": "vimcode@git+https://github.com/rohit-pathak/vimcode.git#v0.21.0",
      "options": { "experimentalV2Leader": "space" }
    }
  ]
}
```

If they do not match, vimcode can swallow leader shortcuts or printable input.

### Platform notes

Clipboard (`y`, `yy`, `p`) uses the system clipboard: `pbcopy` on macOS, `clip.exe` on Windows, `xclip` on Linux. Linux users need `xclip` installed (`apt install xclip` or equivalent). If the clipboard tool is missing, yank/paste still works within the session via an internal register.

Cursor shape (block in normal, bar in insert) works across all terminals. No special terminal support required.

The plugin checks GitHub for new versions once per day on startup. No other network requests, no telemetry.

## Keybindings

### Motions

| Key | Action |
|-----|--------|
| `h` `j` `k` `l` | Left, down, up, right |
| `w` `b` `e` | Word forward, backward, end of word |
| `f{char}` `F{char}` | Next/previous `{char}` on the current line |
| `t{char}` | Till just before the next `{char}` on the current line |
| `;` `,` | Repeat the latest character find in the same/opposite direction |
| `0` `^` | Line start |
| `$` | Line end |
| `gg` | Buffer start |
| `G` | Buffer end |

All motions take counts: `3j` moves down 3 lines.

`t{char}` also works with `;` and `,`: repeats retain the till behavior, and `,` reverses direction without changing the remembered direction. A single repeat skips an adjacent target so it advances; counted repeats count that occurrence. Standalone backward `T{char}` is not implemented yet.

When the input is empty, `j`/`k` scroll through prompt history instead of moving the cursor.

### Operators

`d` (delete), `c` (change), and `y` (yank) combine with motions:

| Combo | Action |
|-------|--------|
| `dd` `cc` `yy` | Operate on whole line |
| `D` `C` | Delete/change to end of line |
| `dw` `cw` `yw` | To next word |
| `db` `cb` `yb` | To previous word |
| `de` `ce` `ye` | To end of word |
| `df{char}` `cf{char}` `yf{char}` | Through next `{char}` on the current line |
| `dt{char}` `ct{char}` `yt{char}` | Up to, but not including, next `{char}` on the current line |
| `dF{char}` `cF{char}` `yF{char}` | Back to previous `{char}`, excluding the match |
| `d;` `c;` `y;` | Repeat the latest character find |
| `d,` `c,` `y,` | Repeat the latest character find in the opposite direction |
| `d$` `c$` `y$` | To end of line |
| `d0` `c0` `y0` | To start of line |
| `d^` `c^` `y^` | To start of line |
| `dh` `ch` `yh` | Character left |
| `dl` `cl` `yl` | Character right |
| `dj` `cj` `yj` | Current + line below |
| `dk` `ck` `yk` | Current + line above |
| `dG` `cG` `yG` | To end of buffer |

Counts work on both operator and motion: `2dd` deletes 2 lines, `d3w` deletes 3 words.

### Text objects

Text objects pair with `d`, `c`, `y` and select in visual mode (`viw`, `vi(`, `vib`, …). `i` takes the inside; `a` takes the delimiters too (for words, the trailing whitespace):

| Object | Selects |
|--------|---------|
| `iw` `aw` | The word under the cursor |
| `i"` `i'` `` i` `` | Inside the quotes |
| `i(` `i{` `i[` `i<` | Inside the bracket pair (opener or closer) |
| `iq` | The nearest quote of any type (`"` `'` `` ` ``) |
| `ib` | The nearest bracket of any type (`()` `{}` `[]`) |

So `diw`, `ci"`, `da(`, `yi{`, `vib`, `ciq` all work. `iw` covers the run under the cursor — word, punctuation, or whitespace; `aw` also takes the trailing whitespace (or leading, when there's none). Brackets nest and can span lines; quotes pair within the current line.

**`ib` note:** it means "any bracket" — the nearest of `()` `{}` `[]` — not vim's parens-only `ib`. Use `i(` when you specifically want parentheses.

### Insert entries

| Key | Action |
|-----|--------|
| `i` | Insert at cursor |
| `I` | Insert before first non-blank character |
| `a` | Insert after cursor |
| `A` | Insert at end of line |
| `o` | Open line below |
| `O` | Open line above |

`Ctrl+O` runs one normal-mode command and returns to insert. Motions, operators, counts, and `r{char}` all work.

### Visual mode

Press `v` in normal mode to enter character-wise visual mode. Press `V` to select the current line. Motions extend the selection, operators act on it:

| Key | Action |
|-----|--------|
| `d` `x` | Delete selection |
| `c` | Delete selection, enter insert mode |
| `y` | Yank (copy) selection |
| `V` | Select current line |
| `Escape` `v` | Exit visual mode |

All normal-mode motions work for extending the selection: `h` `j` `k` `l` `w` `b` `e` `f{char}` `F{char}` `t{char}` `;` `,` `0` `$` `G`, with counts.

### Other

| Key | Action |
|-----|--------|
| `Ctrl+O` | One-shot normal mode (execute one command, return to insert) |
| `r{char}` | Replace character under cursor with `{char}` |
| `x` | Delete character |
| `u` | Undo |
| `Ctrl+r` | Redo |
| `p` | Paste from yank register |
| `:` | Command palette |
| `:w` `:write` | Send prompt (via command palette) |
| `:q` `:quit` `:wq` | Quit OpenCode (via command palette) |
| `:vim` | Toggle vim mode on/off (persisted across restarts) |
| `/` | Jump to message (session timeline) |
| `[` `]` | Scroll conversation half-page up/down |
| `{` `}` | Jump to previous/next message |
| `X` | Backspace |
| `J` | Join current line with next |
| `j` `k` | Cycle prompt history (when input is empty) |
| `Enter` | Submit prompt |
| `Escape` | Pass through for double-escape interrupt |

## Known gaps

- `Ctrl+v` - block visual mode is not supported
- No persistent mode indicator - the toast fades after about a second. A cache-installed JSX slot still fails to resolve `@opentui/solid/jsx-dev-runtime`; last reproduced on 2026-09-08 with OpenCode 1.18.21. OpenCode 1.18.25 uses the same relevant runtime code and OpenTUI version ([#3](https://github.com/oribarilan/vimcode/issues/3)).

Configurable key bindings are next once the core vim coverage stabilizes.

## How it works

On v1, vimcode registers a host key intercept. The experimental v2 adapter uses a renderer key listener instead. Pure handlers in `src/vim/` take the current mode and key and return actions without touching the plugin API. `src/index.ts` applies those actions through editor methods and host commands; `src/v2.ts` adapts the v2 context to the shared controller.

## Contributing

1. Try it
2. If it's useful, a star helps others find it
3. Open issues for bugs or missing keybindings
4. PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup and the release process.

Use `just test` for the fast suite, `just test-int` for harness integration and parser helpers, and **`just test-e2e` with no arguments** for both pinned OpenCode hosts (v1 **1.18.34**, v2 **2.0.15**). Optionally select `just test-e2e v1` or `v2`. The real-PTY guard infers fresh temp outputs, prints receipt paths, and bootstraps missing matching hosts privately (network required); optional ignored `.env` binary paths avoid bootstrap. PR builds run all three suites. The latter two stay outside fast-test discovery and run locally only on demand; see [path settings, advanced overrides, and validation limits](docs/test-e2e.md).

## License

MIT
