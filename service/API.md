# The comment service: what it answers

This is the one contract. The CLI (`attach --service`, `pull --live`, `status`, `remove`) and the overlay
(`src/overlay/sync.js`) are both written against this file, not against each other.

The service keeps the comments for prototypes whose author deployed it. It has no accounts and no cookies. Two things
open it:

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
