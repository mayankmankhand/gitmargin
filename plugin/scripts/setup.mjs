#!/usr/bin/env node
// gitmargin's setup command (issue #36), for the author to run in their own
// terminal:
//
//   node "<this plugin's folder>/scripts/setup.mjs"
//
// It sets up the author's comment service in their own Vercel account, or
// deploys a newer one after a plugin update. `gitmargin services --json`
// prints this exact line as `setupCommand`, and the share skill hands it over.
//
// It lives here, not in bin/, on purpose: bin/ is on PATH inside Claude Code,
// and the share skill lets Claude run any `gitmargin ...` command without
// asking. This one deploys and handles the secret, so it is only ever run by
// the author. The logic is src/cli/setup.js; the service it deploys is the one
// that came with this plugin, beside this folder.

import { fileURLToPath } from 'node:url';
import { main } from '../src/cli/setup.js';

process.exitCode = await main({ serviceSource: fileURLToPath(new URL('../service', import.meta.url)) });
