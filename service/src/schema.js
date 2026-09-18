// The tables, created on first use.
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
