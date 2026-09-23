# gitmargin part 2: one design, three sockets

Decided 2026-09-19. It came out of thinking through issues
[#16](https://github.com/mayankmankhand/gitmargin/issues/16) (a publishing plugin),
[#17](https://github.com/mayankmankhand/gitmargin/issues/17) (sign in with GitHub),
[#18](https://github.com/mayankmankhand/gitmargin/issues/18) (sign in with GitLab through the company login) and
[#19](https://github.com/mayankmankhand/gitmargin/issues/19) (Vercel same-project mode) as one use case instead of
four features. It replaces the parked list in section 7 of [the split](v0-split.md) as the description of part 2.
Technical terms are explained in the research report's [glossary](../research/prior-art-landscape.md#8-glossary).

**Status on 2026-09-23:** cycle 1 (section 7), the sign-in core and the GitLab plug, is built under issue #18 and was
walked on two computers with two gitlab.com accounts. Cycle 2, the GitHub plug (issue #17), is built and tested against
a stand-in GitHub in Chromium and Firefox and walked on the real github.com (a file on disk, the service link and a
GitHub Pages page). Same-project mode, the second half of cycle 4 (issue #19), is built ahead of cycle 3 and tested
behind a stand-in for Vercel's login wall; its walk on a real Vercel project waits for the owner. Everything else here
is decided and not yet built, and says so.
The contract is `service/API.md`; setup and warnings are in `service/README.md`.

## 1. Why one design

Part 2 is the destination the README names: comments on *private* prototypes, under the identity the team already
has. Taken one issue at a time it looked like four unrelated jobs. Walked through end to end, as one author
publishing one prototype and one reviewer opening one link, it is a single design with three places where things
plug in.

The rule that split v0 in two still governs it: a design the builder cannot test alone cannot be built alone. So
every piece below is proven on accounts one person can own (two personal gitlab.com accounts on two computers, a
personal GitHub account, a personal Vercel account) before the next piece starts, and what cannot be proven that way
is listed as a limit in section 8 instead of being assumed.

## 2. The three sockets

Think of a wall with three sockets. Any plug in the first works with any plug in the second.

**Socket 1: where the page lives.** Six plugs: a file sent by hand, the service link, GitHub Pages, GitLab Pages,
Vercel, and Vercel same-project mode. Every plug answers the same four questions:

1. Can I detect it?
2. Who will be able to see the page?
3. How do I publish?
4. What is the link?

The **service link** is the fallback plug. Since issue #15 the author's comment service keeps a copy of each version
of a page and serves it at `/p/<key>/latest`. That is already a shareable link with no host to set up, so it is what
publishing falls back to when a project has no host at all. Its costs are stated where it is offered: the page runs
locked down, so it cannot use browser storage and does not remember a reviewer between visits; it holds one file of
up to 4 MB; and the link is the only gate, unless the author turns strict reading on (section 4).

**Socket 2: who may comment.** Three plugs: typed names (the default), GitLab (built, cycle 1), and GitHub (built, cycle 2). Two optional rules
sit beside them, set per prototype: *only members of this group may comment* (GitHub has no such groups, so its rule
names one repository: *only people GitHub lets open this repository*), and *only signed-in members may read*.
The GitLab plug is written against the open sign-in standard GitLab follows (OpenID Connect), reading its addresses
from the provider's own discovery document. A company login such as Okta, Microsoft or Google is then a settings
change plus testing later, not new code. GitHub does not follow that standard closely enough, so it is a second
adapter, but not a second flow.

**Socket 3: the constant.** The author's own comment service, deployed to their own account, as built in #15.
gitmargin still runs nothing and holds nothing. Sign-in adds one idea to the service: a **pass** that says who you
are, valid for one prototype only.

## 3. Why any plug works with any plug

The usual way to sign in sends the browser away to the provider and brings it back. That cannot work for a file
opened from disk: a website is not allowed to send a browser back to a file. So sign-in happens in a small pop-up
that talks to the author's service, and the page learns the result by **asking the service**, with a one-time code
it made itself. Only that code's hash ever appears in the pop-up's address; the code itself is sent only when
claiming the pass.

Waiting for a message from the pop-up was ruled out for two reasons. A page opened from disk has no address a
message can safely be sent to. And sign-in providers cut the link between a pop-up and the page that opened it:
gitlab.com answered with the header that does this (`Cross-Origin-Opener-Policy: same-origin`) on 2026-09-19.

This was measured before anything was built on it, against a stand-in GitLab that needs cookies and cuts that link
the way the real one does:

| The page is | Engine | Pop-up opens from the click | Sign-in and Continue finish | Asking the service delivers the result | Pop-up closes itself | Opening page can close it |
|---|---|---|---|---|---|---|
| a file on disk | Chromium | yes | yes | yes | yes | no |
| a locked-down stored page | Chromium | yes | yes | yes | yes | no |
| at a web address | Chromium | yes | yes | yes | yes | no |
| a file on disk | Firefox | yes | yes | yes | yes | no |
| a locked-down stored page | Firefox | yes | yes | yes | yes | no |
| at a web address | Firefox | yes | yes | yes | yes | no |

Three consequences, all taken from the measurement:

- The pop-up closes itself when it is done. The opening page cannot close it, and cannot even tell whether it is
  still open: from its side the pop-up reads as closed from the first moment. So the overlay never watches the window;
  waiting has its own Cancel and a time limit.
- The one-time code's hash is computed in the page without waiting for anything, because whatever is awaited between
  the click and opening the pop-up invites the pop-up blocker. The browser's built-in hashing waits, and is missing
  on plain `http` pages, so the overlay carries a small hash function of its own, tested against a reference.
- The automated browsers used for this switch the pop-up blocker off. Whether the pop-up opens from a real click in
  a real Chrome and Firefox, and whether the real GitLab's login completes inside it, is checked by hand.

## 4. How sign-in works

```
Reviewer clicks "Sign in with GitLab" under the identity chip in the overlay's toolbar
  -> the page makes a one-time code and opens a small pop-up to the author's service   (pop-up blocked?)
    -> the service sends the pop-up to GitLab                                           (service not set up for GitLab?)
      -> GitLab: the company login if it is enforced, then one approval                 ("verify who you are" only)
        -> GitLab sends the pop-up back to the service with a proof
          -> the service checks the proof using its own secret, reads the name and the groups
            -> the members rule: is this person in the named group?                     (no: "not a member", read-only)
              -> the service's confirm page: "Sign in to comment on <prototype> as <name>?"  (nothing granted before Continue)
                -> the pop-up closes itself
  -> meanwhile the page asks the service "is my code ready?"                            (never: "Sign-in did not finish")
    -> it receives a pass and keeps it (browser storage, or this tab only on disk and on the service link)
      -> every comment carries the pass; the service stamps the verified name on it
```

The decisions inside that picture:

- **The secret stays on the service, and the provider's tokens are used once and thrown away.** They are never
  stored, never logged and never sent to a browser. The prototype is AI-made HTML, and any script in it can read
  whatever the overlay holds. So the browser only ever receives a pass: random, stored as a hash, valid for one
  prototype, able to do one thing.
- **Reviewers are never asked for more than "verify who you are"** (GitLab's `openid` permission, or a GitHub App with
  no permissions), except under one rule the author chooses: GitHub's repository rule needs the App to read repository
  metadata, and GitHub's screen then says more. A frightening
  permission screen is the login friction that, most likely, killed GitLab's own Visual Reviews. Group membership
  comes from the `groups` claim. Measured against the real gitlab.com on 2026-09-21: with `openid` alone, userinfo
  returned `groups` listing a private group for its owner. The same for a Guest is confirmed in cycle 1's
  two-computer walk. There is no second mechanism: if the claim ever fails, the rule fails closed and nobody outside
  the list comments.
- **The members rule names a group, matched exactly and whole**, without regard to case, never by the start of a
  path. Whatever GitLab counts as membership counts, inherited membership included. The claim carries paths and not
  permanent ids, so after renaming or deleting a group the author sets the rule again: a freed path can be
  registered by someone else.
- **Every sign-in ends on a confirm page, and nothing is granted before Continue.** Without it, someone holding a
  page's key could make their own one-time code, send a group member the start link, and collect a pass under that
  member's name from a single silent click, because providers skip their approval screen after the first time. The
  confirm page names the prototype and the person and shows a short code that must match the one in the reviewer's
  own page, which is what every "sign in on another screen" flow does. The limit that remains: a member who is
  talked into pressing Continue on a link someone sent them gives that person a pass for that one prototype, until
  it expires.
- **Strict reading is the second rule from section 2, switched on per prototype.** By default sign-in limits who may
  comment and anyone who can open the page may still read. With strict reading on, reading needs what commenting
  needs: the overlay shows no comments until a member signs in, the copies stored on the service stop being open links, and
  the author's own `pull --live` sends the author secret. What it cannot do is take back what a member's browser
  already fetched.
- **"No cookies, ever" stays true.** The service answers pages from any origin, a file on disk included, and that is
  safe only because it never uses cookies. The pass travels in a request header. Under strict reading a
  stored copy opens with a one-use ticket in its address, handed out only at the Continue press of a sign-in that
  began on the small sign-in page in front of that copy; the same redirect carries a one-time code after the `#`,
  which no server sees, so the person lands already signed in. There is deliberately no route that turns a pass into
  a ticket: a copy opened that way would hold no pass and need a second sign-in, and it would be one more door.
- **A comment keeps the ownership rule it was created under.** Written under sign-in, it belongs to that verified
  person on any computer. Written under a typed name before sign-in was switched on, it stays a typed-name comment,
  with no verified mark.
- **The mode lives on the service, not in the page.** The overlay learns that a prototype needs sign-in from the
  service's answers. `gitmargin attach` writes nothing new into the page, so the plain-file workflow of part 1 cannot
  change, and the author can switch the mode without attaching again.

## 5. Publishing: one rule

**A page is never visible to more people than the repo it came from, unless the author says so.**

The plugin detects where the project lives, proposes one channel, says who will be able to open the page, asks for
one confirmation, and remembers the answer. It never publishes silently on first use. The reason is concrete: a
GitHub Pages site is public to the whole internet even when its repo is private (private Pages needs GitHub
Enterprise Cloud), so "it went to GitHub automatically" would turn a private prototype public.

| The plugin finds | It proposes | Who will see the page |
|---|---|---|
| A GitLab remote | GitLab Pages, access set to project members only | the project's members |
| A GitHub remote, public repo | GitHub Pages | the whole internet, said plainly |
| A GitHub remote, private repo | the service link or a file; Pages only after an explicit "this makes it public" | whoever holds the link or the file |
| A `.vercel` folder or `vercel.json` | Vercel, and it asks which protection is on | depends on that protection |
| Nothing | the service link when a service exists, otherwise a file sent by hand | whoever holds the link or the file |

**It asks when:**

1. it is the first publish in a project;
2. the saved channel has stopped working;
3. a publish would widen who can see the page, every time that happens and not on every publish;
4. two signals disagree, for example a GitHub remote and a Vercel folder;
5. the step creates a project, costs money, or changes repo settings;
6. identity mode needs choosing: once per prototype, typed names by default, and sign-in is offered only when the
   author's service has a sign-in application set up.

**It never asks** on a republish of the same prototype to the same channel, or on `pull`.

**What lands in an author's repo:** their prototype, untouched; the attached copy; one small config file holding
the channel, the service address and the identity mode, and no secrets (the author secret stays outside the repo);
and, on the GitLab channel only, a short Pages build file, because GitLab Pages publishes only through a build.
The plugin carries the command-line tool and the overlay inside itself, so an author who uses the plugin needs
nothing from npm.

One tension the plugin has to handle: this repository never commits a copy attached with `--service`, because it
carries a service address and a page key. A Pages channel publishes by pushing exactly that copy. That is fine when
the page and the repo have the same audience, and never fine when a private repo feeds a public site.

### The GitLab Pages channel, done by hand once

Cycle 1's two-computer walk published its test page by hand. These are the steps cycle 3 automates, written down
as they were really done, so the plugin copies something that worked and not something imagined.

1. In a private GitLab group, make a private project. Reviewers are members of the group (a Guest is enough, both
   to open the page and to pass the members rule at sign-in).
2. `gitmargin attach <page> --service <address>`, then
   `gitmargin identity <attached copy> gitlab --members <group path>`. The mode lives on the service, so the order
   of these two and the upload does not matter, and the mode can change later without publishing again.
3. Put two files in the project: the attached copy, renamed `index.html`, and this build file as `.gitlab-ci.yml`.
   GitLab Pages publishes only through a build, and the build only has to copy the page into `public/`:

   ```yaml
   pages:
     stage: deploy
     script:
       - mkdir -p public
       - cp index.html public/
     artifacts:
       paths:
         - public
     rules:
       - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
   ```

4. In the project's settings, under visibility, set Pages access to "Only project members". Check it from a
   logged-out window: it must be sent to GitLab's sign-in, not shown the page.
5. The link is under Deploy, Pages. Uploading a new `index.html` republishes.

What the plugin must handle that the walk met: a brand-new gitlab.com account may be asked to verify itself before
its first build runs, and the first builds can fail until it has; and the pushed copy carries the service address
and the page key, which is the tension described above.

## 6. What a reviewer experiences

The sign-in column was walked for cycle 1 on 2026-09-21, on gitlab.com: GitLab Pages (members only), the service
link and a file from disk, end to end in Chrome; in Firefox the window opened from a real click with the pop-up
blocker on and reached GitLab's login, and the rest rests on the automated suite. The Guest of a private group was
recognised as a member with the `openid` permission alone. The GitHub Pages row was walked for cycle 2 on 2026-09-23,
with the service link and a file from disk. The Vercel same-project row is still a target.

| The page lives on | Typed names | With sign-in |
|---|---|---|
| A file from disk | type a name once | Sign in, approve once at the provider, Continue |
| The service link | type a name each visit (that page cannot remember) | Sign in and Continue each visit; no approval at the provider after the first |
| GitHub Pages | type once | Sign in, approve once, Continue; then remembered while the pass lasts |
| GitLab Pages, members only | GitLab's login, then type once | GitLab's login, Sign in, approve once, Continue; then remembered |
| Vercel same-project | Vercel's gate, then type once | the same; sign-in stays optional there |

## 7. Built in four cycles

Each cycle ends in a live test on accounts one person owns, before the next starts.

1. **The sign-in core and the GitLab plug** ([#18](https://github.com/mayankmankhand/gitmargin/issues/18), with the
   shared core from [#17](https://github.com/mayankmankhand/gitmargin/issues/17)). GitLab first because GitLab Pages
   with access control is the only free host where the page itself is private, so it is where the thesis is true.
2. **The GitHub plug** ([#17](https://github.com/mayankmankhand/gitmargin/issues/17)), using the kind of GitHub app
   whose permission screen says only "verify your identity". It proves the socket takes a second plug. **Built and
   walked 2026-09-23:** a GitHub App created with no permissions, PKCE and the App's secret on the service, who someone
   is from GitHub's `/user`; the pop-up, the confirm page, the pass and strict reading are cycle 1's, unchanged. The
   members rule names a repository instead of a group (`--members owner/repo`): only people GitHub lets open it may
   comment. It needs the App installed on that repository with one read-only permission, Metadata, so with the rule
   on GitHub's screen says more than "verify your identity". The overlay changed in one place: its no-access line
   names the repository. A GitLab prototype and a GitHub prototype live side by side on one service.
3. **The plugin** ([#16](https://github.com/mayankmankhand/gitmargin/issues/16)): install, service setup, publish
   with detect, propose, confirm once, remember, and the file, link, GitHub Pages and GitLab Pages channels.
4. **The Vercel channel and same-project mode** ([#19](https://github.com/mayankmankhand/gitmargin/issues/19)). The
   page key stays as a plain label for "which prototype"; Vercel's own protection wraps the page and the comments
   together, so the service barely changes. **Same-project mode built 2026-09-23, before the plugin:** a second
   deployment of the author's service with `GITMARGIN_SAME_PROJECT=1` serves one prototype as its own site (not
   sandboxed, so its calls carry Vercel's login), opens it at `/`, and holds one prototype, with a database of its
   own; a page opened at its own `/p/<key>/...` talks to the address it was opened from; the command line passes
   Vercel's wall with Vercel's bypass for automation. The plain Vercel channel stays with the plugin (cycle 3).

## 8. Honest limits

- **GitHub Pages is public** unless the organisation is on GitHub Enterprise Cloud. Sign-in there gives identity on
  comments, not privacy for the page.
- **GitLab Pages access control is on the Free tier**, and every reviewer needs a GitLab account that is a member.
- **Vercel's password protection is Enterprise, or a paid add-on on Pro.** Cycle 4 proves same-project mode with a
  free stand-in: Vercel Authentication with "All Deployments", free on every plan since 2026-09-09. On the free plan
  that lets in the owner, one outside Vercel user the owner approves, and anyone holding the account's one share link.
  The default, Standard Protection, leaves a project's main address open, so the setup says to choose All Deployments.
- **Same-project pages are not sandboxed.** They share the address only with their own prototype, but with sign-in
  on, a hostile script inside the prototype could press Continue for a reviewer; and sign-in there works from the
  main address only, where the provider's callback is registered.
- **The company single sign-on pass-through is untested.** Personal accounts cannot enforce a company login, so that
  path is documented as untested and not claimed.
- **One author, one service.** A team can share one by sharing its author secret, which is a known limit. The pass
  design leaves room for authors who sign in too; that is not built.
- **GitHub allows one free personal account per person.** One person testing GitHub sign-in alone can play a signed-in
  reviewer and a signed-out one, not two signed-in people; a second real person is the only honest second account.
- **Safari is untested** ([#7](https://github.com/mayankmankhand/gitmargin/issues/7)), and pop-ups on phones wait
  for the phone mode that stays parked in [#2](https://github.com/mayankmankhand/gitmargin/issues/2).
