// The tables, created on first use, and the columns added since.
//
// An author who arrives through the Deploy button has no terminal open and no
// migration step to run, so the service makes its own tables. Each statement
// is idempotent and sent by itself, because both Neon's HTTP driver and the
// in-process Postgres the tests use take one statement per call.

const STATEMENTS = [
  `create table if not exists prototypes (
     key text primary key,
     name text not null,
     created timestamptz not null
   )`,
  `create table if not exists versions (
     prototype_key text not null references prototypes(key),
     version_id text not null,
     round integer not null,
     hash text not null,
     file text,
     html text,
     created timestamptz not null,
     primary key (prototype_key, version_id)
   )`,
  // `body` is the part-1 comment, already whitelisted. `updated` moves on every
  // change, a reply included, and is what "changed since" reads. A removed
  // comment keeps its row with `deleted_at` set: the tombstone is how other
  // people's panels learn it is gone.
  `create table if not exists comments (
     prototype_key text not null references prototypes(key),
     id text not null,
     version_id text not null,
     author_name text not null,
     body jsonb not null,
     status text not null,
     token_hash text not null,
     created timestamptz not null,
     updated timestamptz not null,
     deleted_at timestamptz,
     primary key (prototype_key, id)
   )`,
  `create index if not exists comments_by_version on comments (prototype_key, version_id, updated)`,
  `create table if not exists replies (
     prototype_key text not null,
     comment_id text not null,
     id text not null,
     author_name text not null,
     text text not null,
     token_hash text not null,
     created timestamptz not null,
     updated timestamptz not null,
     deleted_at timestamptz,
     primary key (prototype_key, comment_id, id)
   )`,
  // One row per write, so the per-minute limit can be counted. A function has
  // no memory between calls; the database is the only place a count can live.
  `create table if not exists writes (
     prototype_key text not null,
     at timestamptz not null
   )`,
  `create index if not exists writes_by_time on writes (prototype_key, at)`,
  // Sign-in (issue #18). Deployments already hold the tables above, so new
  // columns arrive by `add column if not exists`: idempotent like everything
  // here, and no migration step for an author who deployed with the button.
  `alter table prototypes add column if not exists identity text not null default 'none'`,
  `alter table prototypes add column if not exists members text`,
  `alter table prototypes add column if not exists read_rule text not null default 'open'`,
  // Filled only for a comment or reply written under sign-in. Null means a typed
  // name, which keeps the ownership rule it was created under (the edit token).
  `alter table comments add column if not exists author_provider text`,
  `alter table comments add column if not exists author_subject text`,
  `alter table comments add column if not exists author_username text`,
  `alter table replies add column if not exists author_provider text`,
  `alter table replies add column if not exists author_subject text`,
  `alter table replies add column if not exists author_username text`,
  // One row per sign-in attempt. It holds the HASH of the page's one-time code
  // and of the confirm token, never either value, and never a provider token.
  `create table if not exists signins (
     state text primary key,
     prototype_key text not null,
     provider text not null,
     code_hash text not null,
     verifier text not null,
     confirm_hash text,
     subject text,
     username text,
     name text,
     member boolean,
     created timestamptz not null,
     expires timestamptz not null,
     used_at timestamptz,
     confirmed_at timestamptz,
     ended_at timestamptz
   )`,
  `create index if not exists signins_by_code on signins (prototype_key, code_hash)`,
  // A pass, stored as its SHA-256, valid for one prototype.
  `create table if not exists sessions (
     pass_hash text primary key,
     prototype_key text not null,
     provider text not null,
     subject text not null,
     username text,
     name text not null,
     created timestamptz not null,
     expires timestamptz not null
   )`,
  `create index if not exists sessions_by_prototype on sessions (prototype_key)`,
];

/** One promise per `query` function, so a warm function pays for this once. */
const ready = new WeakMap();

export function ensureSchema(query) {
  if (!ready.has(query)) {
    const run = (async () => {
      for (const statement of STATEMENTS) await query(statement);
    })();
    // A failed attempt must not be remembered, or one bad cold start would
    // poison every later request served by the same warm function.
    run.catch(() => ready.delete(query));
    ready.set(query, run);
  }
  return ready.get(query);
}
