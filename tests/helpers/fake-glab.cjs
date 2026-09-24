// A stand-in for glab, the GitLab CLI, for tests/publish-gitlab.test.js and the
// headless rehearsals of the share skill (tests/plugin-evals/README.md).
//
// Put a `glab` launcher that runs this file first on PATH. It answers the API
// calls gitmargin-publish makes from a JSON state file (FAKE_GLAB_STATE),
// records every call (FAKE_GLAB_LOG) with the host and token variables it
// could see (FAKE_GLAB_WATCH) and how many pushes had reached the bare
// repository standing in for gitlab.com (FAKE_GLAB_BARE, FAKE_GLAB_PUSHES), and
// refuses anything else with exit 3.
//
// It is no kinder than the real thing. Its refusals copy what glab 1.119.0
// printed (plans/PLAN-issue-37.md, Outcomes, Step 1): GitLab's JSON on stdout
// with no newline, one "glab: <message> (HTTP <code>)" line on stderr, exit 1.
// Like glab it counts a GITLAB_TOKEN in its environment as a login, and like
// GitLab it filters pipelines by commit and branch only when asked to.
//
// State switches: loggedIn, role (GitLab's access number), project, pages (null
// until the first deployment, then the settings with it), pagesAfter (no
// deployment for the first N looks at Pages), defaultCi (null
// for no build file), pipelines ([{ id, sha: 'TIP' | <sha>, ref, statuses }],
// one status per look, 'none' for not there yet), failedJob ({ reason, log }),
// projectMissing, putRefused, putIgnored.

'use strict';

const fs = require('fs');
const { execFileSync: run } = require('child_process');
const args = process.argv.slice(2);
const file = process.env.FAKE_GLAB_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2));
const pushes = () => fs.readFileSync(process.env.FAKE_GLAB_PUSHES, 'utf8').split('\n').filter(Boolean).length;
// Every call, with the host and token variables it could see and how many
// pushes had reached the remote, so order and stripping can be checked.
const seen = JSON.parse(process.env.FAKE_GLAB_WATCH).filter((name) => name in process.env);
fs.appendFileSync(process.env.FAKE_GLAB_LOG, `${JSON.stringify({ args, seen, pushes: pushes(), quiet: process.env.GLAB_SEND_TELEMETRY })}\n`);

const answer = (body) => {
  process.stdout.write(typeof body === 'string' ? body : JSON.stringify(body));
  process.exit(0);
};
// What glab 1.119.0 does with a refusal (measured).
const refuse = (code, message) => {
  process.stdout.write(JSON.stringify({ message: `${code} ${message}` }));
  process.stderr.write(`glab: ${code} ${message} (HTTP ${code})\n`);
  process.exit(1);
};
const unknown = () => {
  process.stderr.write(`fake glab: no answer for ${JSON.stringify(args)}\n`);
  process.exit(3);
};
const tip = (branch) => {
  try {
    return run('git', ['--git-dir', process.env.FAKE_GLAB_BARE, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};
// Real glab counts a token in its environment as a login.
const loggedIn = state.loggedIn || 'GITLAB_TOKEN' in process.env;

if (args[0] === 'auth' && args[1] === 'status') {
  if (args[2] !== '--hostname' || args[3] !== 'gitlab.com') unknown();
  if (loggedIn) {
    process.stderr.write('gitlab.com\n  ✓ Logged in to gitlab.com as acme-owner (config file)\n');
    process.exit(0);
  }
  process.stderr.write(
    'gitlab.com\n  x gitlab.com: API call failed: GET https://gitlab.com/api/v4/user: 401 {message: 401 Unauthorized}\n' +
      '  ! No token found (checked config file, keyring, and environment variables).\n'
  );
  process.exit(1);
}
if (args[0] !== 'api') unknown();
let method = 'GET';
let endpoint = null;
let host = null;
const fields = {};
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === '--method' || a === '-X') method = args[++i];
  else if (a === '--hostname') host = args[++i];
  else if (a === '--raw-field' || a === '-f') {
    const [key, ...rest] = args[++i].split('=');
    fields[key] = rest.join('=');
  } else if (a.startsWith('-')) unknown();
  else if (endpoint === null) endpoint = a;
  else unknown();
}
if (host !== 'gitlab.com') unknown();
if (!loggedIn) refuse(401, 'Unauthorized');
const [where, query = ''] = endpoint.split('?');
const params = new URLSearchParams(query);
const id = state.project.id;
const resolve = (sha) => (sha === 'TIP' ? tip('gitmargin-pages') : sha);

if (method === 'GET' && where === `projects/acme%2Fteam%2Fsite`) return state.projectMissing ? refuse(404, 'Project Not Found') : answer(state.project);
if (method === 'GET' && where === 'user') return answer({ id: 7, username: 'acme-owner' });
if (method === 'GET' && where === `projects/${id}/members/all/7`) return state.role ? answer({ id: 7, access_level: state.role }) : refuse(404, 'Not found');
if (method === 'GET' && where === `projects/${id}/pages`) {
  if (state.role < 40) return refuse(403, 'Forbidden');
  // Like GitLab (lib/api/pages.rb): a 404 only when Pages is off for the
  // project. Otherwise the settings, with the site's address, and an empty
  // deployments list until the first deployment.
  if (state.project.pages_access_level === 'disabled') return refuse(404, 'Not Found');
  state.pagesLooks = (state.pagesLooks || 0) + 1;
  save();
  if (state.pagesAfter && state.pagesLooks >= state.pagesAfter && !state.pages) {
    state.pages = { url: state.siteUrl, is_unique_domain_enabled: true, deployments: [{ created_at: '2026-09-24T10:00:00Z', url: state.siteUrl, path_prefix: null, root_directory: 'public' }] };
    save();
  }
  return answer(state.pages || { url: state.siteUrl, is_unique_domain_enabled: true, deployments: [] });
}
if (method === 'GET' && where === `projects/${id}/repository/files/.gitlab-ci.yml/raw`) {
  if (params.get('ref') !== state.project.default_branch) unknown();
  return state.defaultCi === null ? refuse(404, 'File Not Found') : answer(state.defaultCi);
}
if (method === 'PUT' && where === `projects/${id}`) {
  if (state.role < 40) return refuse(403, 'Forbidden');
  if (state.putRefused) return refuse(400, 'Bad request');
  if (!state.putIgnored && fields.pages_access_level) state.project.pages_access_level = fields.pages_access_level;
  save();
  return answer(state.project);
}
if (method === 'GET' && where === `projects/${id}/pipelines`) {
  // Like GitLab: sha and ref filter only when given.
  const visible = [];
  for (const p of state.pipelines) {
    if (params.has('sha') && resolve(p.sha) !== params.get('sha')) continue;
    if (params.has('ref') && p.ref !== params.get('ref')) continue;
    const status = p.statuses.length > 1 ? p.statuses.shift() : p.statuses[0];
    p.current = status;
    if (status === 'none') continue;
    if (status === 'success' && resolve(p.sha) && !state.pages) {
      // GitLab creates the site with its first deployment.
      state.pages = { url: state.siteUrl, is_unique_domain_enabled: true, deployments: [{ created_at: '2026-09-24T10:00:00Z', url: state.siteUrl, path_prefix: null, root_directory: 'public' }] };
    }
    visible.push({ id: p.id, iid: p.id - 800, project_id: id, sha: resolve(p.sha), ref: p.ref, status, source: 'push', web_url: `https://gitlab.com/${state.project.path_with_namespace}/-/pipelines/${p.id}`, name: null });
  }
  save();
  return answer(visible);
}
const one = /^projects\/\d+\/pipelines\/(\d+)$/.exec(where);
if (method === 'GET' && one) {
  const p = state.pipelines.find((x) => String(x.id) === one[1]);
  return p ? answer({ id: p.id, status: p.current, duration: 20.4, queued_duration: 3.6, web_url: `https://gitlab.com/x/-/pipelines/${p.id}` }) : refuse(404, 'Not found');
}
const jobs = /^projects\/\d+\/pipelines\/(\d+)\/jobs$/.exec(where);
if (method === 'GET' && jobs) {
  if (params.get('scope[]') !== 'failed') unknown();
  return answer(state.failedJob ? [{ id: 55, name: 'pages', stage: 'deploy', status: 'failed', failure_reason: state.failedJob.reason }] : []);
}
if (method === 'GET' && where === `projects/${id}/jobs/55/trace`) return state.failedJob ? answer(state.failedJob.log) : refuse(404, 'Not Found');
return unknown();
