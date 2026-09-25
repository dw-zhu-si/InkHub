# InkHub (墨枢)

[简体中文](README.md)

InkHub is an independently maintained, local-first desktop app for AI-assisted novel writing and manuscript management. It brings novel libraries, full-book indexing, chapter-by-chapter reading, quality checks, reviewable AI repairs, specialized agents and skills, and cover/illustration workflows into one workspace.

InkHub is not an official DeepWrite release and is not endorsed by the upstream project. Its initial codebase used [DeepWrite](https://github.com/swjybky/deepwrite) under the Apache License 2.0, followed by substantial independent development and modification. See [Upstream provenance](UPSTREAM.md) and [Modifications](MODIFICATIONS.md) for details.

## Highlights

- **Local novel library**: add one or more novel directories by reference without automatically moving, renaming, or deleting source files.
- **Full-book import and reading**: build a private index for Markdown, TXT, DOCX, PDF, and EPUB; group chapters by volume and provide volume-relative numbering, previous/next navigation, reading progress, and full-text search.
- **Quality and repair workflow**: find issues such as empty or unusually short chapters and cross-chapter duplication. AI repair drafts must be accepted, rejected, or edited by the author before confirmed write-back to Markdown or TXT sources.
- **Writing agents and skills**: compose agents and skills for structure, continuity, character knowledge boundaries, prose style, scenes, foreshadowing, and review/revision loops.
- **Visual workflows**: create cover artwork for platform-specific dimensions, with title and author typography composed locally; plan illustrations for short stories.
- **Multiple model providers**: use ModelHub or connect OpenAI, Anthropic, Google Gemini, DeepSeek, Qwen, Doubao, Zhipu, Kimi, MiniMax, OpenRouter, Ollama, LM Studio, and compatible APIs directly.
- **Local search and resumable jobs**: search manuscript text with SQLite FTS5/BM25; long-running jobs save checkpoints and can be cancelled or resumed after failure or restart.

## ModelHub and direct providers

ModelHub is recommended, but not required, as a unified place for credential management, routing, usage tracking, and failover. InkHub also supports direct provider and custom compatible API configurations.

- Do not use a ModelHub Agent/MCP token as an application gateway token.
- Never put secrets in API URLs, source code, or committed environment files.
- Connection tests and model requests may incur real charges and should only run after explicit user action.
- Desktop credentials are handled by secure storage and are not exposed to Renderer pages.

## Local data boundaries

- Novel text is user content, not executable instruction material.
- Local skills are referenced by path and SHA-256; changed content must be reviewed again.
- Discovery, indexing, and preview of source novels are read-only by default. Write-back requires an explicit action and conflict checks.
- Upstream updates, remote free-model catalogs, the skill marketplace, cloud backup, and usage reporting are disabled or isolated by default unless independently configured, authorized, and audited.

## Run from source

Requirements: Node.js 24+ and pnpm 11+.

```bash
git clone https://github.com/dw-zhu-si/InkHub.git
cd InkHub
pnpm install --frozen-lockfile
pnpm dev
```

Run the full verification suite and production build:

```bash
pnpm verify
```

Build test installers on the target platform:

```bash
# Windows x64
pnpm pack:test:win

# macOS Apple Silicon
pnpm pack:test:mac:arm64

# macOS Intel
pnpm pack:test:mac:x64
```

Artifacts are written to `apps/desktop/release/`. macOS test packages use ad-hoc signing, which is not equivalent to Developer ID signing and notarization. Windows packages should be installation- and runtime-tested on Windows hardware.

## Repository layout

```text
apps/desktop/                 Electron desktop app
packages/contracts/           IPC and domain contracts
packages/pi-runtime-adapter/  Agent Runtime adapter
packages/shared/              Shared utilities
tools/                        Build, verification, and release tooling
```

Some internal `@deepwrite/*` workspace package names, the `deepwrite.json` filename, IPC identifiers, and storage keys remain solely for legacy-data compatibility and lower migration risk. They do not indicate brand affiliation or upstream participation in InkHub maintenance.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or contributing code. Do not publicly disclose security vulnerabilities; use the private reporting process in [SECURITY.md](SECURITY.md).

## License and attribution

This repository is distributed under the [Apache License 2.0](LICENSE). Before using, modifying, or redistributing it, also read:

- [NOTICE](NOTICE) — attribution shipped with the distribution
- [UPSTREAM.md](UPSTREAM.md) — upstream provenance, baseline revision, and independent-maintenance statement
- [MODIFICATIONS.md](MODIFICATIONS.md) — material changes from upstream
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — third-party and research-source boundaries
- [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt) — generated license inventory for installed production dependencies

`InkHub`, `墨枢`, and upstream project names may be trademarks or names of their respective owners. Apache License 2.0 does not grant trademark rights beyond reasonable and customary provenance descriptions.
