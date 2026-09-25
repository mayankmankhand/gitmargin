// Where a sign-in pass may be kept in browser storage (security audit of #30,
// R3). On a host where every site of one owner shares one origin, storage is
// shared with pages other people publish there, so the pass stays in memory
// for the tab, as it does for a file opened from disk.

import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedOriginHost } from '../src/overlay/sync.js';

test('GitHub Pages and every GitLab Pages host count as shared storage', () => {
  assert.equal(sharedOriginHost('owner.github.io'), true);
  assert.equal(sharedOriginHost('Some-Org.GitHub.io'), true);
  assert.equal(sharedOriginHost('group.gitlab.io'), true);
  assert.equal(sharedOriginHost('sub.group.gitlab.io'), true);
  // A unique project domain and a group named like one cannot be told apart by
  // shape, so both count as shared (review of #30, R21).
  assert.equal(sharedOriginHost('proto-a1b2c3.gitlab.io'), true);
  assert.equal(sharedOriginHost('release-202409.gitlab.io'), true);
});

test('every other host has an origin of its own', () => {
  assert.equal(sharedOriginHost('proto.vercel.app'), false);
  assert.equal(sharedOriginHost('proto-abc123-team.vercel.app'), false);
  assert.equal(sharedOriginHost('example.com'), false);
  assert.equal(sharedOriginHost('127.0.0.1'), false);
  assert.equal(sharedOriginHost(''), false);
  assert.equal(sharedOriginHost(undefined), false);
});
