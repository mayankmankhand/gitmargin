# Host: GitLab Pages

The page is published on the project's GitLab Pages site, from a branch of its own called `gitmargin-pages`, one folder per prototype. Only the project's members can open it, after GitLab's own login. The author's own branches, working folder and build file are never touched: `gitmargin-publish` works in a temporary copy, and the branch carries its own small build file, because GitLab Pages publishes only through a build.

Only for a **private** project on gitlab.com. In a public or internal project, people outside it could read the branch, and with it the key that lets people comment.

Needs the GitLab command-line tool (`glab`) logged in to gitlab.com, the Maintainer or Owner role on the project, git able to push to it (the login the author already clones and pushes with), and the author's comment service (the comments are shared through it).

## When glab is missing

If `gitmargin-publish` says `glab` is not installed or not logged in, the author does two things once, in their own terminal (not in this chat):

1. Install glab: https://gitlab.com/gitlab-org/cli#installation
2. `glab auth login --hostname gitlab.com`

Offer the service link for now, and give the line to type afterwards: `/gitmargin:share <prototype.html> on GitLab Pages`.

## Before the first publish: what to tell the author

Run `gitmargin-publish --status --folder <name> --json` (`<name>` is the prototype's file name without `.html`) and use its answer: `publish` is `ready` (Pages is already set to "Only project members"), `needs-enable` (it is not yet) or `refused` (with a `reason`: pass it on and offer the service link instead). Say these four things, in this order:

1. **Who can open it:** only members of `<project>`, after GitLab's login, and anyone who can open it can comment. A Guest is a member.
2. **What it changes:** it publishes from a new `gitmargin-pages` branch, and the author's own branches and build file stay as they are. When `publish` is `needs-enable`, also: it sets `<project>`'s Pages to "Only project members".
3. **What stays:** the page carries the key that lets people comment. The key stays in the `gitmargin-pages` branch's history, and the author's comment service keeps a copy of each version, which anyone holding the key can open without GitLab's login. Only people who can open the page or read the branch see the key.
4. **The five-person limit:** on gitlab.com's free plan, a private group can have at most five people, the author and Guests included, and more makes it read-only. A private project in the author's own namespace has no such limit.

If the `reason` says Pages already serves a site, or that the default branch's build file has a Pages job, do not touch either: offer the service link instead.

## Publish

Wrap, then publish the wrapped copy. `<name>` is the prototype's file name without `.html`.

```bash
gitmargin attach <prototype.html> --service <address>
gitmargin-publish <name>.gitmargin.html --folder <name> --enable
```

Run the `gitmargin-publish` call with the Bash tool's `timeout` set to `420000`. It follows GitLab's build for up to five minutes, and the tool stops a command after two unless told otherwise.

Use `--enable` only on the publish the author just agreed to, when `publish` was `needs-enable`. Every later publish leaves it out.

stdout is the page's link. stderr ends with how long GitLab took, for example `GitLab built the page 48 seconds after the push`: pass the seconds on.

- **Still building:** a first publish whose build has not finished exits 2 without a link and says `Run gitmargin-publish --status --folder <name> in a minute for the link`. Tell the author the page is on its way, then run `gitmargin-publish --status --folder <name> --json` and hand over its `link`. If `link` is still empty, say so and suggest trying again in a minute. If the message says the build is waiting for a runner and shared runners are off, waiting will not help: tell the author the project needs a runner (shared runners switched on in the project's CI/CD settings, or a runner of its own), then share again.
- **Link, but not built yet:** a republish can exit 0 with the link and a line saying GitLab is still building (or that it is not waiting). Hand over the link and that line: reviewers see the previous version, or a 404 for a first folder, until the build finishes. There are no seconds to pass on.
- **Build refused:** exits 2 with GitLab's reason and the pipeline's address. Relay both. If the message says a new account may have to verify itself, tell the author to open that address, verify the account there if GitLab asks (a phone number or a card), then share again: sharing the same page again starts GitLab's build again.

## Tell the author

- The link, and: "Only members of `<project>` can open this page, after GitLab's login. Anyone who can open it can comment."
- How many seconds the build took.
- A reviewer who is not a member yet needs adding to the project or its group; a Guest is enough.

## Sharing again

The same two commands, without `--enable`. The link stays the same; the new version's comments start empty, and older versions stay one click away from the Version line. Publishing the same bytes again changes nothing and says so.

## When it stops working

`gitmargin-publish` exits with a plain message for each case. Relay it and the one thing the author can do:

- The project is public or internal: share with the service link or a file.
- Pages already serves a site, or the default branch's build file has a Pages job: leave it alone, and use the service link.
- CI/CD is off for the project: switch it on in the project's settings, or use the service link.
- Not a Maintainer or Owner: ask one to publish, or use the service link.
- `glab` missing or not logged in: the two lines under "When glab is missing".
- git could not read the project: check that `git fetch` works in this project; git uses its own login for gitlab.com, not glab's.
- The push was refused: usually the author cannot push to the project.
- The build waits for a runner that never comes: shared runners are off and the project has none of its own; the author switches shared runners on in the project's CI/CD settings, or adds a runner.
