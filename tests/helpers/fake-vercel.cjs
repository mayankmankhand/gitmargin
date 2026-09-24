'use strict';
// A stand-in for Vercel's command-line tool, for the setup command's tests
// (issue #36). Put first on PATH through a `vercel` launcher (and, for the
// fallback, an `npx` one that drops `--yes vercel@59`). It never touches the
// network: it answers from a JSON state file (FAKE_VERCEL_STATE) and records
// every call, with the working folder and which watched variables reached it.
//
// The shapes follow Vercel CLI 59.15.1 as read from its own source on
// 2026-09-24 (explore report for #33/#36, "vercel-cli"): `whoami --json` exits
// 1 with {"loggedIn": false} when logged out; `project ls --json` lists
// {projects:[{name, latestProductionUrl}]}; `link` writes .vercel/project.json
// and .env.local; `integration list --json` lists {resources:[{projects}]};
// `env ls --json` lists keys with sensitive values left out; `env add` reads
// the value from standard input, strips one final line break, and refuses an
// existing key without --force; `deploy` prints the deployment address on
// standard output and its progress on standard error; `inspect --json` lists
// the aliases, the first being the "Aliased" address.
//
// Deploying copies the project's GITMARGIN_SECRET into `live`, which the
// in-process comment service reads as its secret on every request, so "the
// deployed service holds the secret Vercel was given" is what the tests see.

const fs = require('fs');
const path = require('path');

const file = process.env.FAKE_VERCEL_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const WATCH = ['CLAUDECODE', 'CLAUDE_CODE', 'AI_AGENT', 'GITMARGIN_SECRET', 'GITMARGIN_CONFIG_DIR', 'GITMARGIN_SERVICE', 'GITMARGIN_VERCEL_BYPASS'];
state.calls.push({ args, cwd: process.cwd(), seen: WATCH.filter((name) => name in process.env), via: process.env.FAKE_VERCEL_VIA || 'vercel' });

const done = (code) => {
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  process.exit(code);
};
const out = (text) => process.stdout.write(text);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const linked = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), '.vercel', 'project.json'), 'utf8')).projectName;
  } catch {
    return null;
  }
};
const [command, sub] = args;

if (command === '--version') {
  out('59.15.1\n');
  done(0);
}
if (command === 'whoami') {
  if (!state.loggedIn) {
    out(JSON.stringify({ loggedIn: false }));
    done(1);
  }
  out(JSON.stringify({ username: state.username, team: state.team ? { slug: state.team } : null }));
  done(0);
}
if (command === 'login') {
  state.loggedIn = !state.loginFails;
  done(state.loggedIn ? 0 : 1);
}
if (command === 'project' && sub === 'ls') {
  const filter = option('--filter') || '';
  out(JSON.stringify({ projects: state.projects.filter((p) => p.name.includes(filter)) }));
  done(0);
}
if (command === 'link') {
  const name = option('--project');
  fs.mkdirSync('.vercel', { recursive: true });
  fs.writeFileSync(path.join('.vercel', 'project.json'), JSON.stringify({ projectName: name, orgId: 'team_fake', projectId: `prj_${name}` }));
  fs.writeFileSync('.env.local', 'VERCEL_OIDC_TOKEN=fake-token-from-link\n');
  if (!state.projects.some((p) => p.name === name)) state.projects.push({ name });
  done(0);
}
if (command === 'integration' && sub === 'list') {
  out(JSON.stringify({ resources: state.neon }));
  done(0);
}
if (command === 'integration' && sub === 'add') {
  if (state.neonFails) {
    process.stderr.write('Error: the free plan is not available for this team.\n');
    done(1);
  }
  state.neon.push({ name: `neon-${state.neon.length + 1}`, projects: [linked()] });
  done(0);
}
if (command === 'env' && sub === 'ls') {
  const name = option('--project');
  out(JSON.stringify({ envs: Object.keys(state.env[name] || {}).map((key) => ({ key, type: 'sensitive' })) }));
  done(0);
}
if (command === 'env' && sub === 'add') {
  const name = linked();
  const key = args[2];
  const value = fs.readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  state.env[name] = state.env[name] || {};
  if (state.env[name][key] !== undefined && !args.includes('--force')) {
    process.stderr.write('Error: ENV_ALREADY_EXISTS\n');
    done(1);
  }
  state.env[name][key] = value;
  done(0);
}
if (command === 'deploy') {
  const name = linked();
  state.deploys = (state.deploys || 0) + 1;
  state.live = (state.env[name] || {}).GITMARGIN_SECRET || '';
  state.deployedFrom = process.cwd();
  process.stderr.write(`Deploying ${name}...\n`);
  out(`https://${name}-fake${state.deploys}.vercel.app\n`);
  done(0);
}
if (command === 'inspect') {
  out(JSON.stringify({ aliases: state.alias ? [state.alias] : [] }));
  done(0);
}
process.stderr.write(`fake vercel: no answer for ${JSON.stringify(args)}\n`);
done(3);
