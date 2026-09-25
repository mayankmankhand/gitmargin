# The gitmargin comment service

A small service that makes comments on a prototype **shared and live**: everyone who opens the page sees the same
comments, can reply, and sees what became of each one. You deploy it to your own Vercel account with a Neon Postgres
database. gitmargin runs nothing and holds nothing: the comments sit in a database you own.

It is optional. Without it, gitmargin works exactly as before: a reviewer's comments come back to you as a file or a
text block. A prototype only talks to a service when you attach it with `--service`.

What it answers, route by route, is in [API.md](API.md).

**If you use Claude Code,** the gitmargin plugin gives you one line to run in your own terminal the first time you share
a prototype, and that line sets this service up: see [docs/claude-code.md](../docs/claude-code.md). This page is the same
command from a clone, the by-hand route, and the reference behind them.

## Deploy it

You need a [Vercel](https://vercel.com) account (the free plan is enough) and Node 20 or newer. Three routes. The
command line by hand has been run end to end on a real account; the one command runs the same steps for you.

### With one command

From this repository, in a terminal of your own (not inside Claude Code: it refuses to run there):

```bash
node plugin/scripts/setup.mjs
```

It does everything below for you: Vercel's login if needed, the project, the Neon database, a random secret kept in
`~/.config/gitmargin/secret` (only you can read it; it is never shown), the deploy, and a check that the service proves
it holds that secret. Run it again after pulling a newer version of the service: it redeploys and asks only which
account. It is the same command the Claude Code plugin hands its authors.

### From the command line, by hand

```bash
npm install --global vercel      # Vercel's command-line tool, once
vercel login                     # once

cd service
vercel link --yes --project gitmargin-comments     # creates the project; pick any name that is free
vercel integration add neon --plan free_v3 -m region=iad1 -m auth=false
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # make a secret; keep it
vercel env add GITMARGIN_SECRET production --sensitive     # paste that secret when asked
vercel deploy --prod
```

Vercel asks you to accept Neon's terms in the browser the first time; that step cannot be done for you. The Neon step
also drops a few guide files for AI tools into this folder (`.agents/`, `.claude/`, `skills-lock.json`); they are
ignored by git and by the deploy, and are safe to delete.

### Or with the button

> **Not walked end to end yet.** Its parameters follow Vercel's deploy-button reference. The command line above is
> the route that has been run for real.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmayankmankhand%2Fgitmargin%2Ftree%2Fmain%2Fservice&project-name=gitmargin-comments&repository-name=gitmargin-comments&env=GITMARGIN_SECRET&envDescription=A%20long%20random%20string%20only%20you%20know%2C%20at%20least%2032%20characters.%20The%20gitmargin%20commands%20send%20it%20to%20prove%20they%20are%20you.&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

The button copies this folder into a repository of your own, creates a Vercel project from it, adds a Neon database
from the Vercel Marketplace (so there is no separate database account to open), and asks for one value:

- **`GITMARGIN_SECRET`**: a long random string only you know, at least 32 characters (the commands refuse a shorter
  one). It is what lets the `gitmargin` commands act as the author. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

### After any route

The tables create themselves on first use. There is no migration step.

**Use the project's main address** (`https://<project>.vercel.app`). The longer per-deployment and per-team addresses
sit behind Vercel's own login, so a reviewer's browser cannot reach them.

Check it: `curl https://<project>.vercel.app/api/ping` answers `{"ok":true,...}`.

## Use it

```bash
export GITMARGIN_SECRET=...     # the value you gave the deployment, unless it is in ~/.config/gitmargin/secret
node bin/gitmargin.js attach prototype.html --service https://<project>.vercel.app
# send prototype.gitmargin.html by hand, or publish it anywhere; everyone who opens it shares one set of comments

node bin/gitmargin.js pull prototype.gitmargin.html --live    # the batch for your agent, from the service
node bin/gitmargin.js status prototype.gitmargin.html c_7f3a9b applied
node bin/gitmargin.js remove prototype.gitmargin.html c_7f3a9b
```

**Your secret only goes to a service that proves it already holds it.** The commands read the secret from
`GITMARGIN_SECRET`, or when that is not set, from `~/.config/gitmargin/secret` (a file only you can read). An address
can come from anywhere: a copy that came back from a reviewer, a settings file in a project you cloned, or a command an
agent typed for you. So before any command sends your secret, it asks the service to answer a fresh challenge with a
value only a holder of the same secret can compute, bound to the address the command dialed (`POST /api/prove`,
[API.md](API.md)). It sends the secret only when the answer is right, and never over plain `http` except to your own
machine. A wrong answer, a redirect, or an older deployment without the proof is refused, with nothing sent. Addresses
that proved themselves are listed in `~/.config/gitmargin/trusted-services.json` (no secret in it), which `services`
shows; the list itself unlocks nothing.

If you ever change the secret, the old one keeps working on older deployment addresses of the same project (Vercel
keeps each deployment's settings); those sit behind Vercel's own login. And if you point a custom domain at the service,
remove it from the project before you let the domain lapse: whoever registers it next could answer for it.

The first `attach --service` prints a **prototype key**. Keep it: `--key <key>` is how another machine, or a fresh
checkout, attaches a new version of the same prototype instead of starting a new one. Later attaches from the same
folder need only `--service`.

Each attach of changed content is a new version (v1, v2, v3, numbered by the service). A new version opens with no
comments. The Version line in the comments sheet opens the older versions, each with its own comments.

## What you should know before you share a page

- **The key is the only gate.** It is written into the page. Anyone who can open the page can read and write its
  comments. If the page is public, so are its comments.
- **Stored copies are not behind your password.** The service keeps a copy of each version (the newest ten, up to 4 MB
  each) so an older version can still be opened with its comments in place. If the live page sits behind a password,
  the stored copy does not: whoever has the link to it can open it. On Vercel, same-project mode (below) puts the page,
  its stored copies and its comments behind one login.
- **Names are typed, not verified, unless you switch sign-in on.** Without sign-in, "your own" comment means
  "written in this browser". With it (next section), a comment carries the person's GitLab name and belongs to them
  on any computer.
- **A stored page cannot remember you.** It is served sandboxed, so a commenter's name and unsent comments last for
  that tab only.
- **Limits:** 4,000 characters per comment, 500 comments and 50 versions per prototype, 60 writes a minute. You can
  remove anyone's comment, so a prototype that fills up with comments is recoverable. The version limit is not: at 50
  versions, start a new prototype by attaching from a folder with no previous copy, without `--key`.

Everything above describes a prototype with sign-in off, which is the default and never changes unless you change
it.

## Sign-in with GitLab (optional, per prototype)

Reviewers press **Sign in with GitLab** under the identity chip in the overlay's toolbar and comment under their real GitLab name, and you can
limit commenting, and reading too, to the members of one GitLab group. It works wherever the page lives: a file on
disk, the service link, GitLab Pages, any host. The design and its reasons are in
[docs/part-2-design.md](../docs/part-2-design.md); the contract is in [API.md](API.md).

### Set it up, once per service

1. **Register an application on GitLab.** Signed in to GitLab, open `/-/user_settings/applications` (avatar, Edit
   profile, Access, Applications). Name it anything. Redirect URI: `https://<project>.vercel.app/auth/callback`, the
   project's main address. Tick **Confidential**. Tick the one scope **`openid`** and nothing else: that is what keeps
   GitLab's permission screen down to "verify who you are". Save. GitLab shows an **Application ID** and a **Secret**.
2. **Give both to the deployment**, as sensitive values, then redeploy. A changed value is only picked up by a new
   deployment.

   ```bash
   vercel env add GITMARGIN_GITLAB_ID production --sensitive
   vercel env add GITMARGIN_GITLAB_SECRET production --sensitive
   vercel deploy --prod
   ```

   **Paste the bare value: no quotes, no `export`, nothing around it.** The prompt shows only a `*` per character
   (Vercel CLI 59), so use the Copy button on GitLab's page and paste once. Run it in your own terminal: the command
   has to ask you for the value. A wrong ID makes GitLab itself say "unknown client"; a wrong
   Secret makes the sign-in window say "GitLab did not confirm the sign-in". The ID is the long value with no prefix;
   the Secret starts with `gloas-`. A self-managed GitLab also needs `GITMARGIN_GITLAB_URL` (default
   `https://gitlab.com`).
3. **Switch it on for a prototype:**

   ```bash
   node bin/gitmargin.js identity prototype.gitmargin.html gitlab --members your-group/full-path
   node bin/gitmargin.js identity prototype.gitmargin.html gitlab --members your-group/full-path --read members
   node bin/gitmargin.js identity prototype.gitmargin.html none
   ```

   The command prints, in plain words, who can now read and who can comment. **Every run replaces the whole setting:**
   leave out `--read members` and reading goes back to open, leave out `--members` and anyone with a GitLab account may
   comment, so repeat every flag you still want. The mode lives on the service, not in the page, so you can change it
   without attaching or publishing again.

### What a reviewer does

Press Sign in. A small window opens on GitLab; the first time, GitLab asks them to approve, and after that it does
not. The window then shows a page from **your** service naming the prototype and the person, with a short code such
as `48-21`; they check it matches the code the overlay shows them and press **Continue**. On a page with a web address they
stay signed in for 7 days in that browser. On a copy stored on the service, on a file opened from disk, and on
GitHub Pages (where every site of one owner shares one browser storage; GitLab Pages too, unless the project has a
unique domain), the sign-in lasts for that tab only: those pages have no storage of their own that other pages cannot read, so the
next visit is two presses again (GitLab asks nothing the second time). A Guest of the group is a member: that was
measured on gitlab.com, on a private group.

### What you should know before you switch it on

- **A pass is what a signed-in browser holds.** It is random, the service stores only its hash, it works for that one
  prototype and for one thing, commenting there, and it lasts 7 days. GitLab's own tokens are used once, inside the
  sign-in, and thrown away; the Secret never leaves the service.
- **Removing someone is two steps.** Removing them from the GitLab group stops their next sign-in. Running the
  `identity` command again, with the same settings, ends every pass for that prototype now, theirs included. Everyone
  else signs in again with two presses.
- **Why the Continue page exists, and the limit it leaves.** GitLab skips its approval after the first time, so
  without that page someone holding the page key could send a member a sign-in link and collect a pass in the
  member's name from one silent click. With it, nothing is granted until the member presses Continue on a page that
  shows a code only their own page shows. What remains: a member who is talked into pressing Continue on a link
  someone sent them gives that person a pass for that one prototype, for at most 7 days.
- **The members rule names a group by its full path,** matched whole and in any case, never by prefix. If you rename
  or delete the group, set the rule again: a freed path can be registered by someone else.
- **A copy you shared before switching sign-in on has no sign-in button,** because its overlay is older, so its new
  comments are refused until you attach again and share the new copy. Attaching again from the same folder (or with
  `--key`) keeps the same key and version, and the `identity` command says so when the copy you point it at is one of
  these. Until then, with the default reading rule, the old copy still shows comments and says "A comment could not be
  shared. It is saved here." With `--read members` it shows none, and says "The comment service does not know this
  prototype. Comments are saved here only.", which is misleading: the service has the prototype, the old page just
  cannot sign in. Either way the person's own comments stay on their page, not lost.
- **Two people with the same display name are told apart by their handle.** The GitLab username is stored, comes
  through `pull`, is shown after the name in every thread, and chooses the colour of the person's pin, so two
  "Mayank Mankhand"s get two colours.

### Strict reading: `--read members`

By default sign-in limits who can comment; anyone who can open the page can still read. With `--read members`,
reading needs what commenting needs:

- The overlay shows "Sign in with GitLab to see comments" under the identity chip and no comments until a member signs in.
- The copies stored on the service stop being open links. Their address answers a small sign-in page that says
  nothing about the prototype; after GitLab and Continue the person lands on the page, already signed in. A stored
  copy cannot remember anyone, so a reload asks again: two presses, since GitLab no longer asks anything.
- `pull --live` sends your author secret, because reading now needs it, under the same rule as every other command:
  only to a service that has proved it holds it.
- **What it does not do:** it cannot take back what someone already has. Comments a member's browser fetched while
  they were a member stay in that browser, and a page they saved is theirs. The page on your own host is still
  guarded only by your host.

### When a sign-in fails

| The small window shows | It means | Do |
|---|---|---|
| GitLab's own page: "unknown client" | the Application ID is wrong | add `GITMARGIN_GITLAB_ID` again, bare, and redeploy |
| "GitLab did not confirm the sign-in" | the Secret is wrong, or GitLab was unreachable | renew the Secret on GitLab, add it again, redeploy |
| "This sign-in is unknown, was already used, or took longer than 10 minutes" | the attempt was reused or too slow | close it and press Sign in again |
| "only takes comments from members of ..." | that account is not in the group | expected for an outsider; otherwise check the invite was accepted |
| "not set up for GitLab sign-in yet" | one of the two values is missing | `vercel env ls production` should list both |

The reason is in the function's log by name, never with a secret in it: `vercel logs <project>.vercel.app --since 30m`
and look for `token call refused:`. `invalid_client` is a wrong ID or Secret; `invalid_grant` is a reused attempt or a
callback address that is not registered on the application.

## Sign-in with GitHub (optional, per prototype)

> **Walked on the real github.com on 2026-09-23**, with a public App, a file on disk, the service link and a GitHub
> Pages page, and the repository rule both ways. GitHub renames form fields from time to time: if a label below is
> not on the page, look for the nearest one.

The same sign-in with GitHub in place of GitLab: reviewers press **Sign in with GitHub**, approve GitHub's screen the
first time, press **Continue** on your service's confirm page, and comment under their GitHub name. "What a reviewer
does" and "Strict reading" above hold with GitHub for GitLab, and so does "What you should know", except its two
bullets about a GitLab group. GitHub has no groups: with no rule, anyone with a GitHub account who can open the page
may comment, and the most you can do to stop one person is run the `identity` command again, which ends every pass
and which they can undo by signing in again. One service can hold GitLab prototypes and GitHub prototypes side by
side; each prototype has one mode.

### Set it up, once per service

1. **Create a GitHub App**, in the account that owns the repositories you work in: your own account, or your
   organization (an organization can own an App). Signed in to GitHub, open Settings, Developer settings, GitHub Apps,
   **New GitHub App** (for your own account that is `https://github.com/settings/apps/new`). Fill in:

   | Field | Value |
   |---|---|
   | GitHub App name | anything free on GitHub, such as `gitmargin-comments-<your name>` |
   | Homepage URL | `https://<project>.vercel.app` |
   | Redirect URI (under "Identifying and authorizing users") | `https://<project>.vercel.app/auth/callback` |
   | Allow wildcard matching | leave unticked: sign-in codes go to this one address only |
   | Expire user authorization tokens | leave ticked |
   | Request user authorization (OAuth) during installation | leave unticked |
   | Enable Device Flow | leave unticked |
   | Webhook, Active | **untick** it (the App needs no events) |
   | Permissions | leave every one at **No access** |
   | Where can this GitHub App be installed? | **Any account** |

   **Create GitHub App.** Its page shows a **Client ID** (it starts with `Iv`). Under Client secrets press **Generate a
   new client secret** and copy it at once: GitHub shows it only this one time. With no permissions, GitHub's screen
   asks reviewers only to let the App verify who they are. That is the point: a frightening permission screen is the
   login friction that most likely sank GitLab's own Visual Reviews.

   **Why Any account:** GitHub lets only the account that owns a private App ("Only on this account") sign in with it,
   or, for an App an organization owns, only that organization's members. Every other reviewer would be turned away.
   Any account lets anyone sign in, and lets anyone install your App on their own account, which gives them nothing:
   the service only ever asks GitHub who a reviewer is. For a team whose reviewers all belong to one GitHub
   organization, GitHub's documentation describes the other way round: an App the organization owns, left at Only on
   this account, admits only its members, with no permission at all (not tested here).
2. **Give both to the deployment**, as sensitive values, then redeploy:

   ```bash
   vercel env add GITMARGIN_GITHUB_ID production --sensitive
   vercel env add GITMARGIN_GITHUB_SECRET production --sensitive
   vercel deploy --prod
   ```

   **Paste the bare value**, as with GitLab: no quotes, nothing around it. A GitHub Enterprise Server also needs
   `GITMARGIN_GITHUB_URL` (default `https://github.com`).
3. **Switch it on for a prototype:**

   ```bash
   node bin/gitmargin.js identity prototype.gitmargin.html github
   node bin/gitmargin.js identity prototype.gitmargin.html github --read members
   ```

   Anyone with a GitHub account who can open the page may then comment, under their GitHub name.

### Only people who can open one repository: `--members owner/repo`

GitHub has no groups the way GitLab does, so the GitHub rule names a repository: `--members your-org/your-repo` lets
in only the people GitHub gives explicit access to it (its owner, its collaborators, and people with access through
the organization). A public repository does not let everyone in: reading it is not explicit access.

It needs two things from your GitHub App, and one of them changes what reviewers see:

1. **Give the App one permission first:** Permissions and events, Repository permissions, **Metadata: Read-only**.
   It is what lets the service list which repositories a reviewer can open. GitHub then shows reviewers more on its
   permission screen than "verify your identity" (it says the App can act on their behalf, even though this App can do
   nothing but read that list). Decide whether your reviewers will accept that screen before you switch the rule on.
2. **Then install the App on that repository.** On the App's page, Install App, your account or organization, **Only
   select repositories**, pick the repository. The service can only check repositories the App is installed on.
   If the App was already installed when you added the permission, GitHub keeps the old permissions until you accept
   the new one: your Settings, Applications, Installed GitHub Apps, the App, and accept the request (for an App
   installed on an organization, the organization's own settings, GitHub Apps). Until then
   reviewers see "cannot check who can open ...".

```bash
node bin/gitmargin.js identity prototype.gitmargin.html github --members your-org/your-repo
```

The command reminds you of both. The check is made at each sign-in, with the reviewer's own token, and thrown away.
If the App lacks the permission, reviewers see "The author's GitHub App cannot check who can open ..." rather than a
wrong "not a member". **If every reviewer is told their account has no access**, the App is not installed on that
repository, or the rule names it wrongly: install it, or check the `owner/repo` spelling. With the rule on, removing
someone means taking away their access to the repository, then running the command again, which ends every pass. The
rule holds names, not permanent ids: after renaming the repository or its owner, run the command again.

**GitHub allows one free personal account per person** (its terms of service), so testing "a second reviewer" alone
means a second browser that stays signed out, or a second real person, not a second account of your own.

### When a GitHub sign-in fails

| The small window shows | It means | Do |
|---|---|---|
| GitHub's own page: "The redirect_uri is not associated with this application" | the Redirect URI on the App is not `https://<project>.vercel.app/auth/callback` | fix it on the App's page; no redeploy needed |
| GitHub's own 404 | the Client ID is wrong | add `GITMARGIN_GITHUB_ID` again, bare, and redeploy |
| "GitHub did not confirm the sign-in" | the client secret is wrong, GitHub was unreachable, or (for one reviewer only) their GitHub email is not verified | generate a new client secret, add it again, redeploy; for one reviewer, they verify their email on GitHub |
| "not set up for GitHub sign-in yet" | one of the two values is missing | `vercel env ls production` should list both |
| "This sign-in is unknown, was already used, or took longer than 10 minutes." | the attempt was reused or too slow | close the small window and press Sign in again |

In the function's log (`vercel logs <project>.vercel.app --since 30m`), `token call refused: incorrect_client_credentials`
is a wrong secret, `token call refused: bad_verification_code` a reused or expired attempt, and
`token call refused: unverified_user_email` a reviewer whose primary GitHub email is not verified.

## Same-project mode on Vercel (the page and its comments behind one login)

> **Walked on a real Vercel project (free Hobby plan) on 2026-09-23,** with these steps, a reviewer signed in to
> Vercel and a reviewer on the share link. The tests also run behind a stand-in for Vercel's login wall.

Use it when the prototype must be private and the people who review it can pass Vercel's own protection. It is a
**second deployment of this same service**, switched to serve one prototype as its own site. The page and its comment
routes are then one Vercel project behind one login: someone who has not passed Vercel's protection gets Vercel's
login and nothing else, not the page, not the comments, not even an answer from the service. The page key stays in
the page as a label. Everything above still applies to your ordinary comment service, which this does not touch.

**Who can get past Vercel's protection.** On the free Hobby plan: you, one outside Vercel user you approve, and anyone
holding your account's one share link. On paid plans, your team, or a password (a paid add-on). Choose **All
Deployments** in the protection settings: it covers the project's main address too, and has been free on every plan
since 2026-09-09. The default, Standard Protection, leaves the main address open.

### Set it up, once per prototype

Run this from the folder you cloned gitmargin into. It copies the service into a folder of its own, so this project
can never be deployed over your main comment service:

```bash
cp -r service ~/gitmargin-review-<prototype> && cd ~/gitmargin-review-<prototype>
rm -rf .vercel .env.local
vercel link --yes --project <prototype>-review          # a new project, named for the prototype
vercel integration add neon --plan free_v3 -m region=iad1 -m auth=false   # its own database
mkdir -p ~/.config/gitmargin
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" > ~/.config/gitmargin/secret-<prototype>
chmod 600 ~/.config/gitmargin/secret-<prototype>                  # a new author secret, never shown
vercel env add GITMARGIN_SECRET production --sensitive < ~/.config/gitmargin/secret-<prototype>
printf 1 | vercel env add GITMARGIN_SAME_PROJECT production     # exactly 1, no questions asked
vercel deploy --prod --yes
```

**Its own database, on purpose.** Connecting your main service's database here would let that open service answer
for the same key, outside Vercel's protection.

Then, in Vercel: the project, Settings, **Deployment Protection**:

1. **Vercel Authentication:** on, **All Deployments**.
2. **Protection Bypass for Automation:** press **Create**, give it a label, and save it. It must then show in the
   list: copy it from there (32 characters). If the list is empty nothing was saved, and what you copied is not a
   bypass: the commands will say Vercel's protection refused it. It is how the `gitmargin` commands get through, and
   it opens every deployment of this project, so keep it like the author secret.

Check it: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://<prototype>-review.vercel.app/api/ping` must
answer `302` to `https://vercel.com/sso-api...` (or a `401` or `403`: Vercel's login), never `200`.

### Publish, and every new version

Back in the folder you cloned gitmargin into (the setup above left you in the copy):

```bash
export GITMARGIN_SECRET="$(cat ~/.config/gitmargin/secret-<prototype>)"
export GITMARGIN_SERVICE=https://<prototype>-review.vercel.app
export GITMARGIN_VERCEL_BYPASS=...   # this project's bypass for automation
node bin/gitmargin.js attach prototype.html --service https://<prototype>-review.vercel.app
```

A new version is the same `attach` again: no redeploy. Its closing lines are written for this mode: reviewers get the
address below, not the file, and Vercel's login is the gate. Keep the file for yourself: `pull --live`, `status`,
`remove` and `identity` read the address and key from it, and work the same way with the three values set. The bypass goes only to the address named in `GITMARGIN_SERVICE`, exactly, and never into
the page: an address typed on a command line proves nothing, since an agent may have typed it. It also carries the
proof of trust past Vercel's login; the author secret still waits for the proof. Without it, the commands stop and say
the address is behind Vercel's protection.

### What reviewers do

Send them `https://<prototype>-review.vercel.app/`, or a share link: on the production deployment's page, **Share**,
"Anyone with the link". Someone with the share link needs no Vercel account; anyone else passes Vercel's login.
Either way they land on the prototype and comment as on any shared page. On Hobby you can have one share link at a
time, across all your projects, so making this one revokes any other (Vercel warns first). Switch it back to "Only
people with access" when the review is over.

### What you should know

- **The page must be under 4 MB.** Reviewers open only the copy stored on the service, and a larger page is
  registered with no copy, so the address answers "not found" until a smaller version is attached; `attach` says the
  page is too large, but its "comments are shared as usual" does not hold here.
- **One prototype per project.** Attaching a different page from another folder is refused, with the key of the one
  it holds; `--key <that key>` publishes a new version of it instead.
- **Its pages are not locked down the way stored copies are.** The service serves the prototype as its own site, so
  its calls carry Vercel's login; the prototype shares the address only with pages you attached here. With sign-in on, a hostile
  script inside the prototype could press Continue for a reviewer, as it can already read the pass the overlay holds.
- **Sign-in, if you switch it on, is set up again here.** This is its own Vercel project, so your main service's
  GitLab or GitHub values do not carry over, and `identity` refuses until they are added: follow "Set it up, once per
  service" above from this folder, with `https://<prototype>-review.vercel.app/auth/callback` as the callback (GitHub
  calls that field Redirect URI). It then works from that main address only: the provider sends people back to the
  one callback address you registered.
- **The page opens from whichever address the reviewer used,** the main address, a deployment address or a share
  link, and its comments go to that same address, where the reviewer's Vercel login is.

## Tests

From the repository root, `npm test` runs this folder's tests too. They use an in-process Postgres, so they need no
Neon, no Docker and no network. `vercel dev` is not needed for anything here.
