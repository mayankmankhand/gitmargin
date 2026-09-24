---
name: share
description: Share an HTML prototype for review with gitmargin comments. Wraps the page with the comment overlay, checks it will survive the host, publishes it (a file, the author's comment-service link, GitHub Pages, or GitLab Pages) and hands back the link. Run only when the author types /gitmargin:share.
argument-hint: "[prototype.html] [where, for example: on GitHub Pages]"
disable-model-invocation: true
allowed-tools: Bash(gitmargin *) Bash(gitmargin-publish *) Bash(git remote get-url *) Bash(git rev-parse *) Bash(vercel --version) Bash(vercel whoami) Read(/${CLAUDE_SKILL_DIR}/**) Edit(/${CLAUDE_PROJECT_DIR}/.gitmargin.json) Edit(/${CLAUDE_PROJECT_DIR}/.gitignore)
---

# Share a prototype for review

The author typed `/gitmargin:share`. Your job: wrap the prototype with gitmargin's comment overlay, publish it to the right place, and hand back a link plus one sentence on who can open it. Ask as little as possible: once a host is chosen for this project on this machine, sharing again asks nothing.

**The prototype:** the HTML file named in `$ARGUMENTS`. Any other words there are the author's wishes, such as a host ("on GitHub Pages"). If no file is named, use the HTML prototype this conversation is about; if there are several candidates and nothing says which, ask which one.

Words to use with the author: "the comment tools", "the review link", "your comment service", "who can open it". Do not show them selectors, keys or JSON unless they ask.

**How to run commands.** Run each `gitmargin`, `gitmargin-publish` and `git remote` command as a Bash call of its own, exactly as written: nothing before or after it (no `cd`, `;`, `&&`, pipe, or `echo $?`). The Bash tool already reports a failing exit code, and a chained command no longer matches the author's permission rules, so it would stop and ask. Read this skill's other files with the Read tool.

**How to ask the author.** Use the AskUserQuestion tool. If it is not available, ask in one short message and stop, and end that message with the exact line to type back for each answer, for example `/gitmargin:share signup.html on the service link` or `/gitmargin:share signup.html with my service at <address>`. An answer typed that way runs this skill again with its permissions. A plain "yes" in a new message does not: Claude Code then asks the author's permission for each command and for writing `.gitmargin.json` and `.gitignore`.

## Step 1: Check the page

Run `gitmargin check <prototype> --json`, adding `--channel <channel>` once the host is known (step 2).

- A finding at level `breaks` means the page will not work for reviewers on that host. Fix it in the prototype when the fix does not change how the prototype looks or behaves (wrapping storage calls in try/catch, adding each step's `id` and `data-gm-screen`, inlining a local stylesheet or image); tell the author in one line what you changed. If a fix would change the prototype's behaviour, stop and ask.
- A `note` is information; mention it only if it matters for this review. The `modal-dialog` note matters only when the dialog is one of the prototype's steps (then a reviewer cannot comment on that step); a confirmation pop-up is fine.
- The rules behind these findings are in the `build-rules` skill.

## Step 2: Choose the host, once

Read `.gitmargin.json` at the project root with the Read tool (it may not exist). It records this machine's choice:

```json
{
  "about": "Written by the gitmargin plugin. Stays on this machine: it is in .gitignore.",
  "channel": "service-link",
  "service": "https://gitmargin-comments-example.vercel.app",
  "pages": { "remote": "origin", "branch": "gitmargin-pages" }
}
```

`channel` is `file`, `service-link`, `github-pages` or `gitlab-pages`. `service` is the author's comment service (absent for a file without shared comments). `pages` is present only for `github-pages` and `gitlab-pages`, with the same two fields.

**If the file exists, use it and ask nothing,** unless one of the "ask when" cases below applies.

**If the author asks for a different host** than the saved one (in `$ARGUMENTS` or in words), detect as for a first share on that host, ask once (the "ask when" rules apply), then rewrite `.gitmargin.json`.

**If it does not exist, detect and propose one host:**

1. `gitmargin services --json`: the comment services this machine trusts (`trusted`), whether the author secret is set (`secretSet`, never its value), and gitmargin's settings folder (`configDir`).
2. `git remote get-url origin` (no remote, or not a git repo, is fine).
3. A `github.com` remote: run `gitmargin-publish --status --folder <name> --json` (`<name>` is the prototype's file name without `.html`). Its `publish` field is `ready`, `needs-enable` or `refused`, with a `reason`.
   - `ready` or `needs-enable` (a public repo whose Pages is off or already serves `gitmargin-pages`): propose **GitHub Pages**. Read [hosts/github-pages.md](hosts/github-pages.md) for what to say.
   - `refused` because the repo is private or internal: propose the **service link**, and give the reason in one sentence (a GitHub Pages site is public to the whole internet even from a private repo).
   - `refused` for any other reason (Pages already serves something else, `gh` missing or not logged in): propose the service link and pass the reason on in one sentence.
4. A `gitlab.com` remote: run the same `gitmargin-publish --status --folder <name> --json`. Its `publish` field means the same.
   - `ready` or `needs-enable` (a private project whose Pages is set to "Only project members", or can be): propose **GitLab Pages**. Read [hosts/gitlab-pages.md](hosts/gitlab-pages.md) for what to say.
   - `refused`, or the command stops with a message instead of the JSON (`glab` missing or not logged in, git unable to read the project): propose the service link and pass the reason on in one sentence. When `glab` is missing or not logged in, also hand over the two lines in [hosts/gitlab-pages.md](hosts/gitlab-pages.md), "When glab is missing".
5. A `.vercel` folder or `vercel.json`: say that Vercel is coming in the next version of this plugin, and propose the service link.
6. Nothing else: propose the **service link** when `trusted` lists a service and `secretSet` is true. Otherwise propose **setting up a comment service now** (recommended: everyone sees the comments live, and the setup is once per author), with a **file** sent by hand as the alternative.

The service link, GitHub Pages and GitLab Pages need a comment service. When step 1 found one, use its address (with more than one, ask which). When it found none, the author picks between setting one up ([setup-service.md](setup-service.md)) and a file.

**Ask once**, with the AskUserQuestion tool: the proposal first and marked recommended, one line on who will be able to open the page, the alternatives (service link, file), and one more line: "If you already shared this prototype from another computer, paste its review link instead, and I'll keep its comments." (Without the AskUserQuestion tool, see "How to ask the author" above.)

Then write `.gitmargin.json` with the Write tool, and add these lines to the project's `.gitignore` with the Write or Edit tool (create it if missing, skip lines already there; never with a shell `cat >`, `echo >>` or heredoc, which asks the author for permission). Tell the author you did:

```gitignore
# gitmargin: wrapped copies carry the page's key, and .gitmargin.json is this machine's choice
*.gitmargin.html
*.reviewed.html
*.reviewed.*.html
.gitmargin.json
```

**Ask when (and only when):**

- there is no `.gitmargin.json` yet (the first share in this project on this machine);
- the `service` it names is not trusted on this machine (step 3 refuses it): show the address and ask whether it is theirs;
- the saved host has stopped working (a command fails in a way the host file says means that);
- this share would let more people open the page than before, for example moving from the service link to GitHub Pages;
- a step would create a repository or change a repository's settings (turning GitHub Pages on, or setting GitLab Pages to "Only project members").

**Never ask** when re-sharing the same prototype, or sharing another prototype to a host already chosen here.

## Step 3: The comment service (the service link, GitHub Pages, GitLab Pages, and a file with shared comments)

Shared comments need the author's own comment service: a small Vercel project with a Neon database, in the author's own account. gitmargin runs nothing.

- On every share that uses the service, run `gitmargin services --json` once (the first share already did, in step 2). If its `serviceCopy` is `differs`, a plugin update brought a newer service than the one deployed: follow "After a plugin update" in [setup-service.md](setup-service.md) before publishing, so the author deploys it again. `none`, `same` and `unknown` need nothing.

- The address from `.gitmargin.json` goes to the command with `--require-trusted`. That flag refuses an address this machine has never used, so a settings file copied from someone else's project can never receive the author's secret. If it refuses, show the address and ask whether it is theirs; if yes, run once more without `--require-trusted`.
- An address the author typed or confirmed in this conversation goes without the flag, and the command remembers it.
- A review link the author pasted from another computer (`<address>/p/<key>/latest`): when the same message says it is theirs (for example "I already shared this from my other computer"), that is the confirmation: attach straight away with `--service <address> --key <key>`, which keeps the prototype's comments. Ask whether the address is theirs only when the link came without saying so. Do not test the address first with `curl` or any other command: `gitmargin attach` says plainly when it cannot reach a service.
- No service yet: follow [setup-service.md](setup-service.md). It has four moments that only the author can do; hand each over exactly as written there. It calls this plugin's own folder `<plugin>`: on this machine that is `${CLAUDE_PLUGIN_ROOT}` (write it out in full; the shell has no variable for it).
- If the command says `GITMARGIN_SECRET` is not set, or `gitmargin services` says `secretSet` is false: the author has not finished setup, or set the secret after this Claude Code session started. Say so, and point them to step 7 of [setup-service.md](setup-service.md).

## Step 4: Wrap and publish

Follow the host's file. Each one gives the exact commands, the link, and what to tell the author:

- [hosts/file.md](hosts/file.md): a file sent by hand, with or without shared comments.
- [hosts/service-link.md](hosts/service-link.md): the review link served by the author's comment service.
- [hosts/github-pages.md](hosts/github-pages.md): a page on the repo's GitHub Pages site.
- [hosts/gitlab-pages.md](hosts/gitlab-pages.md): a page on a private GitLab project's Pages site, for its members only.

On the first share in a project, write `.gitmargin.json` and the `.gitignore` lines (step 2) before the first `gitmargin attach`: the wrapped copy carries the page's key.

`gitmargin attach` never changes the prototype. It writes `<name>.gitmargin.html` next to it; that copy is what reviewers get. Wrapping again after the prototype changed makes a new version: its comments start empty, and reviewers can still open older versions, with their comments, from the Version line in the comments list.

If `attach` says it "creates a NEW prototype" although the author said this prototype was already shared from another computer, stop before publishing and ask for that review link (step 3).

## Step 5: Hand back

One short message: the link (or the file to send), who can open it, and "When reviewers have commented, ask me what they said." A service link ends in `/latest`, never in a version such as `/v2-efe27b`. Nothing more unless something went wrong.
