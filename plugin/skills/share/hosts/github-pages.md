# Host: GitHub Pages

The page is published on the repository's GitHub Pages site, from a branch of its own called `gitmargin-pages`, one folder per prototype: `https://<owner>.github.io/<repo>/<name>/`. The author's own branches and working folder are never touched: `gitmargin-publish` works in a temporary copy.

Only for a **public** repository. A GitHub Pages site is public to the whole internet even when the repository is private, and a private repository needs a paid plan for it.

Needs the GitHub command-line tool (`gh`), logged in (`gh auth login`), and the author's comment service (the comments are shared through it).

## Before the first publish: what to tell the author

Run `gitmargin-publish --status --folder <name> --json` (`<name>` is the prototype's file name without `.html`) and use its answer in the confirmation: `publish` is `ready` (Pages already serves `gitmargin-pages`), `needs-enable` (Pages is off) or `refused` (with a `reason`: pass it on and offer the service link instead). Say, in this order:

1. **Who can open it:** anyone on the internet, and anyone who opens it can comment.
2. **What it changes:** it turns on GitHub Pages for `<owner>/<repo>`, published from a new `gitmargin-pages` branch (only when `publish` is `needs-enable`).
3. **What stays:** the page carries the key that lets people comment, and that key stays in the `gitmargin-pages` branch's history even if the page is later removed. There is no way yet to switch a key off.

If Pages already serves a different branch or folder, do not touch it: offer the service link instead.

## Publish

Wrap, then publish the wrapped copy. `<name>` is the prototype's file name without `.html`.

```bash
gitmargin attach <prototype.html> --service <address>
gitmargin-publish <name>.gitmargin.html --folder <name> --enable
```

Use `--enable` only on the publish the author just agreed to, when `publish` was `needs-enable`. Every later publish leaves it out.

stdout is the page's link. The first build of a new GitHub Pages site can take a minute or two, and the link shows GitHub's 404 page until it finishes; `gitmargin-publish` follows the build for up to two minutes and says on stderr whether it finished. Publishing the same bytes again changes nothing and says so. If GitHub reports the build failed, the command exits 2 without a link: relay its message.

## Tell the author

- The link, and: "Anyone on the internet can open this page and comment."
- It can take a minute or two to appear the first time.

## Sharing again

The same two commands, without `--enable`. The link stays the same; the new version's comments start empty, and older versions stay one click away from the Version line.

## When it stops working

`gitmargin-publish` exits with a plain message for each case: the repository is not public, Pages serves another source, Pages is off (needs `--enable` and the author's yes), `gh` is missing or not logged in, the push was refused. Relay the message and the one thing the author can do about it. A refused push usually means the author lacks write access to the repository.
