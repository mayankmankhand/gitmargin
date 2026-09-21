# The gitmargin comment service

A small service that makes comments on a prototype **shared and live**: everyone who opens the page sees the same
comments, can reply, and sees what became of each one. You deploy it to your own Vercel account with a Neon Postgres
database. gitmargin runs nothing and holds nothing: the comments sit in a database you own.

It is optional. Without it, gitmargin works exactly as before: a reviewer's comments come back to you as a file or a
text block. A prototype only talks to a service when you attach it with `--service`.

What it answers, route by route, is in [API.md](API.md).

## Deploy it

You need a [Vercel](https://vercel.com) account (the free plan is enough) and Node 20 or newer. Two routes. The
command line is the one that has been run end to end.

### From the command line

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

> **Not tested end to end yet.** The button needs this repository to be public, and it is not. Its parameters follow
> Vercel's deploy-button reference. Until then, use the command line above.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmayankmankhand%2Fgitmargin%2Ftree%2Fmain%2Fservice&project-name=gitmargin-comments&repository-name=gitmargin-comments&env=GITMARGIN_SECRET&envDescription=A%20long%20random%20string%20only%20you%20know.%20The%20gitmargin%20commands%20send%20it%20to%20prove%20they%20are%20you.&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

The button copies this folder into a repository of your own, creates a Vercel project from it, adds a Neon database
from the Vercel Marketplace (so there is no separate database account to open), and asks for one value:

- **`GITMARGIN_SECRET`**: a long random string only you know. It is what lets the `gitmargin` commands act as the
  author. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

### After either route

The tables create themselves on first use. There is no migration step.

**Use the project's main address** (`https://<project>.vercel.app`). The longer per-deployment and per-team addresses
sit behind Vercel's own login, so a reviewer's browser cannot reach them.

Check it: `curl https://<project>.vercel.app/api/ping` answers `{"ok":true,...}`.

## Use it

```bash
export GITMARGIN_SECRET=...                                   # the value you gave the deployment
node bin/gitmargin.js attach prototype.html --service https://<project>.vercel.app
# send prototype.gitmargin.html by hand, or publish it anywhere; everyone who opens it shares one set of comments

node bin/gitmargin.js pull prototype.gitmargin.html --live    # the batch for your agent, from the service
node bin/gitmargin.js status prototype.gitmargin.html c_7f3a9b applied
node bin/gitmargin.js remove prototype.gitmargin.html c_7f3a9b
```

**Your secret only goes where you sent it.** `status`, `remove` and a bare `attach --service` read the service's
address from the attached copy, and a copy that came back from a reviewer could name any address. So the commands send
your secret only to an address you have typed yourself with `attach --service <address>` (remembered in
`~/.config/gitmargin/trusted-services.json`, which holds no secret) or named in `GITMARGIN_SERVICE`, and never over
plain `http` except to your own machine. Anything else is refused, with the reason.

The first `attach --service` prints a **prototype key**. Keep it: `--key <key>` is how another machine, or a fresh
checkout, attaches a new version of the same prototype instead of starting a new one. Later attaches from the same
folder need only `--service`.

Each attach of changed content is a new version (v1, v2, v3, numbered by the service). A new version opens with no
comments. The panel's Version line opens the older versions, each with its own comments.

## What you should know before you share a page

- **The key is the only gate.** It is written into the page. Anyone who can open the page can read and write its
  comments. If the page is public, so are its comments.
- **Stored copies are not behind your password.** The service keeps a copy of each version (the newest ten, up to 4 MB
  each) so an older version can still be opened with its comments in place. If the live page sits behind a password,
  the stored copy does not: whoever has the link to it can open it.
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

Reviewers press **Sign in with GitLab** in the comment panel and comment under their real GitLab name, and you can
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

   **Paste the bare value: no quotes, no `export`, nothing around it.** The prompt shows nothing while you paste, so
   use the Copy button on GitLab's page and paste once. A wrong ID makes GitLab itself say "unknown client"; a wrong
   Secret makes the sign-in window say "GitLab did not confirm the sign-in". The ID is the long value with no prefix;
   the Secret starts with `gloas-`. A self-managed GitLab also needs `GITMARGIN_GITLAB_URL` (default
   `https://gitlab.com`).
3. **Switch it on for a prototype:**

   ```bash
   node bin/gitmargin.js identity prototype.gitmargin.html gitlab --members your-group/full-path
   node bin/gitmargin.js identity prototype.gitmargin.html gitlab --members your-group/full-path --read members
   node bin/gitmargin.js identity prototype.gitmargin.html none
   ```

   The command prints, in plain words, who can now read and who can comment. The mode lives on the service, not in the
   page, so you can change it without attaching or publishing again.

### What a reviewer does

Press Sign in. A small window opens on GitLab; the first time, GitLab asks them to approve, and after that it does
not. The window then shows a page from **your** service naming the prototype and the person, with a short code such
as `48-21`; they check it matches the code in their panel and press **Continue**. They are signed in for 7 days on
that browser. A Guest of the group is a member: that was measured on gitlab.com, on a private group.

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
  shows a code only their own panel shows. What remains: a member who is talked into pressing Continue on a link
  someone sent them gives that person a pass for that one prototype, for at most 7 days.
- **The members rule names a group by its full path,** matched whole and in any case, never by prefix. If you rename
  or delete the group, set the rule again: a freed path can be registered by someone else.
- **A copy you shared before switching sign-in on can still read, but its comments are refused** until you attach
  and share it again, because the older overlay in it has no sign-in button. The comments are kept on that person's
  page, not lost.
- **Two people with the same display name look the same in the panel.** The GitLab username is stored and comes
  through `pull`, but the panel shows the name.

### Strict reading: `--read members`

By default sign-in limits who can comment; anyone who can open the page can still read. With `--read members`,
reading needs what commenting needs:

- The panel shows "Sign in with GitLab to see comments" and nothing else until a member signs in.
- The copies stored on the service stop being open links. Their address answers a small sign-in page that says
  nothing about the prototype; after GitLab and Continue the person lands on the page, already signed in. A stored
  copy cannot remember anyone, so a reload asks again: two presses, since GitLab no longer asks anything.
- `pull --live` sends your author secret, because reading now needs it, under the same rule as every other command:
  only to an address you typed yourself.
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

## Tests

From the repository root, `npm test` runs this folder's tests too. They use an in-process Postgres, so they need no
Neon, no Docker and no network. `vercel dev` is not needed for anything here.
