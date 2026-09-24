// The GitLab half of gitmargin-publish (issue #37): one attached prototype to
// the GitLab Pages site of a PRIVATE gitlab.com project, where only the
// project's members can open it, after GitLab's own login.
//
// Same shape as the GitHub half in publish-branch.mjs: a branch of its own,
// gitmargin-pages, one folder per prototype, built with the core's
// temporary-worktree commit, so the author's checkout, branches, hooks and own
// build file are never touched. Two things differ because GitLab Pages does:
//
// - GitLab publishes Pages only through a CI build. The branch carries its own
//   .gitlab-ci.yml, whose one job is named `pages` and runs only on this
//   branch; the pages already sit in public/, so the job copies nothing. On the
//   free plan a `pages` job on ANY branch replaces the project's one live site
//   (Pages is branch-independent; parallel deployments are Premium), which is
//   why a site the project already has is left alone.
// - Who can open the page is a project setting, pages_access_level, and
//   "private" is GitLab's name for "Only project members". --enable sets it,
//   BEFORE the push, so no build of this branch can ever go live more widely.
//
// Every refusal comes before any change (the first promise at the top of
// publish-branch.mjs): nothing is set and nothing is pushed until every check
// has passed. The link is read from GitLab after the build, because new
// projects get a unique address (name-a1b2c3.gitlab.io) that cannot be worked
// out in advance.
//
// It talks to GitLab through glab, the GitLab CLI, as the GitHub half talks
// through gh. Every call names gitlab.com, and glab runs with the host and
// token variables it reads removed from its environment: glab applies them to
// every host, so a company server's address or token in the author's shell
// could otherwise redirect these calls or be sent to gitlab.com. What glab
// prints and exits with was measured on glab 1.119.0 (plans/PLAN-issue-37.md,
// Outcomes, Step 1); tests/publish-gitlab.test.js's stand-in copies it.
//
// It imports node: built-ins only, like the rest of the publisher.

import { spawnSync } from 'node:child_process';
import {
  EXIT_OK,
  EXIT_REFUSED,
  PublishError,
  firstLines,
  pageLink,
  pollInterval,
  publishCommit,
  remoteTip,
  remoteUrls,
  requireCommits,
  sleep,
  webAddress,
  withoutAuthorSecrets,
} from './publish-core.mjs';

const HOST = 'gitlab.com';
const DEFAULT_WAIT_SECONDS = 300;

// GitLab's role numbers. Reading the Pages address and changing who can open
// the page both need Maintainer.
const MAINTAINER = 40;
const ROLE_NAMES = { 0: 'not a member', 5: 'Minimal Access', 10: 'Guest', 15: 'Planner', 20: 'Reporter', 30: 'Developer', 40: 'Maintainer', 50: 'Owner' };

// What a job's log says when gitlab.com will not run CI for an account that
// has not verified itself yet (GitLab's own wording, doc/ci/debugging.md).
const VERIFICATION_TEXT = 'Identity verification is required in order to run CI jobs';

/**
 * The variables glab reads that name a host, a token, or how to reach the
 * API (docs.gitlab.com/cli/configuration, 2026-09-24). They apply to every
 * host, so each one is removed before glab runs. Proxy and certificate
 * variables stay: a company network may need them to reach gitlab.com at all.
 */
export const GLAB_STRIPPED = [
  'GITLAB_HOST',
  'GITLAB_URI',
  'GL_HOST',
  'GITLAB_API_HOST',
  'GITLAB_TOKEN',
  'GITLAB_ACCESS_TOKEN',
  'OAUTH_TOKEN',
  'GLAB_API_PROTOCOL',
  'API_PROTOCOL',
  'GITLAB_SUBFOLDER',
  'GLAB_SKIP_TLS_VERIFY',
  'SKIP_TLS_VERIFY',
  'GLAB_ENABLE_CI_AUTOLOGIN',
  'GITLAB_CI',
  'CI_JOB_TOKEN',
  'CI_SERVER_FQDN',
];

// No prompts, no update check, no "what's new" banner on stderr, no colour,
// and no usage data sent to GitLab (glab sends it by default).
const GLAB_QUIET = {
  GLAB_NO_PROMPT: 'true',
  GLAB_CHECK_UPDATE: 'false',
  GLAB_SHOW_WHATS_NEW: 'false',
  GLAB_SEND_TELEMETRY: 'false',
  GLAB_PAGER: 'cat',
  NO_COLOR: '1',
};

// ---------------------------------------------------------------------------
// Pure rules, exported so the tests can check them without a repository.

/**
 * The project path from a gitlab.com remote (`group/sub/project`), or null.
 *
 * Only gitlab.com, anchored like the GitHub parser, so gitlab.com.example.net
 * or example.net/gitlab.com do not pass. Groups nest, so the path has two or
 * more parts. The remote URL itself is never printed: an https remote can
 * carry a token in its user part.
 */
export function parseGitLabRemote(url) {
  const value = String(url || '').trim();
  const match =
    /^(?:https?|ssh|git):\/\/(?:[^@/]*@)?gitlab\.com(?::\d+)?\/(.+?)(?:\.git)?\/?$/i.exec(value) ||
    /^(?:[^@/:]+@)?gitlab\.com:\/?(.+?)(?:\.git)?\/?$/i.exec(value);
  if (!match) return null;
  const parts = match[1].split('/');
  if (parts.length < 2 || parts.length > 20) return null;
  if (!parts.every((part) => /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(part) && !part.includes('..'))) return null;
  return { path: parts.join('/') };
}

/**
 * The build file the branch carries. One job named `pages` (the name GitLab
 * requires), a script that does nothing because the pages are already in
 * public/, and a rule so it runs on this branch alone. No image line: the
 * runner's default is what the by-hand walk of issue #18 ran, and it passed.
 */
export function ciFile(branch) {
  return [
    '# Written by gitmargin-publish. This branch holds only pages shared for review,',
    '# one folder per prototype under public/. The job below publishes them as the',
    "# project's GitLab Pages site; it runs on this branch alone, so it never builds",
    '# anything of yours.',
    'pages:',
    '  stage: deploy',
    '  script:',
    '    - echo "The review pages are already in public/."',
    '  artifacts:',
    '    paths:',
    '      - public',
    '  rules:',
    `    - if: $CI_COMMIT_BRANCH == "${branch}"`,
    '',
  ].join('\n');
}

/**
 * Whether a build file publishes Pages: a line whose key is `pages:`, which is
 * both a job named `pages` and the `pages:` keyword inside a job of another
 * name. Read as text, not parsed (there is no YAML library here), so it can
 * match a `pages:` that is neither; that only costs a refusal with the reason.
 * A Pages job pulled in through `include:` is not seen here. Before this
 * branch exists, the deployment check catches it once it has deployed; after
 * that, the two sites replace each other on every push (a stated limit,
 * docs/part-2-design.md section 8).
 */
export function publishesPages(buildFile) {
  return /^[ \t]*pages[ \t]*:/m.test(String(buildFile || ''));
}

const roleName = (level) => ROLE_NAMES[level] || `role ${level}`;
const secondsText = (count) => `${count} ${count === 1 ? 'second' : 'seconds'}`;

function describeAccess(level) {
  if (level === 'private') return 'open to project members only';
  if (level === 'disabled') return 'off';
  if (level === 'enabled') return 'open to everyone with access to the project';
  if (level === 'public') return 'open to everyone on the internet';
  return `set to ${level || 'nothing GitLab reported'}`;
}

/**
 * Whether a publish may go ahead, decided from what GitLab said. Every refusal
 * here happens before the setting changes and before the push.
 */
export function assess({ full, project, role, pages, defaultBuildFile, branchOnRemote }, { branch, enable }) {
  const serviceLink = 'Share it with the service link or as a file instead.';
  const visibility = String(project.visibility || 'unknown');
  if (visibility !== 'private') {
    return {
      blocked:
        `${full} is ${/^[aeiou]/.test(visibility) ? 'an' : 'a'} ${visibility} project. gitmargin publishes to GitLab Pages only from private ` +
        `projects: the page's key sits in the ${branch} branch, and in a ${visibility} project people outside it can read that branch.`,
      hint: serviceLink,
    };
  }
  if (role < MAINTAINER) {
    return {
      blocked:
        `Publishing to GitLab Pages needs the Maintainer or Owner role on ${full}, and this glab login is ${roleName(role)}: ` +
        'reading the Pages address and setting who can open the page both need it.',
      hint: 'Ask a Maintainer of the project to publish, or share another way.',
    };
  }
  if (project.builds_access_level === 'disabled' || project.jobs_enabled === false) {
    return {
      blocked: `CI/CD is off for ${full}, and GitLab Pages publishes only through a CI build.`,
      hint: serviceLink,
    };
  }
  const configPath = project.ci_config_path;
  if (configPath && configPath !== '.gitlab-ci.yml') {
    return {
      blocked: `${full} reads its build file from ${configPath}, so the build file on the ${branch} branch would be ignored.`,
      hint: serviceLink,
    };
  }
  const deployed = Boolean(pages && Array.isArray(pages.deployments) && pages.deployments.length);
  if (deployed && branchOnRemote !== 'exists') {
    return {
      blocked:
        `GitLab Pages for ${full} already serves a site. gitmargin leaves an existing site alone: on GitLab's free plan a project ` +
        'has one site, and publishing would replace it.',
      hint: serviceLink,
    };
  }
  if (publishesPages(defaultBuildFile)) {
    return {
      blocked:
        `The build file on ${full}'s ${project.default_branch} branch has a Pages job, so its site and gitmargin's would replace ` +
        'each other on every push.',
      hint: serviceLink,
    };
  }
  const membersOnly = project.pages_access_level === 'private';
  if (!membersOnly && !enable) {
    return {
      blocked: `GitLab Pages for ${full} is ${describeAccess(project.pages_access_level)}. Setting it to "Only project members" would change the project's settings.`,
      hint: 'Rerun with --enable once the author agrees.',
    };
  }
  return { blocked: null, hint: '', enableNow: !membersOnly };
}

// ---------------------------------------------------------------------------
// Running glab

function glabEnv() {
  const env = withoutAuthorSecrets(process.env);
  for (const name of GLAB_STRIPPED) delete env[name];
  return { ...env, ...GLAB_QUIET };
}

function glab(args) {
  const result = spawnSync('glab', args, { encoding: 'utf8', env: glabEnv(), maxBuffer: 16 * 1024 * 1024 });
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new PublishError(
        'The GitLab command line tool (glab) is not installed, or not on PATH.',
        EXIT_REFUSED,
        'Install it (https://gitlab.com/gitlab-org/cli#installation), then run: glab auth login --hostname gitlab.com'
      );
    }
    throw new PublishError(`Could not run glab: ${result.error.message}`, EXIT_REFUSED);
  }
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}

/** glab reports a 404 as "glab: 404 Project Not Found (HTTP 404)", with GitLab's JSON on stdout. */
function isNotFound(result) {
  if (/\(HTTP 404\)/.test(result.err)) return true;
  try {
    return /^404\b/.test(String(JSON.parse(result.out).message));
  } catch {
    return false;
  }
}

/**
 * One GitLab API call through glab, always to gitlab.com. Returns the parsed
 * answer (or the text, with `raw`), or null for a 404 when `notFoundOk`.
 */
function api(endpoint, { method = 'GET', fields = [], notFoundOk = false, raw = false } = {}) {
  const args = ['api', endpoint, '--hostname', HOST];
  if (method !== 'GET') args.push('--method', method);
  for (const [key, value] of fields) args.push('--raw-field', `${key}=${value}`);
  const result = glab(args);
  if (result.code === 0) {
    if (raw) return result.out;
    try {
      return JSON.parse(result.out);
    } catch {
      throw new PublishError(`glab gave an answer that is not JSON for ${endpoint}.`, EXIT_REFUSED);
    }
  }
  if (notFoundOk && isNotFound(result)) return null;
  const error = new PublishError(`GitLab said no to ${method} ${endpoint}: ${firstLines(result.err, 2) || `exit ${result.code}`}`, EXIT_REFUSED);
  error.notFound = isNotFound(result);
  throw error;
}

// ---------------------------------------------------------------------------
// Reading the state, before anything changes

/** Whether this repository's remote is a gitlab.com project (and not a github.com one first). */
export function gitlabTarget(root, remote) {
  const urls = remoteUrls(root, remote);
  if (!urls) return null;
  const target = parseGitLabRemote(urls.raw) || parseGitLabRemote(urls.expanded);
  return target ? { ...target, full: target.path, id: encodeURIComponent(target.path) } : null;
}

function requireLogin() {
  const result = glab(['auth', 'status', '--hostname', HOST]);
  if (result.code !== 0) {
    throw new PublishError(
      'The GitLab CLI (glab) is not logged in to gitlab.com.',
      EXIT_REFUSED,
      'Run: glab auth login --hostname gitlab.com (a token only in the environment is not used here).'
    );
  }
}

function readProject(target) {
  try {
    return api(`projects/${target.id}`);
  } catch (error) {
    if (error.notFound) throw new PublishError(`GitLab cannot find ${target.full}, or this glab login cannot see it.`, EXIT_REFUSED);
    throw error;
  }
}

/**
 * This login's role on the project, counting roles inherited through groups.
 * The project's own `permissions` field names only a direct membership and
 * the direct parent group, so an owner whose access comes through a group
 * higher up would read as having none.
 */
function readRole(project) {
  const user = api('user');
  const member = api(`projects/${project.id}/members/all/${user.id}`, { notFoundOk: true });
  return Number((member && member.access_level) || 0);
}

/**
 * The Pages settings, or null when Pages is off for the project (GitLab's 404).
 * Before the first deployment GitLab still answers, with the site's address
 * and an empty `deployments` list (lib/api/pages.rb, read 2026-09-24).
 */
function readPages(project) {
  return api(`projects/${project.id}/pages`, { notFoundOk: true });
}

/** The default branch's build file, or '' when it has none (or the project is empty). */
function readDefaultBuildFile(project) {
  if (!project.default_branch || project.empty_repo) return '';
  const file = encodeURIComponent('.gitlab-ci.yml');
  const ref = encodeURIComponent(project.default_branch);
  return api(`projects/${project.id}/repository/files/${file}/raw?ref=${ref}`, { notFoundOk: true, raw: true }) || '';
}

/**
 * The branch's tip, read with git itself. For a private project this needs
 * git's own login to gitlab.com (an SSH key, or HTTPS through a credential
 * helper), which is separate from glab's API login; reading it before any
 * change means a missing git login stops the publish while nothing is changed.
 */
function readTip(root, opts, target) {
  try {
    return remoteTip(root, opts.remote, opts.branch);
  } catch (error) {
    throw new PublishError(
      `git could not read ${target.full} from the ${opts.remote} remote, so nothing was changed. ${error.message}`,
      EXIT_REFUSED,
      'git uses its own login for gitlab.com, the one you clone and push with, not glab\'s. Check that `git fetch` works in this project.'
    );
  }
}

/** Everything the verdict needs, read in one place for --status and the publish alike. */
function readState(root, opts, target) {
  requireLogin();
  const project = readProject(target);
  const role = readRole(project);
  const tip = readTip(root, opts, target);
  // Below Maintainer GitLab will not answer about Pages, and the verdict
  // refuses on the role anyway, so nothing more is asked.
  const pages = role >= MAINTAINER ? readPages(project) : null;
  // A project that was empty at its first publish takes the first branch
  // pushed to it as its default, which is this one: its build file is
  // gitmargin's own, not a site of the author's to protect.
  const ownDefault = Boolean(project.default_branch) && project.default_branch === opts.branch;
  const defaultBuildFile = role >= MAINTAINER && !ownDefault ? readDefaultBuildFile(project) : '';
  return { project, role, tip, pages, defaultBuildFile, ownDefault, branchOnRemote: tip ? 'exists' : 'absent' };
}

// ---------------------------------------------------------------------------
// After the push

/** Why a failed build failed, from its first failed job. */
function explainFailure(project, pipeline) {
  let job = null;
  try {
    job = (api(`projects/${project.id}/pipelines/${pipeline.id}/jobs?scope[]=failed`) || [])[0] || null;
  } catch {
    // Without the jobs, GitLab's reason is unknown; the pipeline link still says it.
  }
  const reason = (job && job.failure_reason) || 'unknown';
  let log = '';
  if (job) {
    try {
      log = api(`projects/${project.id}/jobs/${job.id}/trace`, { raw: true, notFoundOk: true }) || '';
    } catch {
      // A log that cannot be read leaves the reason to speak for itself.
    }
  }
  // An account GitLab has not verified may be stopped before the job starts,
  // with nothing in the log: any reason but the script's own failure counts.
  const verification = log.includes(VERIFICATION_TEXT) || reason !== 'script_failure';
  return { job: job ? job.name : null, reason, verification };
}

/**
 * Follow GitLab's pipeline for THIS commit on the branch until it succeeds or
 * stops, or the time is up. The newest pipeline for the commit is the one that
 * counts. In the first seconds after a push there is none yet, which is not a
 * failure: waiting goes on until the deadline. With `once`, it looks one time
 * and reports what it saw.
 */
async function waitForPipeline(project, commit, branch, seconds, { once = false } = {}) {
  if (seconds <= 0) return { status: 'not-waited', pipeline: null };
  const interval = pollInterval();
  const deadline = Date.now() + seconds * 1000;
  let newest = null;
  for (;;) {
    try {
      const list = api(`projects/${project.id}/pipelines?sha=${commit}&ref=${encodeURIComponent(branch)}`) || [];
      newest = list.slice().sort((a, b) => b.id - a.id)[0] || newest;
    } catch {
      // The page is already pushed; a failed look at the build is not a
      // failed publish. Try again on the next round.
    }
    const state = newest && newest.status;
    if (state === 'success') return { status: 'built', pipeline: newest };
    if (state === 'failed') return { status: 'failed', pipeline: newest };
    if (state === 'canceled' || state === 'skipped' || state === 'manual') return { status: 'not-run', pipeline: newest };
    if (once || Date.now() + interval > deadline) {
      if (!newest) return { status: 'not-started', pipeline: null };
      return { status: state === 'running' ? 'running' : 'waiting', pipeline: newest };
    }
    await sleep(interval);
  }
}

/** What an unfinished build means, in one sentence. */
function describeUnfinished(build, project) {
  if (build.status === 'not-started') return 'GitLab has not started a build for this commit yet.';
  if (build.status === 'waiting') {
    return project.shared_runners_enabled === false
      ? `The build is waiting for a runner, and shared runners are off for this project.`
      : 'The build is waiting for a runner to pick it up.';
  }
  return 'GitLab is still building the page.';
}

// ---------------------------------------------------------------------------
// The two modes

export async function status(opts, root) {
  const target = gitlabTarget(root, opts.remote);
  const state = readState(root, opts, target);
  const { project, role, pages } = state;
  // Asked as if --enable were given, so a setting that is not members-only
  // reads as "ready once it is set" rather than as a refusal.
  const verdict = assess({ full: target.full, ...state }, { branch: opts.branch, enable: true });
  // Below Maintainer, Pages was not asked about: unknown. From a Maintainer,
  // no answer (a 404) means nothing is published yet.
  const deployed = role >= MAINTAINER ? Boolean(pages && Array.isArray(pages.deployments) && pages.deployments.length) : null;
  const report = {
    host: 'gitlab',
    project: target.full,
    visibility: project.visibility || null,
    role: roleName(role),
    remote: opts.remote,
    branch: opts.branch,
    branchOnRemote: state.branchOnRemote,
    pages: { access: project.pages_access_level || null, deployed, url: (pages && webAddress(pages.url)) || null },
    sharedRunners: project.shared_runners_enabled !== false,
    link: deployed && state.branchOnRemote === 'exists' && opts.folder !== null ? pageLink(pages.url, opts.folder) : null,
    publish: verdict.blocked ? 'refused' : verdict.enableNow ? 'needs-enable' : 'ready',
    reason: verdict.blocked || null,
  };
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return EXIT_OK;
  }
  const lines = [
    `project     ${report.project} (${report.visibility}), you are ${report.role}`,
    `pages       ${describeAccess(report.pages.access)}${deployed ? `, serving ${report.pages.url}` : deployed === false ? ', nothing published yet' : ''}`,
    `branch      ${opts.branch} ${state.branchOnRemote === 'exists' ? `exists on ${opts.remote}` : `is not on ${opts.remote} yet`}`,
  ];
  if (!report.sharedRunners) lines.push('runners     shared runners are off: the build needs a runner of the project\'s own');
  if (report.link) lines.push(`link        ${report.link}`);
  lines.push(
    `publish     ${report.publish === 'ready' ? 'ready' : report.publish === 'needs-enable' ? 'ready once Pages is set to Only project members (--enable)' : `refused: ${report.reason}`}`
  );
  process.stdout.write(`${lines.join('\n')}\n`);
  return EXIT_OK;
}

export async function publish(opts, root, page) {
  const target = gitlabTarget(root, opts.remote);
  requireCommits(root);

  // GitLab's side, read in full before anything changes.
  const state = readState(root, opts, target);
  const { project } = state;
  const verdict = assess({ full: target.full, ...state }, opts);
  if (verdict.blocked) throw new PublishError(verdict.blocked, EXIT_REFUSED, verdict.hint);
  if (state.ownDefault) {
    process.stderr.write(
      `The ${opts.branch} branch is ${target.full}'s default branch, because the project was empty when it was first published. ` +
        'When you add your own work, set another default branch in the project\'s settings.\n'
    );
  }
  if (project.shared_runners_enabled === false) {
    process.stderr.write(`Shared runners are off for ${target.full}, so the build needs a runner of the project's own.\n`);
  }
  if (!page.service) {
    process.stderr.write(
      "This copy was attached without --service, so each reviewer's comments stay in their own browser until they send the file back.\n"
    );
  }

  let enabled = false;
  if (verdict.enableNow) {
    // Before the push: no build of this branch may ever go live with wider
    // access than the project's members.
    try {
      api(`projects/${project.id}`, { method: 'PUT', fields: [['pages_access_level', 'private']] });
    } catch (error) {
      throw new PublishError(`GitLab did not set Pages to "Only project members", so nothing was published: ${error.message}`, EXIT_REFUSED);
    }
    const after = readProject(target);
    if (after.pages_access_level !== 'private') {
      throw new PublishError(
        `GitLab still reports Pages for ${target.full} as ${describeAccess(after.pages_access_level)}, so nothing was published.`,
        EXIT_REFUSED,
        'Set it in the project\'s Settings, General, Visibility, Pages, to "Only project members", then publish again.'
      );
    }
    enabled = true;
    process.stderr.write(`Set GitLab Pages for ${target.full} to "Only project members".\n`);
  }

  const files = [
    { path: `public/${opts.folder}/index.html`, bytes: page.bytes },
    { path: '.gitlab-ci.yml', bytes: ciFile(opts.branch) },
  ];
  const message = `Publish ${opts.folder} for review (${page.versionId})`;
  const pushedAt = Date.now();
  const { commit, pushed } = publishCommit(root, opts, { files, message, label: target.full }, state.tip);
  process.stderr.write(
    pushed
      ? `Published ${opts.folder} to the ${opts.branch} branch of ${target.full} (commit ${commit.slice(0, 7)}).\n`
      : `Nothing changed: ${opts.folder} on the ${opts.branch} branch already has these exact bytes.\n`
  );
  process.stderr.write(`Only members of ${target.full} can open this page, after GitLab's login.\n`);

  const wait = opts.wait ?? DEFAULT_WAIT_SECONDS;
  if (pushed && wait > 0) process.stderr.write(`Waiting up to ${wait} seconds for GitLab to build the page.\n`);
  // Unchanged bytes get one look at the commit's pipeline, not a wait: it may
  // be the last publish's build, still running, or one that failed.
  let build = await waitForPipeline(project, commit, opts.branch, wait, { once: !pushed });
  let startedAt = pushedAt;
  let rebuilt = false;
  if (!pushed && (build.status === 'failed' || build.status === 'not-run')) {
    // The page is already on the branch, so sharing it again means building
    // it again: the failure hint asks for exactly this once the cause is
    // fixed (a new account that has now verified itself, a runner switched
    // on). Without it, the same bytes would re-read the same failure forever.
    try {
      api(`projects/${project.id}/pipeline`, { method: 'POST', fields: [['ref', opts.branch]] });
    } catch (error) {
      throw new PublishError(`The last build of this page did not finish, and GitLab did not start a new one: ${error.message}`, EXIT_REFUSED);
    }
    rebuilt = true;
    startedAt = Date.now();
    process.stderr.write(`The last build of this page did not finish, so GitLab is building it again. Waiting up to ${wait} seconds.\n`);
    build = await waitForPipeline(project, commit, opts.branch, wait);
  }
  const seconds = (pushed || rebuilt) && build.status === 'built' ? Math.round((Date.now() - startedAt) / 1000) : null;

  let detail = null;
  if (build.status === 'built') {
    try {
      detail = api(`projects/${project.id}/pipelines/${build.pipeline.id}`);
    } catch {
      // The timing breakdown is extra; the total above stands without it.
    }
    if (seconds !== null) {
      // GitLab can leave queued_duration empty (the walk's first build did),
      // so the run time is reported on its own when the wait is missing.
      const ran = detail && Number.isFinite(detail.duration) ? Math.round(detail.duration) : null;
      const queued = detail && Number.isFinite(detail.queued_duration) ? Math.round(detail.queued_duration) : null;
      const parts = ran === null ? ''
        : queued === null ? ` (the build ran for ${secondsText(ran)})`
        : ` (the build waited ${secondsText(queued)} for a runner and ran for ${ran})`;
      process.stderr.write(`GitLab built the page ${secondsText(seconds)} after ${rebuilt ? 'the new build started' : 'the push'}${parts}.\n`);
    }
  }

  const site = readPages(project);
  // GitLab answers with the site's address even before anything is deployed
  // (only a project with Pages off answers 404), so whether the site is up is
  // read from its deployments, not from the address. A first publish whose
  // build has not finished therefore has no link to hand out yet.
  const live = Boolean(site && Array.isArray(site.deployments) && site.deployments.length);
  const link = site && site.url && (live || build.status === 'built') ? pageLink(site.url, opts.folder) : null;
  const result = {
    host: 'gitlab',
    project: target.full,
    branch: opts.branch,
    folder: opts.folder,
    commit,
    pushed,
    enabled,
    link,
    build: build.status,
    buildError: null,
    seconds,
    pipeline: build.pipeline
      ? {
          id: build.pipeline.id,
          url: webAddress(build.pipeline.web_url),
          duration: detail && Number.isFinite(detail.duration) ? detail.duration : null,
          queuedDuration: detail && Number.isFinite(detail.queued_duration) ? detail.queued_duration : null,
        }
      : null,
  };
  const printJson = () => opts.json && process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (build.status === 'failed' || build.status === 'not-run') {
    let hint = 'The branch was pushed; open the pipeline on GitLab to see why, then publish again.';
    if (build.status === 'failed') {
      const why = explainFailure(project, build.pipeline);
      result.buildError = `${why.job || 'a job'}: ${why.reason}`;
      if (why.verification) {
        hint =
          'A new gitlab.com account may have to verify itself (a phone number or a card) before its builds run; the failed job on GitLab ' +
          'says so if that is it. Then publish again.';
      }
    } else {
      result.buildError = `the pipeline is ${build.pipeline.status}`;
    }
    printJson();
    const pipelineUrl = build.pipeline && webAddress(build.pipeline.web_url);
    const where = pipelineUrl ? ` ${pipelineUrl}` : '';
    throw new PublishError(
      build.status === 'failed'
        ? `GitLab's build of the page failed (${result.buildError}).${where}`
        : `GitLab did not run the build (${result.buildError}).${where}`,
      EXIT_REFUSED,
      hint
    );
  }

  if (build.status !== 'built' && !link) {
    // A first publish still building: the site is not up yet.
    printJson();
    throw new PublishError(
      `${describeUnfinished(build, project)} The page is pushed, but GitLab puts the site up only when the first build finishes.`,
      EXIT_REFUSED,
      `Run gitmargin-publish --status --folder ${opts.folder} in a minute for the link.`
    );
  }
  if (!link) {
    printJson();
    throw new PublishError(`GitLab built the page but gave no address for the Pages site of ${target.full}.`, EXIT_REFUSED, 'Check again with --status in a minute.');
  }
  if (pushed && build.status === 'not-waited') {
    process.stderr.write('Not waiting for GitLab to build the page. Until it finishes, the link shows the previous version, or a 404 if this is the first.\n');
  }
  const unfinished = build.status === 'running' || build.status === 'waiting' || (pushed && build.status === 'not-started');
  if (unfinished) {
    process.stderr.write(`${describeUnfinished(build, project)} Until it finishes, the link shows the previous version, or a 404 if this is the first.\n`);
  }
  process.stdout.write(opts.json ? `${JSON.stringify(result, null, 2)}\n` : `${link}\n`);
  return EXIT_OK;
}
