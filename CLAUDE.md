# Paperback Extensions

This repo contains extensions for the [Paperback](https://paperback.moe/) manga reader app, targeting both v0.8 and v0.9 formats.

## Project Structure

```
MangaFire/
  source.normal.js   # v0.8 readable/development source
  source.js           # v0.8 bundled IIFE (what the app loads)
  icon.png            # Extension icon
```

## Agent Delegation Rules

This project has four specialized agents. **Always delegate to them instead of doing the work yourself.** This saves context and produces better results.

### When the user asks about how extensions work, API details, or types:

- **v0.8 questions** -> Delegate to `v08-extension-expert`
- **v0.9 questions** -> Delegate to `v09-extension-expert`

Do NOT read source files yourself to answer API questions. The experts already have comprehensive knowledge baked into their system prompts.

### When the user asks to create or modify an extension:

- **v0.8 extension** -> Delegate to `v08-extension-builder`
- **v0.9 extension** -> Delegate to `v09-extension-builder`

Do NOT write extension source code yourself. The builders know the exact patterns, file structures, and bundling formats. They will consult the expert agents when needed.

### What YOU (the main agent) should handle directly:

- Git operations (commits, pushes, branches, PRs)
- Repo-level tasks (creating directories, moving files, renaming)
- GitHub CLI operations (creating repos, releases)
- General questions unrelated to extension internals
- Coordinating multi-step workflows that span multiple agents

### Delegation examples:

| User request | Action |
|---|---|
| "Create a v0.8 extension for MangaDex" | Delegate to `v08-extension-builder` |
| "How does pagination work in v0.9?" | Delegate to `v09-extension-expert` |
| "Port MangaFire to v0.9" | Delegate to `v09-extension-builder` |
| "What's the difference between v0.8 and v0.9?" | Delegate to both experts in parallel |
| "Fix the search in MangaFire source.js" | Delegate to `v08-extension-builder` |
| "Commit and push my changes" | Handle directly |

## Key Conventions

- v0.8 extensions are plain JavaScript with an IIFE bundle wrapper
- v0.9 extensions are TypeScript using `@paperback/types` package
- v0.8 uses `App.create*()` factory methods; v0.9 uses `Application.*` API
- v0.8 bundled files use `load()` global for cheerio; v0.9 imports cheerio directly
- Every v0.8 extension needs BOTH `source.normal.js` (readable) and `source.js` (bundled)
- Extension names in exports must match: `{ ClassName, ClassNameInfo }` for v0.8, `export const Instance = new Class()` for v0.9

## Remote

- Repository: `SGarcia710/imsebs-paperback-extensions` on GitHub
- Auth: `gh` CLI with SSH protocol configured via `gh auth setup-git`
- Push via HTTPS (credential helper set up)
