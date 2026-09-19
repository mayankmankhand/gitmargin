# The gitmargin comment service

A small service that makes comments on a prototype **shared and live**: everyone who opens the page sees the same
comments, can reply, and sees what became of each one. You deploy it to your own Vercel account with a Neon Postgres
database. gitmargin runs nothing and holds nothing: the comments sit in a database you own.

It is optional. Without it, gitmargin works exactly as before: a reviewer's comments come back to you as a file or a
text block. A prototype only talks to a service when you attach it with `--service`.

What it answers, route by route, is in [API.md](API.md).

## Deploy it

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmayankmankhand%2Fgitmargin%2Ftree%2Fmain%2Fservice&project-name=gitmargin-comments&repository-name=gitmargin-comments&env=GITMARGIN_SECRET&envDescription=A%20long%20random%20string%20only%20you%20know.%20The%20gitmargin%20commands%20send%20it%20to%20prove%20they%20are%20you.&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

The button copies this folder into a repository of your own, creates a Vercel project from it, adds a Neon database
from the Vercel Marketplace (so there is no separate database account to open), and asks for one value:

- **`GITMARGIN_SECRET`**: a long random string only you know. It is what lets the `gitmargin` commands act as the
  author. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

The tables create themselves on first use. There is no migration step.

> The button has not been tested end to end yet: it needs this repository to be public, and it is not. Its parameters
> follow Vercel's deploy-button reference. The command-line route below is the one that has been run.

### Or from the command line

```bash
cd service
vercel link --yes --project gitmargin-comments     # creates the project
vercel integration add neon --plan free_v3 -m region=iad1 -m auth=false
vercel env add GITMARGIN_SECRET production --sensitive
vercel deploy --prod
```

Vercel asks you to accept Neon's terms in the browser the first time; that step cannot be done for you.

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
- **Names are typed, not verified.** There is no sign-in. "Your own" comment means "written in this browser".
- **A stored page cannot remember you.** It is served sandboxed, so a commenter's name and unsent comments last for
  that tab only.
- **Limits:** 4,000 characters per comment, 500 comments and 50 versions per prototype, 60 writes a minute. You can
  remove anyone's comment, so a prototype that fills up with comments is recoverable. The version limit is not: at 50
  versions, start a new prototype by attaching from a folder with no previous copy, without `--key`.

Sign-in is separate, later work. This service is the no-sign-in mode.

## Tests

From the repository root, `npm test` runs this folder's tests too. They use an in-process Postgres, so they need no
Neon, no Docker and no network. `vercel dev` is not needed for anything here.
