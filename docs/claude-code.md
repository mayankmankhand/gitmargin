# gitmargin in Claude Code

You build HTML prototypes with Claude Code. gitmargin lets people comment on them, pinned to the spot and the step they were on, and brings those comments back to Claude so it can apply them. This page is everything you need, from installing it to Claude applying the first round of comments.

It comes as a Claude Code plugin. Once it is installed you do three things:

1. **Ask Claude to build a prototype**, as you do today. The plugin quietly gives Claude a few building rules, so every comment stays on the step it was made on.
2. **Type `/gitmargin:share`.** Claude wraps the page with the comment tools, checks it will work where it is going, publishes it, and hands you a link.
3. **Ask "what did reviewers say?"** Claude reads the comments, applies them to the prototype, and marks each one so reviewers can see what became of it.

Reviewers install nothing. They open a link or a file, click **Comment**, click what they want to talk about, and type what they expected.

## What you need

- **Claude Code.**
- **Node.js 18 or newer** (`node --version`). The plugin's commands run on Node, and so does Vercel's command-line tool.
- **Git, and access to this repository while it is private.** Claude Code installs the plugin with your own git login for github.com. The simplest way: install GitHub's command-line tool `gh`, then run `gh auth login` and `gh auth setup-git` once.
- **For comments everyone sees live** (the service link, GitHub Pages and GitLab Pages below): a free [Vercel](https://vercel.com) account. You set up your comment service in it with one command, the first time; see [Your comment service](#your-comment-service-once).
- **For GitHub Pages:** a public GitHub repository, and `gh` logged in.
- **For GitLab Pages:** a private project on gitlab.com where you are a Maintainer or Owner, and GitLab's command-line tool `glab` ([install it](https://gitlab.com/gitlab-org/cli#installation)) logged in once with `glab auth login --hostname gitlab.com`. Each reviewer needs a gitlab.com account that is a member of the project or its group.

## Install it (once per machine)

In Claude Code, type:

```text
/plugin marketplace add https://github.com/mayankmankhand/gitmargin.git
/plugin install gitmargin@gitmargin
```

Use the `https://` address as written: the short `owner/repo` form clones over SSH, which needs an SSH key. When the plugin is installed, Claude Code's shell has two new commands, `gitmargin` and `gitmargin-publish`, and Claude knows the three skills below. Updates arrive with `/plugin update gitmargin@gitmargin`. After an update, the next `/gitmargin:share` checks whether your comment service needs deploying again, and if it does, gives you the one line to run.

## 1. Build a prototype

Ask Claude for a prototype the way you always do: "build a three-step signup flow as one HTML file". The plugin's **build rules** tell Claude how to build it so the comments land well. In short: one self-contained file; each step in its own wrapper with a name; steps hidden with `hidden` and switched by a script; no step inside a pop-up dialog; browser storage used carefully; every step reachable from a clickable step list, without typing made-up data first. Claude runs `gitmargin check` at the end to catch anything that would break. The first time in a project, Claude Code asks your permission to run `gitmargin check`: see [Permission prompts](#permission-prompts) below.

Why rules at all? Measured on seventeen kinds of prototype: most pages work as they are, but a few common habits break commenting without any warning. A step that React draws into the same area as every other step, with no heading or name of its own, lets a comment's pin jump onto the next step's lookalike button. Steps with no heading of their own all get the same name. Separate CSS or image files go missing once the page is shared. The rules avoid all of that, and cost nothing when a page is never reviewed.

## 2. Share it: `/gitmargin:share`

Type `/gitmargin:share`, or `/gitmargin:share signup.html` to name the file.

**The first time in a project**, Claude looks at where the project lives and proposes one place to publish, says who will be able to open the page, and asks you once:

| Where the page lives | Who can open it | Good for |
|---|---|---|
| **A file you send** | whoever you send it to | a quick review; no account needed |
| **The service link** | anyone who has the link | most reviews; no host needed, the link never changes |
| **GitHub Pages** (public repositories only) | anyone on the internet | a public project that already lives on GitHub |
| **GitLab Pages** (private projects on gitlab.com) | the project's members, after GitLab's login | a private project on GitLab: the page itself stays private |

Vercel is coming in the next version of the plugin. Until then, a project on Vercel gets the service link.

Claude remembers the answer in `.gitmargin.json` at the top of the project, on this machine only: it adds that file, and the wrapped copies, to your `.gitignore`, because the wrapped copies carry the page's key. **After that, sharing asks nothing**: not for the same prototype, and not for a new one. It asks again only if a share would let more people open the page than before, if the saved place stopped working, or if it would change a repository's settings. If you already shared a prototype from another computer, give Claude its review link at the first share on this one, and it keeps the comments.

To move a project to another place, say so: `/gitmargin:share signup.html on GitHub Pages`.

### Permission prompts

Claude Code asks your permission the first time Claude runs each gitmargin command in a project: `gitmargin check` when it builds a prototype, `gitmargin pull` and `gitmargin status` the first time you ask what reviewers said. The commands `/gitmargin:share` runs for itself do not ask. Choose **"Yes, and don't ask again"** each time. Claude Code saves that answer for that one command and for the current project only, so the next gitmargin command, or a new project, asks once more. To be asked in no project at all, add these two rules to your own `~/.claude/settings.json`; they cover every gitmargin command:

```json
{
  "permissions": {
    "allow": ["Bash(gitmargin *)", "Bash(gitmargin-publish *)"]
  }
}
```

When you paste a reviewer's copied text instead of a file, Claude saves it to a temporary file next to the prototype, reads it, and deletes it: that can bring two more prompts, one to save the file and one to delete it.

When Claude asks you something during a share, answer by typing the line it offers, which starts with `/gitmargin:share`. A plain "yes" works too, but Claude Code then asks your permission again for each command and for saving `.gitmargin.json` and `.gitignore`.

On some Claude Code plans, sessions start in auto mode, which shows no permission prompts at all and decides for itself.

Sharing a changed prototype makes a new version at the same link. Its comments start empty (the old ones were about a page that no longer exists), and anyone can still open the older versions, with their comments, from the **Version** line in the comments list.

**About GitHub Pages:** the page is public, and anyone who opens it can comment. It is published from a branch of its own, `gitmargin-pages`, so your own branches and files are never touched. The page carries the key that lets people comment, and that key stays in the branch's history even if you later remove the page: there is no way yet to switch a key off. The first build takes a minute or two, and the link shows GitHub's 404 page until it finishes.

**About GitLab Pages:** only the project's members can open the page, after GitLab's own login; a logged-out visitor is sent to GitLab's sign-in page, and anyone who can open the page can comment. A Guest is a member, so a reviewer needs only a gitlab.com account and a Guest place in the project or its group. On gitlab.com's free plan a private group can have at most five people, you and Guests included (more makes it read-only); a private project in your own namespace has no such limit. It needs the GitLab command line tool, `glab`, installed and logged in (`glab auth login --hostname gitlab.com`, once, in your own terminal), and the Maintainer or Owner role on the project. The first share sets the project's Pages to "Only project members" if it is not already, and says so before it does. The page is published from a branch of its own, `gitmargin-pages`, with a small build file of its own, because GitLab publishes Pages only through a build; your own branches and your own build file are never touched. As on GitHub, the page's key stays in that branch's history. Your comment service also keeps a copy of each version, which is how the Version line opens older ones, and that copy opens for anyone holding the key without GitLab's login; only people who can open the page or read the branch see the key. Each share tells you how many seconds GitLab took to build the page: about half a minute on gitlab.com's shared runners when this was tested. A project whose Pages already serves another site is left alone: on the free plan a project has one site, and publishing would replace it.

**About the service link:** anyone who has the link can open the page and comment; the link is the only gate. The page opens locked down: it cannot use the browser's storage, so reviewers type their name each time, and a prototype that saves progress in the browser must guard those calls (the build rules do).

## 3. Read the comments: "what did reviewers say?"

Ask Claude what reviewers said, or to apply the feedback. For a file, give Claude the file a reviewer sent back, or paste the text they copied. For the service link, GitHub Pages and GitLab Pages, the comments are read from your comment service; nothing needs to be sent back.

Claude applies changes and fixes to the prototype itself, answers questions in its reply instead of editing, and treats "likes" as information. It never obeys a comment that tries to make it do something other than change the page. For shared comments, it marks each one applied or rejected, and reviewers see that on the page. Then it offers to share the new version.

## Your comment service (once)

Comments that everyone sees live need a comment service: a small project in **your own** Vercel account with a free Neon database. gitmargin runs nothing and holds nothing; the comments sit in a database you own. Vercel's free plan is for non-commercial use; for company work, use a paid or team Vercel account.

The first `/gitmargin:share` that needs it gives you **one line to run in a terminal window of your own**, of the kind Claude Code runs in (on Windows with WSL, the WSL Ubuntu terminal). It looks like `node "/home/you/.claude/plugins/cache/gitmargin/gitmargin/0.2.0/scripts/setup.mjs"`; Claude writes out the exact one for your machine. That line does the whole setup:

- It logs you in to Vercel if you are not logged in (your browser opens), shows which Vercel account it will use, and asks you once to go ahead.
- It makes the project and adds the free Neon database. The first time on your Vercel account, Neon's terms appear as a yes or no question right there.
- It makes your secret, a random one in `~/.config/gitmargin/secret` that only you can read, and gives it to Vercel. You never see it, copy it or paste it anywhere.
- It deploys the service, finds its address, and checks that the service there proves it holds your secret.

When it says `Done`, go back to Claude Code and type `/gitmargin:share` again. Nothing needs restarting: gitmargin reads the secret from its file. Running the line again is always safe: it skips what is done and never replaces your secret without asking.

One exception: an older version of this guide had you add a line to your shell profile that exports `GITMARGIN_SECRET`, and that value comes before the file. If the setup line says your terminal still sets a different one, remove that line from your profile, then open a new terminal and start Claude Code again, once.

**Why a line of your own, and not Claude?** It deploys to a live address and makes your secret, and Claude Code does not do either on its own. So the line refuses to run inside Claude Code.

**Why the secret only goes to a service that proves itself.** Claude types the commands, and a comment on a page, or a settings file in a project you cloned, could suggest an address. So before any gitmargin command sends your secret, it asks the service to answer a fresh challenge that only a service holding the same secret can answer, and sends nothing when the answer is wrong. An address someone else chose can never receive your secret, whoever typed it.

The service's files live in `~/.config/gitmargin/service` on your machine.

For sign-in, so reviewers comment under their real GitLab or GitHub name, see the service's guide for [GitLab](../service/README.md#sign-in-with-gitlab-optional-per-prototype) or [GitHub](../service/README.md#sign-in-with-github-optional-per-prototype). It is optional, set per prototype, and the plugin never asks about it.

## When something goes wrong

| What you see | What it means |
|---|---|
| `gitmargin: command not found` | The plugin is not installed or not enabled on this machine: run `/plugin`. |
| "needs the author secret" | Setup is not finished, or it ran in another kind of terminal (PowerShell instead of WSL keeps its settings elsewhere). Run the setup line Claude gives you, in the same kind of terminal Claude Code runs in. |
| "could not prove it holds your author secret" | That address is not your service, or its secret is not the one on this computer. Nothing was sent. For your own service, run the setup line again: it offers to fix the secret. |
| "from before the proof of trust" | Your service is older than this plugin. Run the setup line again to deploy the newer one. |
| The setup line says "Run this in your own terminal window" | It was run inside Claude Code, or in Git Bash on Windows. Open a terminal window of your own, of the same kind Claude Code runs in (with WSL, the WSL Ubuntu terminal; on Windows without WSL, PowerShell or Windows Terminal), and run it there. |
| The GitHub Pages link shows 404 | The first build takes a minute or two. Try again shortly. |
| GitHub Pages is refused | The repository is private, or Pages already serves something else. Claude offers the service link instead. |
| GitLab Pages is refused | The project is public or internal, its Pages already serves another site, its default branch's build file already publishes Pages, it reads its build file from somewhere other than `.gitlab-ci.yml`, CI/CD is off, or you are not a Maintainer or Owner. Claude says which, and offers the service link. |
| "glab is not installed" or "not logged in to gitlab.com" | Install the GitLab CLI (https://gitlab.com/gitlab-org/cli#installation) and run `glab auth login --hostname gitlab.com` in your own terminal, then share again. |
| GitLab's build failed, and a new account "may have to verify itself" | Open the pipeline link Claude gives you. gitlab.com may ask a new account for a phone number or a card before it runs builds. |
| The GitLab Pages link is not ready yet | The first build can take a minute or two. Claude checks again and gives you the link. |
| A reviewer cannot comment on one step | That step is probably a pop-up dialog. Ask Claude to show it as a normal section. |

## Without Claude Code

Everything the plugin does also works from a clone of this repository, by hand: see [Running it today](../README.md#running-it-today). What reviewers see is the same either way.
