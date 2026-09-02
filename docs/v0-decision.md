# gitmargin v0: the decision

Decided 2026-09-02. Closes [issue #1](https://github.com/mayankmankhand/gitmargin/issues/1).

How we got here: [the landscape research](../research/prior-art-landscape.md) mapped what others have tried, then a
two-day exploration designed seven candidate shapes for v0, had each one attacked from three angles (enterprise
security, a non-technical reviewer, and "can a PM with Claude Code build it"), and verified the chosen shape against
five different hosting setups. Technical terms are explained in the research report's
[glossary](../research/prior-art-landscape.md#8-glossary).

## 1. What v0 does

gitmargin adds Google-Docs-style comments to an HTML prototype **wherever your company already hosts it**, signs
reviewers in with an account they already have, keeps every comment in one record that is mirrored into the Slack
thread and the GitLab issue, and hands the whole batch to a coding agent.

It has three parts:

1. **The overlay.** One script tag on your HTML. On a laptop you click an element or highlight text and a thread opens.
   On a phone you tap an element, a sheet slides up, and you type or dictate one sentence. Threads have a status
   (open, accepted, rejected, applied) and a comment whose element has disappeared is shown as "orphaned", not lost.
2. **The gitmargin server.** Small and self-hostable; in v0 it runs on Vercel Functions with a Neon Postgres database.
   It signs people in, holds the comment record, mirrors comments outward, and serves the batch to agents.
3. **Publish and pull.** `npx gitmargin publish ./dist` replaces dragging a file into Slack: it puts the overlay into
   your files, publishes them to your company's host, and posts the link in Slack. `npx gitmargin pull` (and an MCP
   server, the standard plug for coding agents) returns the batch with statuses so the agent can apply it.

**gitmargin never hosts your prototype.** Companies already have a sanctioned place for internal pages; a tool that
asks them to change that does not get adopted, and the security question "who owns the box the prototype sits in"
disappears when the answer is "the same host as before".

## 2. Who it is for

The habit to change: a product manager makes a prototype with an AI tool, drops the `.html` file into Slack, and
feedback comes back as screenshots, bullet lists, and calls. Nothing is tied to the page, nothing is tied to a
version, and half of it is lost.

v0 has to work for three reviewers, and the third one sets the bar:

| Reviewer | Where | What they do | What they must never do |
|---|---|---|---|
| An engineer with a Git account | laptop | click or highlight, write threads, reply, resolve | |
| A designer with no Git account | laptop | the same as the engineer | touch Git, or see a sign-up form |
| A VP with no Git and no time | phone, from the Slack app | glance, tap one thing, say one sentence | create an account, install anything |

## 3. First host and sign-in

**gitlab.com Pages with access control set to "only project members", with GitLab as the sign-in provider.**

Why this first: the team runs gitlab.com; access control is on the Free tier; any user can register the sign-in
app without an admin ticket; GitLab is a textbook OpenID Connect provider, so the generic sign-in code is exercised
as-is; and because reviewers must already be project members to see the page at all, they already have the identity
gitmargin needs.

**The VP's first visit on a phone, as verified** (three prompts, then none):

1. They tap the link in Slack. It opens in Slack's in-app browser, which starts with no sessions at all.
2. GitLab Pages sends them to sign in. With SAML on the group that means the company's own identity provider:
   prompt one is username and password (or a passkey), prompt two is the MFA push if company policy asks for it.
3. GitLab creates or links their account silently, checks that they are a project member (Guest is enough), and the
   page loads. Every existing comment is visible with no further sign-in.
4. They tap "Sign in to comment". The GitLab session already exists, so the only thing they see is prompt three:
   one "Authorize gitmargin" click, once ever.
5. They tap the element, dictate a sentence, and tap Send. The comment is recorded and mirrored into the GitLab
   issue and the Slack thread.

Repeat visits cost zero prompts while the company SAML session (24 hours by default) and the GitLab session (7 idle
days) last. The designer on a laptop usually sees fewer prompts than the VP, because a laptop browser already holds
the identity-provider session.

Two costs to know about. On gitlab.com Premium every Guest is a billable seat, so a VP who only views prototypes
costs a seat; on Ultimate, Guests are free. And publishing to GitLab Pages takes minutes rather than seconds,
because Pages has no upload API: every publish is one commit through the Commits API plus the Pages CI job.

## 4. Architecture: one core, three sockets

The **core** is identical on every host:

- The comment model: an anchor (CSS selector, the quoted text with a few words either side, the tap coordinates,
  and an optional screenshot), a thread, a version pointer, and a status. Several anchors are stored per comment
  because AI-regenerated pages change shape; "orphaned" is a normal state.
- The overlay, the server's record, the Slack mirror, the batch API, and the half of the publish command that
  prepares the files.

The **sockets** are where hosts differ, and each host plugs in one adapter per socket:

- **Serve.** The company's host. gitmargin publishes to it and never serves pages itself.
- **Identify.** How the viewer proves who they are. Three mechanisms exist: an OpenID Connect redirect (GitLab,
  Slack, Google, Okta, Entra are all configuration, not code); GitHub's own exchange, which needs a client secret;
  and a signed header from a gate in front of the page (Cloudflare Access, Pomerium, oauth2-proxy). v0 builds the
  first with GitLab as the provider.
- **Store.** The server's database is the record. Each comment is mirrored one way, with a link back: into the Slack
  thread on every host, into a GitLab issue note on GitLab, into a GitHub issue comment on GitHub.

**Why there is a server.** The original idea was a static overlay with no backend. The per-host verification killed
it on every host, not just GitHub: GitLab re-asks consent on every visit unless the app holds a secret, corporate
identity providers forbid the redirect pattern a static page needs, and gate hosts hand identity proof only to a
server. So the server exists from day one. It is written to be portable (the Hono framework plus a thin storage
layer) so it can move from Vercel into a company-owned account or a plain container without a rewrite.

**Session transport.** Safari and Slack's in-app browser drop third-party cookies, so a cookie on the gitmargin
server never reaches the prototype's page. The server keeps a first-party cookie on its own origin for silent
re-sign-in, hands the page a one-time code in the URL fragment, and the overlay swaps it for a short-lived token
kept in memory or session storage.

**Identity and audience.** A reviewer is stored as `{provider, id, name, email}` so a later switch of provider does
not orphan old comments. Every prototype carries an audience; on GitLab it is checked against project membership
through the Members API with a bot token.

**Security posture.** The overlay is bundled into the published site (same origin, integrity-pinned), never loaded
from a third party. Comment bodies are sanitised before rendering. No page content is ever sent anywhere; only the
quoted text and the anchor description leave the browser, and they go to the company's own GitLab and the
gitmargin server.

## 5. Workflow

- One link per version, plus a "latest" link that always forwards to the newest.
- Everyone who can see the page sees every thread (the Google Docs model). Anyone can reply; threads resolve.
- gitmargin is the record. Mirrors are one-way: a reply typed in Slack is not a comment. Two-way sync is not in v0.
- The agent reads the batch with statuses. Whether it applies everything or only accepted comments is the author's
  own workflow, not gitmargin's decision.
- Input is a single HTML file or a folder of static files. Not apps that need a build step, not Figma.

## 6. Two promises, worded honestly

- **"No account beyond the one your host already requires."** On GitLab Pages and GitHub Pages every reviewer needs
  a seat, because the host's own gate demands it. gitmargin never adds an account; it cannot remove one.
- **"On a host with no gate of its own, gitmargin gates the comments and the mirror, not the page bytes."**
  Encrypting the page itself ("sealed mode") is deferred.

## 7. Explicitly out of scope for v0

gitmargin hosting pages; two-way Slack sync; the GitHub adapter; corporate SSO as a direct provider (it is
configuration later, not code); the Cloudflare Access gate-header adapter; sealed mode; screenshots as a mandatory
anchor; Slack Enterprise Grid audiences; a self-hosting package; Slack Connect and external guests.

## 8. Dogfood order

Every one of the five setups below came back "works with an adapter". The core is the same; the effort is the adapter.

| Order | Host | Serve adapter | Identity adapter | Mirror | VP prompts, first visit | Adapter effort |
|---|---|---|---|---|---|---|
| 1 | gitlab.com Pages, members only | one commit via the Commits API + the Pages CI job | GitLab via OpenID Connect | Slack thread + GitLab issue note | 3, then 0 | ~8 days |
| 2 | Vercel with Deployment Protection | `vercel deploy` + a share or bypass link | Sign in with Slack via OpenID Connect | Slack thread | 2, then 0 | ~4 days |
| 3 | An ungated bucket (S3, Firebase) | `aws s3 sync` or `firebase deploy` | the company identity provider via OpenID Connect | Slack thread | 4, then 0 | ~7 days |
| 4 | Behind Cloudflare Access or oauth2-proxy | `wrangler pages deploy` or the like | gate-header adapter (a new kind) | Slack thread | 2, then 0 | ~10 days |
| 5 | GitHub Pages, private (Enterprise Cloud) | push to `gh-pages` via the Git Data API | GitHub App adapter | Slack thread + GitHub issue comment | 5, then 0 | ~6 days |

## 9. Spikes before building

Each is a one-day throwaway test of an assumption the design rests on. If one fails, the design changes before any
real code exists.

1. **The sign-in hand-off inside Slack's in-app browser**, on iOS and Android: redirect to the server, sign in at
   GitLab or the identity provider, return to the page with a one-time code in the URL fragment, swap it for a
   token, restore a half-typed comment. This is the core path on every host.
2. **GitLab consent behaviour**: a confidential app asks once and never again, a public app asks every visit, the
   token refresh works, and the Members API check with a bot token returns what we expect.
3. **Publish timing on GitLab Pages**: Commits API plus the Pages job on shared runners, two versions plus latest,
   and the earlier version still opens afterwards.
4. **Corporate MFA and device policies inside the webview**: Okta documents that WebAuthn is not supported in
   embedded browsers, so a WebAuthn-only policy could strand the VP entirely.

Two more belong to later ports: whether Cloudflare Access answers its identity endpoint from the app's own
hostname, and whether a person with no Vercel account can open a protected deployment from a share link.

## 10. Alternatives considered

Seven shapes were designed and attacked. One line each:

- **Overlay with identity adapters.** The original README plan, GitLab-first. It became this decision once the
  identity adapter was generalised to OpenID Connect and the server was made explicit.
- **gitmargin hosts it (a full hub).** Rejected: a PM running the box that holds unreleased UI fails every security
  review, and the shape is roughly ten subsystems with no intermediate milestone.
- **Sidecar proxy in front of any host.** Kept as a later serve adapter; as a first version it is enterprise-shaped
  infrastructure with too many secrets for one person.
- **GitLab-only, no server.** Rejected: without a server the consent screen appears on every visit, there is no
  Slack mirror, and it can never serve a second host.
- **Browser extension.** Rejected: there are no extensions in Slack's mobile browser, so the VP is unreachable.
- **Zero-infrastructure share link** (a key in the URL, a typed name). Kept as a fallback identity adapter for teams
  with no sanctioned host; no real identity, so not v0.
- **Slack-hosted port** (gitmargin hosts pages behind Sign in with Slack). Rejected as v0 because it makes gitmargin
  the host, which is the thing the owner does not want to be; kept as a later adapter for teams with no host at all.

And why not adopt an existing tool instead: Vercel's and Netlify's preview comments only work on pages they host and
require their own accounts; Claude Code artifacts only work on claude.ai; GitLab built almost exactly the overlay
idea as Visual Reviews and removed it in 17.0 for low usage, most likely because reviewers had to paste an API
token. The full comparison is in the [research report](../research/prior-art-landscape.md).
