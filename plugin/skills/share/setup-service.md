# Set up the author's comment service

Shared comments (the service link, GitHub Pages, GitLab Pages, and a file whose comments everyone sees live) need a comment service. It is a small project in the author's own Vercel account with a free Neon database; gitmargin runs nothing and holds nothing. Setup is once per author, and it is one command the author runs in their own terminal.

You run nothing for the setup itself. The command deploys to a live address and makes the author's secret, which Claude Code does not do on its own, so it refuses to run inside Claude Code. Do not run it, not even to check it, and never try to get round that refusal: it is what keeps the deploy the author's own.

## 1. Hand over the line

`gitmargin services --json` (the share ran it in step 2) gives the exact line as `setupCommand`. If it is null, the plugin is not fully installed: say so and stop.

Tell the author all of this, in a few lines:

- It sets up their comment service in their own Vercel account: a project, a free Neon database, and a deploy. Vercel's free plan (Hobby) is for non-commercial use; for company work, use a paid or team Vercel account.
- Open a new terminal window of their own, the same kind this Claude Code runs in (on Windows with WSL: the WSL Ubuntu terminal, not PowerShell), paste this one line, and follow it:

  ```bash
  <setupCommand, exactly as services printed it>
  ```

- It may open the browser to log in to Vercel, and it asks yes or no in the terminal: which account to use; whether an existing Vercel project named `gitmargin-comments` is their comment service (no, unless it is); Neon's terms, the first time only; and, only if the service's secret is not the one on this computer, whether to make a new one. The secret it makes is never shown, and never needs to be pasted anywhere.
- When it says `Done`, come back here and type `/gitmargin:share <prototype.html>` (write the prototype's file name out). Nothing needs restarting.

Then stop and wait for that line.

## 2. When the author comes back

`/gitmargin:share` runs again, and so does `gitmargin services --json`. The new service is in `trusted` and `secretSet` is true: share to it as usual (step 3 of the skill). Its address is the one in `trusted` that was not there before; with several and no way to tell, ask which. Write that address into `.gitmargin.json` as `service` with the Write tool (as in step 2 of the skill), so later shares use it without asking.

- If `secretSet` is still false, or `trusted` has nothing new: the line ran in a different kind of terminal (PowerShell instead of WSL, for example), which keeps its settings somewhere else, or it stopped before `Done`. `configDir` is where this Claude Code looks; the setup command printed the folder it used. Ask which happened.
- If it stopped with a message: the message says what to do, and running the line again is always safe. It skips what is done, and never replaces a secret without asking.

## After a plugin update

A plugin update can bring a newer service. `gitmargin services --json` says so when `serviceCopy` is `differs`, and a command that needs the author's secret says so when the service is "from before the proof of trust". Either way the author runs the setup line again: take the new `setupCommand` from `gitmargin services --json`, because the plugin's folder moves with every update. It deploys the newer service and asks only about the account. Review pages keep working in the meantime; commands that need the author's secret wait for it.
