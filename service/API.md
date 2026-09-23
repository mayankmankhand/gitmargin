# The comment service: what it answers

This is the one contract. The CLI (`attach --service`, `pull --live`, `status`, `remove`) and the overlay
(`src/overlay/sync.js`) are both written against this file, not against each other.

The service keeps the comments for prototypes whose author deployed it. It has no accounts of its own and no cookies.
Two things open it, and a third when the author switches sign-in on for a prototype (see "Sign-in" below):

- **The page key** (`gm_...`), baked into an attached page. Whoever can open the page has it, so whoever can open the
  page can read and write comments and open stored copies of the page. If the page is public, the key is public.
- **The author secret** (`GITMARGIN_SECRET`, set on the deployment). It never appears in a page. It is sent as
  `Authorization: Bearer <secret>`. A deployment with no secret set refuses every author call.

Every answer is JSON with `cache-control: no-store`, and every answer allows any origin: a page opened from disk has
the origin `null` and a stored page is sandboxed, so there is no origin to allow-list. `OPTIONS` on any path answers
`204`.

## Limits

| What | Limit | Refusal |
|---|---|---|
| Comment text, reply text | 4,000 characters | `400 too_long` |
| One comment as JSON | 32 KB | `400 too_long` |
| A name | 80 characters (longer is cut) | none |
| Live comments per prototype | 500 | `409 full` |
| Live replies per comment | 100 | `409 full` |
| Versions per prototype | 50 | `409 full` |
| A stored page | 4 MB (larger: the version is registered with no page) | none, `page_stored: false` |
| Stored pages kept per prototype | the newest 10 versions | older versions keep their comments, lose their page |
| Writes per prototype | 60 in any 60 seconds | `429 slow_down` |

The author can remove any comment, so a prototype that reaches its comment limit is recoverable: only live comments
count. **The version limit is not recoverable.** Nothing removes a version, so at 50 the way on is a new prototype
(attach the file from a folder with no previous copy, without `--key`).

Each limit is a condition of the statement that does the write, not a count taken beforehand, so a parallel burst
cannot read one low count and all pass. They are still soft at the edge: statements that truly overlap can each miss
the other's row, so a burst can overshoot once by its own width before it is held.

A removed comment keeps its row, so open panels learn it is gone, but none of its content: its text, its author's
name and its replies' text are emptied at removal, and tombstones older than a week are cleared. Removed rows do not
count toward a limit, so one that kept its text would be free storage for anyone holding the key.

## Refusals

`400 invalid` (shape), `400 too_long`, `400 unknown_version`, `401 unauthorized` (author secret missing or wrong;
answered before the key is looked up, so it says nothing about which prototypes exist), `403 not_yours` (edit token
does not match), `404 not_found` (unknown path, key, comment or reply: all the same answer), `409 id_taken` (that id
exists with a different edit token), `409 full`, `429 slow_down`, `503 service_unavailable` (any database failure;
the detail is never sent).

Every refusal body is `{ "error": "<code>" }`.

## Author routes (secret required)

### `POST /api/prototypes`
Body `{ "name": "onboarding.html" }`. Answers `201 { "key": "gm_..." }`. The tables are created on first use, so a
fresh deployment needs no migration step.

### `POST /api/prototypes/<key>/versions`
Body `{ "hash": "8f2c1a", "file": "onboarding.html", "html": "<!doctype html>..." }`. `hash` is the six-hex content
hash `attach` already computes; `html` is optional.

The service owns the round number. When `hash` equals the newest version's hash the page has not changed and that
version is returned (`created: false`); an `html` sent with it still replaces the stored page, which is how `attach`
sends the finished page after learning its version id. Otherwise the round is the newest round plus one. A fresh checkout or a second
machine therefore cannot disagree with the service about which version is v3.

Answers `{ "version_id": "v3-8f2c1a", "round": 3, "created": true, "page_stored": true }`.

### `PATCH /api/prototypes/<key>/comments/<id>/status`
Body `{ "status": "open" | "accepted" | "rejected" | "applied" }`. Answers the comment.

### `DELETE /api/prototypes/<key>/comments/<id>`
Removes anyone's comment. Answers `{ "id": "c_...", "deleted": true, "updated": "..." }`.

## Key routes

Writes carry the writer's edit token as `X-Gitmargin-Token` (16 to 200 characters, made by the browser, random). The
service stores only its SHA-256. "Your own" means "sent with the token that created it".

### `GET /api/p/<key>/comments?version=<version_id>&since=<iso time>`
Both parameters are optional. No `version` means the newest. Answers:

```json
{
  "prototype": { "name": "onboarding.html" },
  "latest": "v3-8f2c1a",
  "version": "v3-8f2c1a",
  "versions": [ { "version_id": "v3-8f2c1a", "round": 3, "created": "...", "comments": 4, "has_page": true } ],
  "comments": [ ],
  "server_time": "2026-09-18T22:30:00.000Z"
}
```

Without `since`: every live comment of that version. With `since`: only comments whose `updated` is at or after it,
**including removed ones**, which arrive as `{ "id": "c_...", "deleted": true, "updated": "..." }`. Pass the previous
answer's `server_time` as the next `since`. The comparison is "at or after", so a comment can arrive twice; applying
one twice changes nothing.

### One comment on the wire
The part-1 comment (`id`, `time`, `intent`, `anchor`, `state`) exactly as `docs/batch-format.md` defines it, plus:

```json
{
  "version_id": "v3-8f2c1a",
  "author": { "name": "Priya" },
  "status": "open",
  "updated": "2026-09-18T22:29:41.120Z",
  "replies": [ { "id": "r_1a2b3c", "time": "...", "updated": "...", "author": { "name": "Sam" }, "text": "Agreed." } ]
}
```

Unknown fields in a submitted comment are dropped field by field, never stored, and that goes all the way down: every
leaf of `anchor.quote`, `anchor.point`, `state.screen`, each `state.trail` entry, `state.scroll` and `state.viewport`
is kept only as a string or a finite number, and is `null` otherwise. Other people's browsers read these values, so a
wrong type is not harmless. `status` is always `open` at creation, whatever was sent.

### `POST /api/p/<key>/comments`
Body `{ "version_id": "v3-8f2c1a", "author": { "name": "Priya" }, "comment": { ...part-1 comment... } }`.

**Idempotent on the comment id.** The id is made by the browser (`c_` plus six hex). Sending the same id again with
the same token answers `200` with the comment as the service holds it, and stores nothing twice; this is what makes a
retry after a timeout safe. The same id with a different token is `409 id_taken`. A first write answers `201`.

### `PATCH /api/p/<key>/comments/<id>`
Body `{ "intent": { "text": "...", "tag": "bug" } }`. Only the writer's own; only `intent` can change.

### `DELETE /api/p/<key>/comments/<id>`
Only the writer's own. The row stays as a tombstone so other people's panels learn of the removal through `since`.

### Replies
`POST /api/p/<key>/comments/<id>/replies` with `{ "id": "r_1a2b3c", "text": "...", "author": { "name": "Sam" } }`,
`PATCH .../replies/<reply id>` with `{ "text": "..." }`, `DELETE .../replies/<reply id>`. Same rules as comments:
browser-made id, idempotent add, own token to edit or delete. Every reply write also moves the parent comment's
`updated`, and the comment always travels with its full list of live replies, so a removed reply simply stops
appearing: no reply tombstone crosses the wire.

## Merge rules for a client

1. Save locally first, then send. Keep the ids of what has not been acknowledged.
2. Once the service has answered, it is the truth: for each comment in an answer, replace the local copy (replies
   included) unless the local copy has changes not yet acknowledged, in which case keep the local changes and send
   them again.
3. `deleted: true` removes the local copy, unsent local edits to it included: the comment is gone for everyone.
4. A comment present locally, absent from a full (no `since`) answer, and not awaiting acknowledgement was removed
   while this client was away: drop it.

## Stored pages
`GET /p/<key>/<version_id>` and `GET /p/<key>/latest` answer the page `attach --service` uploaded, as `text/html`,
with:

- `Content-Security-Policy: sandbox allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox
  allow-downloads`, and never `allow-same-origin`. The page gets an opaque origin: it behaves like a file opened from
  disk and cannot read anything this service's address holds.
- `Referrer-Policy: no-referrer`, because the key is in the address.

Inside a stored page browser storage is unavailable, so a commenter's name, edit token and unsent comments last for
that tab only. An unknown key, an unknown version, and a version with no stored page (over 4 MB, or older than the
newest 10) are all `404 not_found`.

The key is the only gate. A stored copy of a page that sits behind a password elsewhere is not behind that password
here.

## Sign-in

Optional, and set per prototype by the author. With it off (`identity: "none"`, the default) every route above answers
exactly as described above and nothing in this section is reachable from a page. The design and its reasons are in
`docs/part-2-design.md`; this section is the contract.

A third thing then opens the service:

- **The pass** (`gp_...`). Proof that a person signed in with the prototype's provider and, when the author named a
  group, belongs to it. It is valid for **one prototype**, for 7 days, and travels as the header `X-Gitmargin-Pass`. The
  service stores only its SHA-256. It is never a cookie: the service answers every origin, and that is safe only because
  it uses no cookies.

**What is never stored, logged or sent to a browser:** the provider's authorization code, its access token, its ID
token, and the application's secret. The provider's tokens are used once, inside the callback, and dropped.

**Providers.** Two, each switched on by its own settings on the deployment; a provider with no settings is simply not
offered. A provider address on plain `http` is refused unless it is loopback. The callback address to register with
either provider is `https://<service>/auth/callback`. Pasted values are trimmed of stray quotes and spaces.

- **`gitlab`**, written against the open sign-in standard (OpenID Connect): the addresses come from
  `<GITMARGIN_GITLAB_URL>/.well-known/openid-configuration` (default `https://gitlab.com`), the application is
  `GITMARGIN_GITLAB_ID` and `GITMARGIN_GITLAB_SECRET`, and the only permission ever asked for is `openid`. Who someone
  is comes from userinfo: `sub`, `name`, `nickname`, `groups`.
- **`github`**, through a GitHub App the author creates with **no permissions**: `GITMARGIN_GITHUB_ID` (the App's
  Client ID) and `GITMARGIN_GITHUB_SECRET` (a client secret made on the App's page). `GITMARGIN_GITHUB_URL` defaults to
  `https://github.com`, whose API is `https://api.github.com`; any other address is a GitHub Enterprise Server, whose
  API is `<address>/api/v3`. The authorize address carries no `scope` (a GitHub App's permissions are set on the App),
  a `state` and a `S256` challenge. The token call sends the secret and the verifier; GitHub may answer a refusal with
  any status and an `error` field, so only a returned `access_token` counts, and only the error's name is logged. Who
  someone is comes from `GET /user`, sent with a `User-Agent` as GitHub requires: `id` (the permanent subject), `login`
  (the username) and `name` (which may be empty; the login is shown then). No members rule yet: a `members` value with
  `github` is `400 invalid`.

### Limits and lifetimes

| What | Limit | Refusal |
|---|---|---|
| Sign-in starts per prototype | 30 in any 60 seconds | the refusal page, `429` |
| An unfinished sign-in | 10 minutes from start | claim answers `404 not_found` |
| A pass | 7 days | `401 sign_in` |
| A group path in the members rule | 255 characters | `400 invalid` |

Expired sign-ins and passes are cleared alongside writes, like the other housekeeping.

### `PATCH /api/prototypes/<key>` (author secret)
Body `{ "identity": "none" | "gitlab" | "github", "members": "group/full/path" | null, "read": "open" | "members" }`.
`members` and `read` are optional; `members` defaults to null (anyone who signs in may comment) and `read` to `"open"`.
`members` or `read: "members"` with `identity: "none"` is `400 invalid`, and so is `members` with `github`. A provider
the deployment has no settings for is `409 provider_not_configured`.

**Every call ends every pass for that prototype**, whatever changed. That is the author's way to stop someone now:
removing a person from the group stops their next sign-in, and this stops the pass they already hold. It is also what
makes switching providers safe: moving a prototype from `gitlab` to `github` ends every GitLab pass and every
unfinished GitLab sign-in, and a callback for a provider the prototype no longer uses is refused.

Answers `{ "identity": "gitlab", "members": "acme/design", "read": "open", "passes_ended": 3 }`.

### The members rule (GitLab)
The group's full path, compared whole and without regard to case against each path in the provider's `groups` claim.
Never a prefix and never a part of a path: `acme` does not match `acme-design`, and `acme/design` does not match
`acme/design-team`. Whatever the provider counts as membership counts, inherited membership included; someone who
belongs only to a subgroup is not a member of its parent. The claim carries paths, not permanent ids, so after a group
is renamed or deleted the author sets the rule again: a freed path can be registered by someone else.

### What a page is told
When sign-in is on, the `prototype` block of `GET /api/p/<key>/comments` gains `"identity"`, `"read"` and
`"members"`; with it off the block is `{ "name": ... }` exactly as before. This is how an overlay learns that a
prototype needs sign-in; nothing is written into the page. A write without a valid pass answers
`401 { "error": "sign_in", "provider": "gitlab" }`.

**Client rule:** `401 sign_in` on a write means keep the change and wait for a pass. Never drop it.

### The sign-in, step by step

1. The page makes a one-time code (32 hex characters) and opens a pop-up, inside the click, to
   `GET /auth/start?key=<key>&code_hash=<sha-256 of the code, 64 hex>`. Only the hash is ever in an address. The page
   shows the **short code**: the first eight hex characters of the hash, read as a number, modulo 10000, zero-padded,
   written `48-21`.
2. `/auth/start` checks the key, the prototype's provider and the start limit, records the sign-in (a random `state`, a
   PKCE verifier, the hash), and answers `302` to the provider's authorize address with `scope=openid`, the `state` and
   a `S256` challenge. A problem answers a small HTML page saying so in plain words, never a redirect elsewhere.
3. `GET /auth/callback?code=...&state=...` finds the sign-in by `state` (unknown, expired or already used: the problem
   page), exchanges the code with the application's secret and the verifier, reads who the person is (see
   "Providers"), decides membership, and answers the **confirm page**. Nothing is claimable yet. The provider's token is
   dropped as soon as it has been used.
4. The confirm page names the prototype and the person and shows the short code. It posts
   `POST /auth/confirm` (form: `state`, a one-time `token` from the page, `decision=continue|cancel`). Only
   `continue` with the right token makes the sign-in claimable; the token works once. `cancel` ends the sign-in. The
   answer is the result page, which closes itself. Every page of the service's own refuses to be framed.
5. Meanwhile the page asks `POST /api/p/<key>/auth/claim` with `{ "code": "<the code itself>" }` about once a second:
   - `202 { "pending": true }` until Continue is pressed;
   - then, **once**, `200 { "pass": "gp_...", "expires": "...", "member": true, "identity": { "provider": "gitlab", "name": "Priya Shah", "username": "priya" } }`;
   - for a person outside the group, once, `200 { "member": false, "members": "acme/design", "identity": { ... } }` and **no pass**;
   - anything else (unknown code, expired, cancelled, already claimed): `404 not_found`.

Why the confirm page exists, and the limit it leaves, is in `docs/part-2-design.md`, section 4. In one line: the
provider skips its approval after the first time, so nothing is granted until the person presses Continue on a page
that shows a code only their own page shows.

### `DELETE /api/p/<key>/auth/session`
With `X-Gitmargin-Pass`. Ends that pass. Answers `{ "signed_out": true }`; an unknown pass answers the same.

### Writes when sign-in is on
Every write under `/api/p/<key>/...` needs `X-Gitmargin-Pass`: valid, unexpired, issued for this prototype. It still
needs `X-Gitmargin-Token`, which keeps retries idempotent as before. The author on the stored comment or reply is taken
from the pass, never from the request body:

```json
"author": { "name": "Priya Shah", "provider": "gitlab", "username": "priya", "verified": true }
```

Every string from the provider is cleaned like any other untrusted input (one line, trimmed, cut at the name limit) and
is only ever text.

**"Your own", for both kinds of comment.** A comment or reply keeps the rule it was created under. Written under
sign-in, it belongs to that verified person (provider plus the provider's permanent subject: GitLab's `sub`, GitHub's `id`): they can edit or delete it from any browser, and no
one else can, whatever token they send. Known limit: the wire carries the username and not `sub`, so the overlay decides
what to draw by username (or by having written the comment itself); after a username change, older comments on
another browser show no Edit until the wire carries a permanent id. Written under a typed name before sign-in was switched on, it carries no
`provider` and no `verified`, and still belongs to the token that created it; while sign-in is on, that browser also
needs a valid pass, like every write. The author secret can always remove any comment.

### Strict reading
Opt-in per prototype: `read: "members"` on the settings route. Reading then needs what commenting needs.

- **The comments list.** `GET /api/p/<key>/comments` needs a member's `X-Gitmargin-Pass` or the author secret
  (`Authorization: Bearer`, which is how `pull --live` reads). Anything else answers
  `401 { "error": "sign_in", "provider": "gitlab", "read": "members" }`. **Client rule:** on that answer show the sign-in
  control and ask again slowly, not every five seconds.
- **Stored copies.** `GET /p/<key>/<version>` and `/p/<key>/latest` serve the page only with `?ticket=gt_...`. Without a
  valid ticket they answer `401` and a small sign-in page that says nothing about the prototype: not its name, and not
  whether that version exists.
- **A ticket** is made in one place only, the Continue press of a sign-in that began on that sign-in page. It opens one
  address (`latest`, or one version id) of one prototype, once, within 60 seconds. The service stores its SHA-256.

The sign-in from that page is the one above with three differences:

1. It starts at `GET /auth/start?key=<key>&return=latest|<version id>`, in the same tab, with no `code_hash`. `return`
   is a name, never an address: anything else is `400`, and so is `return` on a prototype whose reading is open.
2. The confirm page asks "Open <prototype> as <person>?" and shows no short code, because no page is waiting with
   one to compare.
3. Continue answers `303` to `/p/<key>/<return>?ticket=gt_...#gm_claim=<code>`. The code is made in the same statement
   that records the Continue, so the sign-in is never claimable under a code anyone else could hold. It rides after the
   `#`, which browsers send to no server. The overlay in the page it lands on takes it out of the address and posts it
   to `/auth/claim` like any other code, so the person arrives signed in. A non-member gets the not-a-member page and no
   ticket; Cancel gets none either.

A stored copy cannot remember anything (it is sandboxed), so a reload meets the sign-in page again. After the first
time the provider asks nothing, so that is two presses.

**What strict reading does not do:** it does not pull back what a person already has. Comments a member's browser
fetched while they were a member stay in that browser's storage, and a copy of the page they saved is theirs.

**Limits:** a ticket lasts 60 seconds and works once; expired tickets are cleared when a sign-in starts.
