# Lessons Learned (Index)

<!-- One line per lesson: the bold takeaway only. Full write-ups live in LESSONS-detail.md.
     Commands read THIS file at session start (it is short on purpose); when a one-liner is
     relevant to the task at hand, open the matching entry in LESSONS-detail.md for the detail.
     To add a lesson: put the one-liner here under the right section, and the full write-up in
     LESSONS-detail.md with the SAME bold lead so the two stay linked. Keep this file short -
     it is the always-read surface. For deep dives into why a concept works, use /tk:learning-opportunity. -->

## What I Learned

- **XML tags in prompts are a real thing, not just hype.**
- **Hybrid approach beats all-or-nothing.**
- **AI peer review recommendations often over-engineer.**
- **A worktree is just a folder, a branch is just a pointer.**
- **Worktree detection: `--git-dir` vs `--git-common-dir`.**
- **Use deterministic scripts for structural data, not LLMs.** (see the v4.4.0 / issue #97 refinement in detail)
- **Version bumps touch more files than you think.**
- **Never interpolate shell variables into inline `node -e` strings.**
- **`settings.json` can get modified by research subagents.**
- **Permission approvals can land in the wrong settings file.**
- **"Do I understand it?" vs "Can I use it?" is the right split for review skills.**
- **Run debates on plans, not just finished work.**
- **Boundary annotations in few-shot examples teach thresholds, not just format.**
- **DRY refactors create duplication-of-the-other-kind bugs.**
- **Issue framing != actual problem.**
- **Diagnostic output to stderr when stdout is captured by another LLM.**
- **Reasoning models share their token budget between reasoning and output.**
- **Silent empty bodies need active detection, not just happy-path returns.**
- **Per-session temp file paths solve concurrent-tab collisions; session-ID recovery needs to handle the multi-tab case.**
- **Run /tk:ask-gpt and /tk:ask-gemini in parallel when the change is worth real scrutiny; convergence between independent reviewers is signal.**
- **Cross-platform mirrors can hide pre-existing gaps; audit before assuming a small change stays small.**
- **Define a judgement gate once, in countable terms, consistent with its governing rule.**
- **A gate must be countable against the output the model actually produces.**
- **`gh pr list --state merged --limit 1` sorts by CREATION date, not merge date.**
- **HTML output is useless if the user only gets a file link - it opens as source in the editor.**
- **A diff review of already-closed work still earns its keep.**
- **Don't trust merged review severities without verifying the source lines.**
- **Review proposed prompt edits before applying them, and triage the volume hard.**
- **Editing the currently-running command file trips the harness self-modification guard.**
- **The self-modification guard also blocks adding a permission to `settings.local.json`, not just editing the running command.**
- **A prompt's user-facing message is not enforcement.**
- **Pin subagents freely; never switch the main-loop model mid-session.**
- **A release needs one review of the whole range, not the sum of its per-issue reviews.**
- **A version block describes what that version shipped; point at what changed since, never rewrite it.**
- **Numbers quoted in release notes mid-cycle go stale; fill counts in the last verify step.**

### gitmargin: v0 decision cycle (issue #1, 2026-09-02)
- **In vision mode, settle the workflow before the mechanism.** The owner redirected the exploration twice, from sign-in and hosting constraints back to what the tool does end to end for each person.
- **A workflow whose last agent is the expensive synthesis needs a fallback.** The design panel's judge died on a spend limit; cached agents made the re-run cheap, and the ranking was done by hand from the saved data.

### gitmargin: v0 split cycle (issue #2, 2026-09-02)
- **A design the builder cannot test alone cannot be built alone.** The first scoping question on the spikes ("what do you have to test with?") had no answer, and v0 split into a part that needs nothing but a file.
- **When the owner answers "?", collapse to one line per item with a one-word accept.** A four-question round with embedded proposals drew "?" and "Which question?"; five one-liners plus "say defaults" got "yes".

### gitmargin: part-1 overlay build and review (issue #3, 2026-09-02)
- **Say what the check showed, not what the file is called.**
- **A string replace that silently matches nothing ships a half-applied fix.**
- **A claim about browser behaviour is a guess until you measure it in the browser.**
- **A screenshot-only critic scores the whole frame, so an overlay on someone else's page plateaus on gaps that are not yours to fix.**
- **The tool you write to inspect your work is code too, and it gets the least review.**
- **"Is it installed" must be a launch probe, not a file check.**
- **A guard that blocks a rebuild must not also block the render that opens the thing being guarded.**

### gitmargin: dogfood prep for issue #6 (2026-09-04)
- **One real person's first click beat a nine-combination automated matrix.**
- **A minifier will choose your browser support floor if you do not.**
- **`compareDocumentPosition` returns 0 for a node compared with itself, so "the nearest X above me" silently skips my own X.**
- **A silent failure is indistinguishable from no feedback at all.**

### gitmargin: element quotes read as rendered text (issue #8c, 2026-09-05)
- **A helper that reads text may add whitespace, but must never drop a character.**
- **A comment naming what a test guards is a claim; trace the test, never trust the comment.**
- **A claim lives in as many copies as the pipeline has stages, and fixing the source fixes one of them.**
- **"Unreachable today" and "safe to leave" are different verdicts, and only the first is what an audit measures.**

### gitmargin: toolkit upgrade to 6.3.2 (issue #11, 2026-09-04)
- **Count a list with the tool, not your eye; and when a gate trips on the count, ask whether the world changed or your record did.**
- **Before deleting a backup, check which of its files version control cannot restore.**
- **A feature whose state is derived from its own previous output must be smoke-tested in an isolated directory.**

### gitmargin: comment-mode target preview (issue #10, 2026-09-09)
- **A file carved out of a delegated sweep becomes your own sweep, not a token edit.**
- **A preview must read every input the action reads, or it promises what the action will not do.**
- **Write a receipt's expectation from the check's real output, or a true finding dies on its own proof.**

### gitmargin: toolkit move to the tk plugin (issue #12, 2026-09-13)
- **A migration's clean audit covers its own file list; grep the whole repo for every removed path, including files the migration itself just wrote.**

### gitmargin: toolkit upgrade to 7.3.0 (issue #14, 2026-09-16)
- **A runbook issue written for one release is stale by the next; rerun the read-only audit and trust its counts over the issue's.**
- **Renaming a lesson's one-liner means renaming its write-up's bold lead too, even when the upgrade audit leaves the detail file out.**
- **Updating a standing page from a new session needs one fetch of the live version first; resending unchanged after the refusal is refused again.**

### gitmargin: shared live comments (issue #15, 2026-09-18)
- **A set of test files that must stay unedited catches plan errors as well as code errors.**
- **A default argument runs before the guard in the function body.**
- **A fake that refuses AFTER delivering cannot test a refusal.**
- **Prove a new test fails first by putting the old file back.**
- **Before fixing a finding, reread the decision it touches: a correct fix can still reverse an approved choice.**
- **A secret must never follow an address that a file names.**
- **A list that rebuilds on every change costs keyboard users their place on a live page.**
- **Look at git status after every vendor install: an installer can write agent instruction files into your repo.**

### gitmargin: toolkit upgrade to 7.4.1 (issue #23, 2026-09-22)
- **An upgrade audit reports missing permission rows but never adds them; only re-running setup does.**
- **A finder's severity is a claim and its receipt is the evidence, so write the expectation from what the command really prints.**

### gitmargin: sign in with GitLab (issue #18, 2026-09-21)
- **A hand-rolled primitive gets a reference test before anything is built on it.**
- **Trust comes from the carrier, never from the shape of the data.**
- **"Where does the browser keep this" is a per-origin-kind fact; one measurement does not cover disk, sandbox and web.**
- **An answer that ends state must end only the state the request carried.**
- **A designed refusal reads as a failure to the person testing it unless the verdict comes first.**
- **Show the bare value when the paste target is a prompt or a dashboard; a quoted shell example teaches the quotes.**
- **A replacement string is not inert: a dollar sign followed by a backtick or an ampersand is a directive, so replace with a function.**
- **When the harness refuses an action class, the handoff must say so and hand those lines to the owner.**

### gitmargin: rethink the comment overlay (issue #21, 2026-09-22)
- **When the owner says the design is dated, the premise of the issue is the thing to check first.**
- **A per-frame rebuild is safe only while nothing it destroys is state.**
- **An assertion that changes because behaviour changed is a behaviour change, not a test edit.**
- **A canvas round-trips the colour syntax you give it; only the pixel is converted.**
- **A focus helper that steps aside when anything holds focus cannot hand focus back.**
- **A stacking order is part of "the pill sits above the sheet", not a detail of it.**
- **Measure the thing the fix is about, in the browser, before calling it fixed.**

### gitmargin: comments keep their screen (issue #24, 2026-09-22)
- **Issues a cycle files about itself are leads, not findings: reproduce each on a real page before planning it.**
- **A fallback must wait until the primary pointer is gone, not merely hidden.**
- **A fixture whose labels are all unique hides every bug that lives in repeated labels.**
- **A helper that names what is on screen now gives wrong answers about hidden things.**
- **A cost reason for leaving something unfixed is a guess until it is timed.**
- **Two rules that cover the same fixture hide each other from its tests; break each one alone.**

### gitmargin: sign in with GitHub (issue #17, 2026-09-23)
- **A setting that sounds safer can shut out everyone else: read what it restricts, not what it protects.**
- **A header the runtime always sends cannot be tested by its absence; assert its value.**
- **Check every step of a live walk against the provider's current pages before the owner runs it.**
- **A copy attached before a feature existed carries the old overlay for good; check its date before a walk uses it.**
- **Evidence the owner says he does not have is recorded as missing, never asked for again.**

### gitmargin: Vercel same-project mode (issue #19, 2026-09-23)
- **A sandboxed page's `location` still names its host; only `self.origin` says "null". Measure browser security facts in both engines.**
- **A stand-in that answers too kindly cannot fail the guard it exists for.**
- **A limit checked inside one SQL statement is soft under concurrency: say so, and make its tie-breaks deterministic.**
- **A platform's default protection can leave open the one address people actually visit; check it and warn.**
- **When a pasted secret is refused, compare it with the platform's record without printing either.**

### gitmargin: the Claude Code plugin (issue #16, 2026-09-23)
- **A prompt file that reads right is still untested: rehearse it in real sessions before trusting it.**
- **In a plugin skill, only SKILL.md and its allowed-tools see `${CLAUDE_PLUGIN_ROOT}`; supporting files and the shell do not.**
- **A skill Claude may start on its own must not declare allowed-tools: the grant makes the skill itself need approval.**
- **"Yes, and don't ask again" saves one subcommand per project; only a hand-added rule covers a whole command.**
- **A trust rule that assumes a person typed the command breaks the day an agent types it.**
- **Check what a validator actually validates before counting its pass as evidence.**
- **A mutation that does not apply proves nothing; make the harness say so.**

## Mistakes to Avoid

- **Fill a plan's Outcomes by replacing the template placeholder, not inserting above it.**
- **Don't micro-tag individual bullets.**
- **Watch for tool output artifacts in reviews.**
- **Review your own AI-generated code before shipping.**
- **Skill tool expansions can serve stale command versions.**
- **AI debates surface things standard reviews miss.**
- **"Same command, two gears" vs "new command" decision pattern.**
- **CLI default-acceptance prompts don't fully translate to chat.**
- **When changing user-facing copy, grep for the same description elsewhere.**
- **Don't state a cited past lesson as if it happened this session.**

### Skills migration decisions (issue #71)

- **Subagents do NOT auto-discover project skills.**
- **Cross-directory file references in skills use `` !`cat ...` `` dynamic injection syntax, not `!include`.**
- **`@axe-core/playwright` is compatible with `playwright-core`.**
- **`user-invocable: false` works as documented.**
- **Shared files reduce duplication across review skills.**
- **GPT and Gemini peer review caught things standard reviews missed.**

### Doc audit + v5.0.0 release (issue #118)

- **Verify audit findings against file content before acting - subagent claims about file structure are not facts.**
- **A major version bump on additive-only work needs explicit framing.**
- **Extending a running rollup beats adding a competing one.**

### WSL opener + Windows installer parity (issues #119, #126)

- **Verify impact, not just existence, before scoping a fix.**
- **A passing happy-path test is not enough - test edge cases, or let adversarial review hunt.**
- **Replacing LLM-run prose with a script removes non-determinism and shrinks the permission surface.**
- **A containment check that compares path strings is not containment.**
- **A test must plant the state a failure actually leaves, not a convenient stand-in.**
- **A file that is both the maintainer's live config and the downstream seed leaks in both directions.**

### gitmargin: v0 decision cycle (issue #1, 2026-09-02)
- **Retiring a promise means grepping the whole file, not just the section the plan named.** README kept "no new accounts" at line 53 after the principle at line 39 was softened (review R4, commit eccbed7).
- **A list that lives in three places drifts within the hour.** Four spikes in the decision doc, three in the README, two in issue #2, all written by the same session (review R5).
- **A glossary pointer is a promise; check it covers the terms the pointing doc uses.** The decision doc pointed at a glossary written for the previous design (review R1).

### gitmargin: v0 split cycle (issue #2, 2026-09-02)
- **An execution-time decision must land in the committed doc, not only where it was made.** Two choices made while rewriting issue #5 (attach writes a copy; Node only) never reached the split doc or the plan's Outcomes (review R1, commit 0dd96da).
- **Say "summarised" when you summarise; "kept as written" is a claim a reviewer will check.** The split doc condensed the four spikes under a lead-in that promised the section 9 text (review R3).
- **A receipt should be a presence check, not a line count.** Two plan receipts expected `grep -c` counts that failed on line semantics while the claims held; `grep -o` or `-n` would have matched cleanly.

## Patterns That Work

- **Tag vocabulary for prompts.**
- **Audit before converting.**

### Rename-aware setup cleanup (issue #80)

- **`for i in "${!array[@]}"` is the idiomatic Bash way to iterate parallel indexed arrays.**
- **Scope parity gaps explicitly when fixing one of several.**
- **A 🟩 on "ask the user about X" can mislead.**

### browse.js hardening (issues #82 / #84 / #87)

- **Auto-start lifecycle code is hard to verify without a real dev server.**
- **FS-probes for "is X installed" should fall through, not be authoritative.**
- **Lazy locators don't throw - validate at parse, not at construction.**

### HTML render pipeline (issues #120, #122, #127)

- **Prebuilt shell + data injection: the real #127 win is that a script has no "read-before-overwrite" constraint.**
- **Lift the gold artifact verbatim into a shared tokens file for zero visual regression - but make the mirror bidirectional.**
- **Emit JSON, let a script stamp the boilerplate - it is faster to generate and easier to verify.**

### Plan HTML migration (issue #129)

- **Enforce invariants in code, not just comments - convention-only constraints erode as the codebase grows.**
- **A top-level field list in a prompt reads as exhaustive - sub-field structure must be mentioned or it will be omitted.**

### v5.2.0 release + doc audit (issue #128)

- **Self-enforce release-time conventions in the artifact or the checklist, not in memory.**

### Host-agnostic gh/glab (issue #143)

- **Markdown table escaping leaks into shell commands when the file is inlined with `` !`cat` ``.**
- **A co-location rule is only as strong as its weakest call site.**
- **Inlining a shared fragment AND repeating its content defeats the point of the fragment.**
- **A permission you cannot self-provision may have an already-permitted equivalent.**

### Human-in-the-loop map (issue #146)

- **A self-run consistency check passes while the scoped thing is missing entirely.**

### Auto-by-default rewrite (issue #147)

- **A checked subtask means its wording shipped, not that the nearby diff did.**
- **Call sites paraphrase a shared rule into different behaviors on day one.**

### M2 audit tiers (issue #148)

- **Adding a pipeline stage demands three sweeps: flow prose, data-lifecycle rules, and sibling-stage parity.**

### M11 tripwire hardening (issue #149)

- **A security control passes its own happy-path tests and still fails open - probe it with hostile inputs before trusting its exit code.**
- **Parse tool output with state and explicit decoding, never by prefix alone: content impersonates structure.**
- **Masking the match that triggered the report is not masking the line.**

### Stage chaining (M14)

- **A sweep's receipt is its grep patterns and their output, not the word "clean".**
- **Fixing a drift finding means moving mechanics INTO the shared rule, not adding them at the call site.**

### Severity rubric + audit-aware direct runs (issues #150, #151)

- **A "nothing defines X" finding must first refute the generic rule that already covers X.**
- **Centralizing a rule and hand-writing its call-site preamble in the same commit still drifts - quote the rule or say nothing.**
- **A subagent lost to an account limit resumes as a narrowed retry scoped to what earlier passes did not cover.**

### Subagent model pinning (issue #152)

- **Write the validation bar before the result, then honor it when the result is inconvenient.**
- **A missing finding is invisible to the audit; a wrong one is not.**
- **`failglob` beats `nullglob`, so a nullglob guard does not stop an empty-directory abort.**
- **Restricting an agent's tools is a behavior change, not a safety annotation - check what its callers actually need to run.**

### Second-viewport publishing (issue #154)

- **Check the permission allow-list before designing a mechanism out of shell commands.**
- **`<title>` is RCDATA, so escaping markup inside it changes nothing visible except entities.**
- **A capability-shaped gate can be the honest option for a toolkit shipped to installs you do not control.**

### Viewport inversion + dark mode (issues #155, #156)

- **Mutation-testing a group of assertions is not mutation-testing each assertion.**
- **Tokenising the shared layer does not tokenise its consumers.**
- **A prose sweep needs the wordings that actually occur, not the one you remember writing.**
- **A measurable claim in a commit message is a claim until you measure it.**
- **A pipeline's exit status is the last command's, so `grep | head` always succeeds.**
- **"Falls back" is not "degrades to nothing" - read what the fallback actually produces.**
- **An audit with only pass and kill discards correct findings that carry the wrong label.**

### Correction ledger (issue #157)

- **A filter whose misses are undetectable must reject only the certain non-matches, never guess the matches.**
- **Run your own receipt before you report it as confirmation.**
- **Two halves of one feature, written in one session, can each be right and still not meet.**
- **Harden every field on a whitelist, or the whitelist is not a boundary.**
- **A test whose fixture is rejected by two code paths cannot detect either one breaking.**
- **When storage is append-only, validate the whole batch before writing any of it.**
- **Every fix lands with a check that failed first; a fresh context re-verifies the judgment ones.**
