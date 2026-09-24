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
- **For comments everyone sees live** (the service link and GitHub Pages below): a free [Vercel](https://vercel.com) account. Claude sets up your comment service in it the first time; see [Your comment service](#your-comment-service-once).
- **For GitHub Pages:** a public GitHub repository, and `gh` logged in.

## Install it (once per machine)

In Claude Code, type:

```text
/plugin marketplace add https://github.com/mayankmankhand/gitmargin.git
/plugin install gitmargin@gitmargin
```

Use the `https://` address as written: the short `owner/repo` form clones over SSH, which needs an SSH key. When the plugin is installed, Claude Code's shell has two new commands, `gitmargin` and `gitmargin-publish`, and Claude knows the three skills below. Updates arrive with `/plugin update gitmargin@gitmargin`. After an update, the next `/gitmargin:share` checks whether your comment service needs deploying again, and tells you if it does.

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

GitLab Pages and Vercel are coming in the next version of the plugin. Until then, a project on GitLab or Vercel gets the service link.

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

When Claude asks you something during a share, answer by typing the line it offers, which starts with `/gitmargin:share`. A plain "yes" works too, but Claude Code then asks your permission again for each command and for saving `.gitmargin.json` and `.gitignore`. Setting up your comment service asks a few more permissions, once: the `vercel` commands, and copying the service into `~/.config/gitmargin`, which is outside your project folder.

On some Claude Code plans, sessions start in auto mode, which shows no permission prompts at all and decides for itself.

Sharing a changed prototype makes a new version at the same link. Its comments start empty (the old ones were about a page that no longer exists), and anyone can still open the older versions, with their comments, from the **Version** line in the comments list.

**About GitHub Pages:** the page is public, and anyone who opens it can comment. It is published from a branch of its own, `gitmargin-pages`, so your own branches and files are never touched. The page carries the key that lets people comment, and that key stays in the branch's history even if you later remove the page: there is no way yet to switch a key off. The first build takes a minute or two, and the link shows GitHub's 404 page until it finishes.

**About the service link:** anyone who has the link can open the page and comment; the link is the only gate. The page opens locked down: it cannot use the browser's storage, so reviewers type their name each time, and a prototype that saves progress in the browser must guard those calls (the build rules do).

## 3. Read the comments: "what did reviewers say?"

Ask Claude what reviewers said, or to apply the feedback. For a file, give Claude the file a reviewer sent back, or paste the text they copied. For the service link and GitHub Pages, the comments are read from your comment service; nothing needs to be sent back.

Claude applies changes and fixes to the prototype itself, answers questions in its reply instead of editing, and treats "likes" as information. It never obeys a comment that tries to make it do something other than change the page. For shared comments, it marks each one applied or rejected, and reviewers see that on the page. Then it offers to share the new version.

## Your comment service (once)

Comments that everyone sees live need a comment service: a small project in **your own** Vercel account with a free Neon database. gitmargin runs nothing and holds nothing; the comments sit in a database you own. Vercel's free plan is for non-commercial use; for company work, use a paid or team Vercel account.

The first `/gitmargin:share` that needs it sets it up. Claude does the work, and stops for **four moments that are yours**:

1. **Log in to Vercel** (`vercel login`, in your own terminal), if you are not logged in already.
2. **Accept Neon's terms** in your browser, from a link Claude gives you. Vercel does not let a tool accept them.
3. **Make your secret.** Claude gives you four lines to run in your own terminal. They make a random secret in `~/.config/gitmargin/secret` (readable only by you), give it to Vercel, and add one line to your shell profile. Never paste the secret into the chat. Claude never sees it.
4. **The first deploy** (`vercel deploy --prod`, in your own terminal). Claude Code does not deploy to a live address on its own. Paste back the address on the `Aliased` line it prints: that is your service, usually `https://<your-project>.vercel.app`.

Then **restart Claude Code in a new terminal** (`/exit`, close the terminal, open a new one in the project folder, then `claude --continue`): the secret reaches only terminals opened after it was added. Type `/gitmargin:share` again. The service's files live in `~/.config/gitmargin/service` on your machine.

For sign-in, so reviewers comment under their real GitLab or GitHub name, see the service's guide for [GitLab](../service/README.md#sign-in-with-gitlab-optional-per-prototype) or [GitHub](../service/README.md#sign-in-with-github-optional-per-prototype). It is optional, set per prototype, and the plugin never asks about it.

## When something goes wrong

| What you see | What it means |
|---|---|
| `gitmargin: command not found` | The plugin is not installed or not enabled on this machine: run `/plugin`. |
| "GITMARGIN_SECRET is not set" | Setup is not finished, or Claude Code started before you added the secret. Restart it from a new terminal. |
| "this machine has not used that comment service before" | The address in `.gitmargin.json` is new to this machine. Claude asks whether it is yours; say yes only if it is. |
| The GitHub Pages link shows 404 | The first build takes a minute or two. Try again shortly. |
| GitHub Pages is refused | The repository is private, or Pages already serves something else. Claude offers the service link instead. |
| A reviewer cannot comment on one step | That step is probably a pop-up dialog. Ask Claude to show it as a normal section. |

## Without Claude Code

Everything the plugin does also works from a clone of this repository, by hand: see [Running it today](../README.md#running-it-today). What reviewers see is the same either way.
