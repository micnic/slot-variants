# Playgrounds

Four lint-only sandboxes — React, Solid, Vue, Svelte — for trying the
[ESLint plugin](../src/eslint-plugin) against real component files instead of
`RuleTester` strings.

Each folder holds a `Button`, a `Card` (slots + per-slot variants) and an `App`
that imports both, written idiomatically for that framework. They are clean by
design: a green run means the plugin reports no false positives. To see a rule
fire, edit a fixture — add a class to a config, or pass a conflicting one from
`App` — and run the lint again.

These fixtures also exercise the cross-file resolution in `no-restyle`, which
needs components on disk and so cannot be covered by `RuleTester` alone.

## Running

```bash
npm run playground          # all four
npm run playground:react
npm run playground:solid
npm run playground:vue
npm run playground:svelte
```

Each folder has its own flat `eslint.config.ts` that enables
`plugin.configs.recommended` and sets that framework's parser. They import the
plugin from `src/`, so there is no build step — edit a rule, run the lint. The
configs double as copy-pasteable setup examples.

## What each playground needs

| Playground | Parser | Class attribute |
| ---------- | ------ | --------------- |
| React | `typescript-eslint` (JSX) | `className` |
| Solid | `typescript-eslint` (JSX) | `class` |
| Vue | `vue-eslint-parser` | `class` / `:class` |
| Svelte | `svelte-eslint-parser` | `class` |

## Editor support

Each folder also has a `tsconfig.json` so an editor resolves the fixtures the
same way the lint does: framework JSX settings, the DOM lib, and a `paths`
entry mapping `slot-variants` to `src/` (no build needed). `@types/react` and
`solid-js` are devDependencies purely so those imports type-check; the root
`tsconfig.json` excludes `playground/` so the per-folder configs own these
files.

Nothing here is built, bundled or served — the framework imports exist only so
the files read like real components.
