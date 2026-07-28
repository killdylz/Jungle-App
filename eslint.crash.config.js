// ─── Crash gate (CI-enforced) ────────────────────────────────────────────────
// This config exists because of a real incident: commit 9f71f61 shipped a
// `ReferenceError: reduce is not defined` to production. `vite build` never
// resolves identifiers, so the bundle compiled clean and CI deployed green; the
// Live runner then crashed the moment a coach armed Mic Mode mid-class.
//
// The full `eslint.config.js` DOES catch it — but it reports ~218 style/hooks
// messages, so the one message that matters is invisible and the suite can't be
// a build gate without a big-bang cleanup first.
//
// So this is a deliberately SMALL second config: only rules where a violation is
// a runtime throw or silent data loss. It must sit at ZERO. Anything here failing
// means real, user-visible breakage — never "baseline noise", never a rule to
// relax to get a deploy out. Style, hooks and unused-vars stay in the main config
// as the (unenforced) baseline.
//
// Run: npx eslint . --config eslint.crash.config.js
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import react from 'eslint-plugin-react'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    // Registered but with NO rules enabled: the source carries inline
    // `eslint-disable-next-line react-hooks/exhaustive-deps` comments, and eslint
    // errors on a disable comment naming a rule it can't resolve. Loading the
    // plugin makes those comments resolve without pulling in its ~100 messages.
    // `react` is registered for ONE rule — see `react/jsx-no-undef` below. Its
    // other ~100 rules stay off; this is the crash gate, not the style baseline.
    plugins: { 'react-hooks': reactHooks, react },
    // Those same disable comments are "unused" here (the rule they name is off in
    // this config), which would emit a warning per comment. That's an artifact of
    // the narrow rule set, not a finding — silence it so any output from this gate
    // is a genuine crash.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Undefined / misbound identifiers — the 9f71f61 class of bug.
      'no-undef': 'error',

      // 🔴 THE HOLE `no-undef` COULD NOT SEE, closed in session 18 on Dylan's call.
      // `no-undef` resolves plain identifiers but NOT JSX element names: `const a
      // = Foo` is caught, `<Foo/>` is not. That gap bit twice in session 6, once
      // in session 7, and produced SEVENTEEN unresolved components at once during
      // session 16's runner extraction — every one invisible here, every one a
      // white screen behind a polite error boundary.
      //
      // Three guards covered it until now, and all three stay: this rule,
      // `e2e/screens.spec.js` asserting the boundary is absent on all nine
      // screens, and `src/lib/navRoutes.test.js` for the sibling case (a screen
      // that is ABSENT rather than undefined — this rule cannot see that one).
      'react/jsx-no-undef': 'error',
      'no-const-assign': 'error',
      'no-class-assign': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-redeclare': 'error',

      // Throws at runtime.
      'no-obj-calls': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-setter-return': 'error',
      'getter-return': 'error',

      // Silent wrong behaviour — no throw, just quietly incorrect output.
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-duplicate-case': 'error',
      'no-unsafe-negation': 'error',
      'no-self-assign': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
      'no-unreachable': 'error',
    },
  },
  {
    // Node-side files: the Playwright config/specs and the build scripts run in
    // Node, not a browser, so `process`, `console` and friends are legitimately
    // defined. Declaring the correct environment is NOT relaxing the gate — it
    // still runs `no-undef` here, it just now knows which globals exist. Getting
    // this wrong in the other direction would be worse: without it the gate
    // reports six false positives, and a gate that cries wolf gets ignored.
    files: ['playwright.config.js', 'e2e/**/*.js', 'scripts/**/*.mjs', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
])
