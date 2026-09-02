# How others have tried to solve private-prototype feedback

Research date 2026-08-31 · prepared for the gitmargin project

## 1. Executive summary

Plenty of tools let a reviewer comment on a web page, but each solves only a slice of gitmargin's problem, and does so inside its own walls: builder-hosted previews ([Lovable](https://docs.lovable.dev/features/project-comments), [Figma Make](https://help.figma.com/hc/en-us/articles/38701587731735-Add-comments-in-Figma-Make), [Claude Code artifacts](https://code.claude.com/docs/en/artifacts), [Vercel](https://vercel.com/docs/comments)) have on-page comments only for pages they host; Git-backed widgets ([giscus](https://giscus.app/), [Staticman](https://github.com/eduardoboucas/staticman)) keep comments with the code but have no element anchoring and assume public repos; identity-aware gates ([Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/), [Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/user-information)) know who the viewer is but offer no comments.

Verdict: partially solved. Every sub-problem is solved somewhere; nothing solves them together and portably. No existing tool gives element-anchored comments on an arbitrary private HTML page, signed with the account that already gates that page, stored in the team's own repo, independent of the host.

Three things to know:
1. GitLab built almost exactly this ([Visual Reviews](https://gitlab.com/gitlab-org/gitlab/-/issues/387751): one script tag posting comments into the merge request) and removed it in 17.0 citing "limited customer usage and capabilities". Its pasted-token login is the most plausible reason. That is both a validation and a warning.
2. GitHub still cannot complete OAuth from a static page (client secret [required](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), no CORS; the fix is a roadmap item [labelled "Paused" on 2026-08-13](https://github.com/github/roadmap/issues/1153)). GitLab [can](https://docs.gitlab.com/api/oauth2/). Build GitLab first.
3. On GitLab, "read-only reviewers can comment" and "comments live as files in the repo" cannot both be true: [Guests cannot push and cannot read repo files in private projects](https://docs.gitlab.com/user/permissions/). The Issues/Notes API is the only store where both promises hold, and it is also the inbox every coding agent already reads.

### In plain English - what this means for gitmargin

The sections below are dense and full of vendor names and technical terms (there is a glossary at the end). Here is the short version:

1. **Nobody has built the portable version.** Every piece exists somewhere - Vercel and Netlify have on-page comments for pages *they* host; Lovable, Figma Make and Claude artifacts have them inside *their* viewers; giscus and Staticman store comments in GitHub; Cloudflare Access and Azure know who is looking at a page. No tool combines "any private page + the viewer's real identity + stored in your own repo".
2. **GitLab tried this and gave up.** "Visual Reviews" (2019–2024) was one script tag that posted comments into the merge request. To use it on a private project, reviewers had to paste an API token - a terrible experience for a non-engineer - and GitLab removed it for low usage. The idea was not disproven; the login experience was. Sign-in has to be one click or the tool will not get used.
3. **Build for GitLab first, not GitHub.** GitLab lets a plain web page sign a user in with no server at all. GitHub still requires a secret that cannot live inside a web page, so GitHub support needs a small server function (every GitHub-based comment widget has one).
4. **Do not store comments as files in the repo.** On GitLab, the people you most want feedback from - read-only "Guest" and "Reporter" roles - cannot write files, and Guests cannot even *read* them in private projects. Store each comment as an issue or merge-request note instead: read-only roles can write those, they inherit the project's permissions automatically, and coding agents already read them (GitHub's and GitLab's MCP servers, Claude Code's GitHub Action, GitLab Duo). Keep the JSON idea as the *format of the note body*, not as a separate file.
5. **"An agent applies the comments" is no longer unique.** Vercel shipped a CLI that dumps comments as JSON for agents (20 Aug 2026) and GitLab's MCP server reads MR notes. gitmargin's real differentiator is *host independence* plus *storage inside the team's own permission boundary* - lead with that.
6. **Big-company hosting is a zoo, but it collapses to three identity types:** (a) Git-host login, (b) a gate in front of the page that already knows the user (Cloudflare Access, Azure Static Web Apps, oauth2-proxy, Pomerium…), and (c) corporate SSO. Design a small core plus an adapter for each. Only type (a) can *also* authorise writing the comment; the other two need a mapping to a Git-host user or a tiny backend.
7. **The first users are probably people like you:** technical PMs or developers already running Claude Code, hosting on GitLab or GitHub Pages, who need one or two colleagues to comment. Agencies (BugHerd's market) are a poor fit - their clients have no Git identity, and incumbents already give unlimited free guest reviewers.
8. **Expect security questions early.** A self-hosted, integrity-pinned script; tokens kept in memory only; comment text sanitised before it is rendered. The 2024 Polyfill.io supply-chain attack is why security teams now ask about any injected script.

## 2. How others have tried to solve it - by sub-problem

### 2.1 Accessing and commenting on the HTML

**Three ways onto a page.** (1) An in-page script tag works wherever the reviewer's browser can already load the page (VPN, basic auth, member-only Pages) and only the feedback leaves: [BugHerd](https://support.bugherd.com/en/articles/11424426-installing-bugherd-using-javascript), [Feedbucket](https://help.feedbucket.app/en/article/getting-started-with-feedbucket-18cmcyr/), [Superflow](https://usesuperflow.ai/comments), the [Hypothesis embed](https://github.com/hypothesis/client/blob/main/docs/publishers/embedding.rst), Vercel's [`@vercel/toolbar`](https://vercel.com/docs/vercel-toolbar/in-production-and-localhost/add-to-production). (2) A server-side proxy re-serves the page from the vendor's servers, so a private page needs IP allow-listing or your credentials passed through a third party ([Pastel](https://help.usepastel.com/en/articles/5986535-whitelisting-pastel-s-ips), [Ruttl](https://ruttl.com/blog/web-app/)); open proxies get abused, and Hypothesis [restricted its Via proxy again in February 2026](https://web.hypothes.is/blog/changes-to-via-hypothesis-proxy-server-for-annotation/). (3) A browser extension sees any page the reviewer sees, but every reviewer must install it, so vendors use it as a gate: [Marker.io](https://help.marker.io/en/articles/11948672-use-marker-io-widget-on-live-production-websites) recommends keeping the snippet off private sites and letting the extension inject the widget only for logged-in workspace members.

**Anchoring a comment to markup an AI may rewrite.** The shipped answer is a redundant bundle, not one selector. The Hypothesis client [stores three selectors per annotation](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/html.ts) (range, text position, text quote with prefix/suffix) and re-anchors cheapest-first (range, then position verified against the quote, then a quote search), marking the annotation an orphan if all fail. The [W3C Web Annotation model](https://www.w3.org/TR/annotation-model/) standardises those selector types and advises storing several "to maximize the chances that it will be discoverable later". Products add a screenshot captured at comment time as proof that survives redeploys ([Superflow](https://usesuperflow.ai/comments), [Figma Make](https://help.figma.com/hc/en-us/articles/38701587731735-Add-comments-in-Figma-Make)); [Lovable](https://docs.lovable.dev/features/project-comments) keeps an orphaned pin with a "could not be found" indicator. A 2015 study found [27% of Hypothesis annotations already orphaned](https://arxiv.org/abs/1512.06195) on the open web. Reliable click-to-source mapping exists only where the tool controls the build (Lovable's [stable JSX ids](https://lovable.dev/blog/visual-edits), [Onlook](https://github.com/onlook-dev/onlook), [Cursor](https://cursor.com/blog/design-mode)); for a static file the substitute is author-supplied stable attributes, as [human-review's `data-block`](https://github.com/petergyang/human-review/blob/main/src/SKILL.md) does.

**AI-era tools define the agent payload, not the team.** [human-review](https://github.com/petergyang/human-review) (local only) emits a JSON batch whose anchor `{prefix, quote, suffix}` is a W3C TextQuoteSelector in all but name; [Agentation](https://github.com/benjitaylor/agentation) and [Plannotator](https://github.com/backnotprop/plannotator) (the larger of the two, with encrypted share links) export selector-rich markdown for coding agents. None has reviewer identity or shared storage. Builder-native comments exist only inside the builder's viewer: Lovable's element pins, and Figma Make's comments, which Figma's help article (published 2026-02-27, "rolling out over the coming weeks" as of 2026-03-31) confirms are shipped, superseding an August 2025 forum reply that called them a feature request. [Webflow](https://webflow.com/blog/faster-feedback-cycles-in-webflow) added no-account comment-only links in October 2025, for Webflow sites only.

**Library status (corrected).** Apache Annotator was [retired from the Apache Incubator on 2025-08-11](https://incubator.apache.org/projects/annotator.html); [Annotator.js](https://github.com/openannotation/annotator/blob/master/REBOOT.md) has been unmaintained for about eleven years. Hypothesis is not the only maintained option, though: Recogito's [text-annotator-js](https://github.com/recogito/text-annotator-js) (W3C text selectors, released June 2026) and Annotorious (images) are active, and Hypothesis's anchoring now lives in-house rather than in the old `dom-anchor-*` packages.

**Where these fall short for a private, team-reviewed, AI-generated prototype.** Script-tag SaaS stores screenshots and page context in the vendor's cloud and needs vendor accounts; proxies cannot reach the page; builder-native comments do not follow an exported file to GitLab Pages or an internal server; agent-loop tools are single-user.

**Lesson for gitmargin:** ship an in-page script (never a proxy), anchor with CSS selector + text quote with context + screenshot, and treat "orphaned" as a normal state, not a failure.

### 2.2 The feedback trail

This report reads "undocumented" as *feedback that is not written down or tied to a version*. The other reading (the prototype itself has no docs) is covered at the end.

**Platform-native preview comments.** [Vercel Comments](https://vercel.com/docs/comments/managing-comments) keep threads with resolve state, an inbox filtered by branch and page, Slack sync and "convert to issue"; since 2026-08-20 a [`vercel comments` CLI](https://vercel.com/changelog/manage-vercel-toolbar-comments-from-the-cli) returns JSON with a literal prompt for coding agents, and the [Vercel MCP server](https://vercel.com/docs/agent-resources/vercel-mcp/tools) exposes six thread tools. The thread object already carries a [CSS selector, selected text, page path and deployment id](https://raw.githubusercontent.com/vercel/vercel/main/packages/cli/src/commands/comments/types.ts), the schema gitmargin would otherwise design. Vercel's docs admit comments are keyed to branch and path, and [a reviewer can comment on an outdated deployment](https://vercel.com/docs/comments/how-comments-work). [Netlify Drawer](https://docs.netlify.com/deploy/review-deploys/netlify-drawer-for-feedback/overview/) (alive; docs updated March 2026) mirrors preview comments two-way into the PR/MR on GitHub, GitLab and self-managed GitLab, but unlinked reviewers' comments are [attributed to whoever linked the repo](https://docs.netlify.com/deploy/review-deploys/netlify-drawer-for-feedback/troubleshoot-the-netlify-drawer/).

**The Git host's review model is the reference semantics.** GitLab keeps diff threads across force-pushes, can [auto-resolve threads a push made outdated](https://docs.gitlab.com/user/discussions/), and gates merge on "all threads resolved"; GitHub hides changed-line comments behind ["Show outdated"](https://github.com/orgs/community/discussions/23138). "Outdated" is a state, not a deletion. That is the right answer to "they commented on v3, the page is now v7".

**Build-tied snapshot review.** [Chromatic](https://www.chromatic.com/docs/review/) attaches threads to a specific snapshot and commit pair (whether UI Review is on the Free plan is unverified; three reads of the [pricing page](https://www.chromatic.com/pricing) disagreed); [Percy](https://www.browserstack.com/docs/percy/build-results/comments) carries a snapshot comment across builds until archived; [Argos](https://argos-ci.com/) exposes review state to agents through an MCP server. All are screenshot-based and need CI.

**Git-backed stores.** [Staticman](https://github.com/eduardoboucas/staticman) commits comments as files (dormant: last push April 2024, and its old docs domain now redirects to an unrelated site, so do not follow its README links); [giscus](https://giscus.app/) stores threads in GitHub Discussions but the hosted service requires a public repo; [git-bug](https://github.com/git-bug/git-bug) stores issues as git objects. None anchors to an element or a version.

**Versioning precedents.** [Figma Make](https://help.figma.com/hc/en-us/articles/38701587731735-Add-comments-in-Figma-Make) attaches a screenshot per comment and splits threads into "Current version" and "Other versions"; Hypothesis shows [orphans in their own tab](https://web.hypothes.is/blog/showing-orphaned-annotations/); the W3C model's [TimeState](https://www.w3.org/TR/annotation-model/) is a natural slot for a commit SHA.

**Agents already read PR/MR notes.** The [GitHub MCP server](https://github.com/github/github-mcp-server) reads and replies to PR review threads, issue and Discussion comments (hosted version does not support GitHub Enterprise Server); GitLab's built-in [MCP server](https://docs.gitlab.com/user/model_context_protocol/mcp_server_tools/) (beta, Free tier since 19.2, self-managed included) has `get_merge_request_notes` and `save_note`; GitLab's ["Resolve with GitLab Duo"](https://docs.gitlab.com/user/project/merge_requests/duo_in_merge_requests/) (GA 19.3, Premium/Ultimate) applies a discussion and resolves it in one click; [Claude Code's GitHub Action](https://code.claude.com/docs/en/github-actions), [Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent), [Cursor](https://cursor.com/docs/cloud-agent) and [Codex](https://learn.chatgpt.com/docs/third-party/gitlab) are all triggered by an @-mention in a PR/MR comment. No agent triggers on a JSON file changing.

**The other reading.** For "the prototype has no documentation", the nearest patterns are [Changesets](https://github.com/changesets/changesets) (a small change note committed with the change), [Storybook Autodocs](https://storybook.js.org/docs/writing-docs/autodocs) (docs generated from the artefact), and the bot that posts the preview URL on the PR ([Cloudflare](https://developers.cloudflare.com/pages/configuration/preview-deployments/), Vercel, Netlify). None records the conversation.

**Evidence of cost is thin.** The only sourced numbers come from a [proofing vendor's 2023 creative-workflow survey](https://www.ziflow.com/blog/the-2023-state-of-creative-workflow-report-key-findings-bonus-insights) (48% spend 5+ hours a month chasing feedback; 57% need 3–5 versions per deliverable). No survey quantifies prototype feedback lost in chat.

**Lesson for gitmargin:** write each thread as an MR/PR or issue note with the version pointer and anchor in a parseable block in the body; that is the one inbox every agent and both Git-host MCP servers already read.

### 2.3 Identity management

**Borrow identity from the Git host via OAuth** ([giscus](https://github.com/giscus/giscus), [utterances](https://utteranc.es/), [Vssue](https://github.com/meteorlxy/vssue), [Decap CMS](https://decapcms.org/docs/gitlab-backend/), [Sveltia CMS](https://sveltiacms.app/en/docs/backends/gitlab)). This is the only setup where an identity verified in the browser is also trusted by the place comments are written. The catch is asymmetric by host. GitLab supports [public-client PKCE with a CORS-enabled token endpoint](https://docs.gitlab.com/api/oauth2/), so a static overlay can sign in with zero backend, and [any user can register the OAuth app](https://docs.gitlab.com/integration/oauth_provider/). GitHub added PKCE on [2025-07-14](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/) but still marks `client_secret` as [required](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) at the token endpoint, which also lacks CORS per [GitHub staff](https://github.com/orgs/community/discussions/15752); the fix, roadmap item [#1153](https://github.com/github/roadmap/issues/1153), was labelled "Paused" on 2026-08-13. Every GitHub widget therefore runs a small token-exchange function (giscus.app, utteranc.es, Decap's [community shims](https://decapcms.org/docs/external-oauth-clients/)); shortcuts like [gitalk's shipped secret plus CORS proxy](https://raw.githubusercontent.com/gitalk/gitalk/master/readme.md) are an anti-pattern.

**Identity is coupled to write permission.** Decap and Sveltia require every user to have push access, [typically Maintainer on GitLab](https://decapcms.org/docs/gitlab-backend/) because the default branch is [protected by default](https://docs.gitlab.com/user/project/repository/branches/protected/). GitLab's [permissions table](https://docs.gitlab.com/user/permissions/) shows Guests, Planners and Reporters can never commit, Guests cannot comment on merge requests, and Guests cannot read repository files in private projects, yet Guests can create issues and [issue notes](https://docs.gitlab.com/api/notes/). GitHub's [Read role](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization) can open issues, comment, submit PR reviews and use Discussions, while a [personal private repo has only Write collaborators](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-personal-account-settings/permission-levels-for-a-personal-account-repository). Scope is coarse on GitLab: `api` is the only OAuth scope that writes; fine-grained tokens ([GA in 19.2](https://docs.gitlab.com/auth/tokens/fine_grained_access_tokens/)) cover issue notes via the "Work Item" resource but apply to personal access tokens only, with [OAuth explicitly out of scope](https://gitlab.com/groups/gitlab-org/-/epics/18177). GitHub App user tokens are the [intersection of app and user permissions](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), so an app with Issues:write and Contents:read gives reviewers a token that can comment but never push.

**Read the identity from the gate that already protects the page.** Gates fall into three classes. Same-origin endpoints a script can fetch: Cloudflare Access [`get-identity`](https://developers.cloudflare.com/pages/functions/plugins/cloudflare-access/) (documented on the team domain; app-origin behaviour unverified), Azure SWA [`/.auth/me`](https://learn.microsoft.com/en-us/azure/static-web-apps/user-information), Pomerium [`/.pomerium/user`](https://www.pomerium.com/docs/capabilities/getting-users-identity), oauth2-proxy [`/oauth2/userinfo`](https://oauth2-proxy.github.io/oauth2-proxy/features/endpoints). Headers delivered only to a backend: [Google IAP](https://docs.cloud.google.com/iap/docs/identity-howto), [AWS ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html), [Vercel Passport](https://vercel.com/docs/passport/read-identity), Netlify SSO, so a small "whoami" route is needed. Nothing exposed: [GitLab Pages access control](https://docs.gitlab.com/user/project/pages/pages_access_control/) (session cookie is HttpOnly and encrypted, [verified in source](https://gitlab.com/gitlab-org/gitlab-pages/-/raw/master/internal/auth/session.go)), [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), Netlify [password/Team Login](https://docs.netlify.com/security/secure-access-to-sites/site-protection/), so the overlay must run its own login against the same account.

**Corporate SSO from a browser.** [Okta](https://developer.okta.com/docs/guides/implement-grant-type/authcodepkce/main/), [Entra](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-overview) and [Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) all support public-client PKCE, but an ID token verified only in the browser proves nothing to whatever stores the comment, and SSO identity does not map to repo permissions.

**The platform's own account.** [Vercel](https://vercel.com/docs/deployments/sharing-deployments) ("all users must have a Vercel account"; Hobby allows one external collaborator, Pro/Enterprise more), [Netlify Reviewer](https://docs.netlify.com/deploy/review-deploys/netlify-drawer-for-feedback/netlify-reviewer-quickstart/), Figma seats and claude.ai org membership all work, and "my stakeholder has to create yet another account" is the most repeated complaint in the [Vercel community](https://community.vercel.com/t/feedback-on-vercel-toolbar-big-potential-if-adapted-for-clients/15661) and [Figma forum](https://forum.figma.com/suggest-a-feature-11/guest-comments-voting-for-clients-w-o-account-19333). Hypothesis's grant-token design (your server mints a [short-lived JWT](https://h.readthedocs.io/en/latest/publishers/authorization-grant-tokens/) after your own login; the client accepts it via [`services[].grantToken`](https://github.com/hypothesis/client/blob/main/docs/publishers/config.rst)) is the documented way around it, though publisher credentials are provisioned by Hypothesis, not self-service. Self-hosted comment servers [Comentario](https://docs.comentario.app/en/configuration/idps/) and [Artalk](https://artalk.js.org/guide/frontend/auth.html) take GitLab/GitHub/OIDC logins directly, but only for page-level threads.

**Lesson for gitmargin:** ship adapters, not a login (GitLab PKCE with no backend, a GitHub App with a one-function token exchange, a configurable reader for gate headers/endpoints), and store comments where read-only roles can write.

### 2.4 Security

**Screenshot pipelines upload the page.** [Usersnap](https://help.usersnap.com/docs/development-faq) says it sends "the whole HTML DOM" to its renderers; [Marker.io](https://help.marker.io/en/articles/6840044-configuring-marker-io-for-firewalls-and-secure-networks) renders screenshots server-side by default and asks customers to allow-list four Marker.io IPs so its servers can fetch private-site assets (a [native-browser mode](https://help.marker.io/en/articles/9615303-native-browser-screenshot-rendering) is the opt-out); [BugHerd](https://bugherd.com/blog/screenshots-without-a-browser-extension) describes the same copy-HTML-to-server method. CSS masking classes assume only fragments are sensitive; for a confidential prototype the whole page is. [Hypothesis stores the quoted text](https://web.hypothes.is/privacy/) plus URL and title on US servers even for private groups.

**Proxy and rewrite annotators weaken the host page.** The Genius annotator [stripped sites' Content-Security-Policy](https://www.vijithassar.com/2641/how-to-block-genius-annotations) in 2016 (product long discontinued); Hypothesis [closed its open proxy](https://web.hypothes.is/blog/why-we-no-longer-run-an-open-proxy/) after phishing abuse. On-origin overlays avoid both but must coexist with the page's CSP; Vercel's own toolbar [does not support strict CSP](https://community.vercel.com/t/vercel-toolbar-with-strict-csp/471).

**Injected scripts face a known checklist.** [Polyfill.io](https://sansec.io/research/polyfill-supply-chain-attack) (2024) showed a trusted script domain can turn malicious; [Disqus](https://www.datatilsynet.no/en/news/2021/intent-to-issue--25-million-fine-to-disqus-inc/) faced a fine for tracking through a comment widget; session-replay scripts [exfiltrate whole pages](https://blog.citp.princeton.edu/2017/11/15/no-boundaries-exfiltration-of-personal-data-by-session-replay-scripts/). The [OWASP cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Javascript_Management_Cheat_Sheet.html) answer: pinned versions with SRI, self-hosting, minimal `connect-src`, no cross-site identifiers.

**Tokens in a static page.** [RFC 10017 (BCP 212)](https://www.rfc-editor.org/info/rfc10017/), published August 2026, says keep OAuth tokens out of persistent browser storage: in memory, or behind a backend-for-frontend. With GitLab's full-`api` scope, an XSS anywhere on an AI-generated page could expose the reviewer's entire account; [utterances](https://raw.githubusercontent.com/utterance/utterances/master/src/oauth.ts) keeps its token in memory, [giscus](https://raw.githubusercontent.com/giscus/giscus/main/ADVANCED-USAGE.md) in localStorage.

**"Private repo = private comments" holds only under conditions.** Both hosts gate the page itself ([GitHub private Pages](https://github.blog/changelog/2021-01-21-access-control-for-github-pages/) needs Enterprise Cloud; GitLab Pages access control is on Free), and storing comments inside the same project inherits access reviews, [audit events](https://docs.gitlab.com/user/compliance/audit_event_types/) (Premium) and offboarding, but only if tokens are short-lived, since [without SCIM](https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-saml-single-sign-on-for-your-organization/about-scim-for-organizations) OAuth tokens outlive IdP removal. Git-backed widgets break the inheritance on private repos: self-hosted giscus [reads with the app's own token](https://github.com/orgs/giscus/discussions/291) so anonymous visitors can see the thread, and loading comments on private repos is [reported broken](https://github.com/giscus/giscus/issues/1313).

**Lesson for gitmargin:** a self-hostable, SRI-pinned on-origin script that talks only to the org's Git host, keeps tokens in memory, stores comments inside the project's permission boundary, and renders comment bodies as sanitised text.

## 3. Hosting a prototype inside a big company - the happy paths

| Option | Who controls it | What identity gates it | Can a page script learn who the viewer is? | Native comments? | Typical friction |
|---|---|---|---|---|---|
| [GitLab Pages access control](https://docs.gitlab.com/user/project/pages/pages_access_control/) (Free+) | Project owner; instance admin on self-managed | GitLab account, project member (Guest+), SAML if enforced | No (HttpOnly encrypted cookie, no endpoint) | No | Overlay needs a second GitLab login; Guests cannot read repo files |
| [GitHub Pages, private](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site) | Org on Enterprise Cloud | github.com login with repo read | No | No | GHEC only; [GHES has no per-repo private Pages](https://docs.github.com/en/enterprise-server@3.16/admin/configuring-settings/configuring-user-applications-for-your-enterprise/configuring-github-pages-for-your-enterprise); GitHub OAuth needs a backend |
| [Vercel preview + Deployment Protection](https://vercel.com/docs/deployment-protection) | Team | Vercel account; [Passport](https://vercel.com/docs/passport) = corporate IdP (Enterprise) | No (Passport token is server-side only) | Yes, Toolbar comments on all plans | Every commenter needs a Vercel account; password protection is Enterprise or a paid Pro add-on |
| [Netlify Deploy Previews](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/) | Team | Netlify login or password; SAML on Enterprise | No | Yes, Drawer | Reviewer needs a Netlify account plus approval; on credit-based Free/Personal a private project is visible only to the owner |
| [Cloudflare Pages/Tunnel + Access](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/) | Platform/IT | Corporate IdP or email one-time PIN | Yes, `get-identity` on the team domain (app-origin call unverified) | No | Hostname must route through Cloudflare; the [Pages toggle protects hash previews only](https://developers.cloudflare.com/pages/configuration/preview-deployments/) |
| [Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization) | Platform team | GitHub or Entra built in; single-tenant needs [Standard](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-custom) | Yes, `/.auth/me` | No | Any Microsoft account unless Standard; PR previews are [reachable by URL even for private repos](https://learn.microsoft.com/en-us/azure/static-web-apps/review-publish-pull-requests) |
| [Google Cloud Run + IAP](https://docs.cloud.google.com/iap/docs/enabling-cloud-run) | Platform team | Google Workspace | Headers only; server must echo them | No | [Static buckets unsupported](https://docs.cloud.google.com/iap/docs/load-balancer-howto); needs Cloud Run |
| [AWS ALB OIDC](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html) / [CloudFront Authorization@Edge](https://github.com/aws-samples/cloudfront-authorization-at-edge) | Platform team | Cognito or any OIDC IdP | ALB: headers only; CloudFront sample: JWT cookie readable by JS | No | Heavy setup; needs a real backend or Lambda@Edge |
| Internal server behind [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview) / [Pomerium](https://www.pomerium.com/docs/capabilities/getting-users-identity) / [ngrok](https://ngrok.com/docs/traffic-policy/actions/oauth/) / [Tailscale Serve](https://tailscale.com/kb/1312/serve) | Ops | Corporate IdP or Git host | oauth2-proxy and Pomerium: yes, same-origin JSON; ngrok and Tailscale: headers only | No | Header names differ per proxy; [ngrok free covers 5 users](https://ngrok.com/blog/free-security) |
| [SharePoint](https://learn.microsoft.com/en-us/answers/questions/321942/issue-in-loading-html-files-in-sharepoint-online(m) / [Confluence](https://confluence.atlassian.com/doc/html-macro-38273085.html) / [Backstage TechDocs](https://backstage.io/docs/features/techdocs/how-to-guides/) | IT | Corporate SSO | Not applicable: HTML is downloaded or sanitised, not run | Page-level only | Refuse to execute the prototype; "host elsewhere and embed" |
| Send the .html file (Slack, email) | Nobody | None | No (file:// origin) | No | No URL, no versioning; [Slack inline rendering](https://display.dev/blog/slack-renders-html-attachments) is unverified (third-party reports only) |
| [Claude Code artifact](https://code.claude.com/docs/en/artifacts) (Team/Enterprise) | Anthropic-hosted | claude.ai org membership | Not applicable | Yes, threads Claude reads and acts on | Only on claude.ai; not for CMEK/HIPAA/zero-retention orgs or Bedrock/Vertex/Foundry |
| [Lovable](https://docs.lovable.dev/features/share-project) / [Figma Make](https://help.figma.com/hc/en-us/articles/31304586129559-Publish-update-or-unpublish-a-Figma-Make-file) / [Replit](https://replit.com/blog/secure-more-apps) share links | Vendor | Vendor account; Lovable guests are anonymous | Not applicable | Lovable yes (anonymous guests); Figma Make yes (rolling out) | Locked to the vendor's hosting; org-only audiences are paid tiers |

**Common denominators.** Three identity mechanisms cover every row: (1) Git-host OAuth (GitLab via PKCE with no backend; GitHub via a one-function token exchange or device flow); (2) a trusted identity header or endpoint read through a same-origin shim (Cloudflare Access, Azure SWA, IAP, ALB, oauth2-proxy, Pomerium, ngrok, Tailscale, Vercel Passport); (3) generic OIDC PKCE to the corporate IdP (Entra, Okta, Google) for hosts that expose nothing. The implication for a "jack of all trades" design is adapters rather than one login, with a configurable header map for the proxy family. One caveat drives the storage decision: only in mechanism (1) does the identity provider also authorise the store, so mechanisms (2) and (3) still need either a mapping to a Git-host user or a small backend that validates the JWT before accepting a comment. For prioritisation, the [2025 Stack Overflow survey](https://survey.stackoverflow.co/2025/technology) has GitHub at 81%, GitLab 36%, Azure DevOps 17% of respondents, and Microsoft counts [720,000 organisations on Entra ID](https://www.microsoft.com/en-us/security/business/identity-access/microsoft-entra-id); Okta/Google share was not found.

## 4. Is it already solved?

**Honest verdict: partially, and never portably.** The closest existing things:

- **GitLab Visual Reviews** (sunset). Shipped in 12.0 as a Starter feature (Premium from 13.9): one script tag on the review app, comments posted into the merge request, private projects authenticated by a [pasted API-scope personal access token](https://github.com/gitlabhq/gitlabhq/blob/v12.0.0/doc/ci/review_apps/index.md). Anonymous feedback sat behind a default-off flag that gated the only submission endpoint; the feature was switched off on GitLab.com around 15.6, [deprecated in 15.8](https://gitlab.com/gitlab-org/gitlab/-/blob/master/data/deprecations/15-8-visual-review-tool.yml) "due to limited customer usage and capabilities" with "no planned replacement", and [removed in 17.0](https://gitlab.com/gitlab-org/gitlab/-/issues/387751). Users objected on the issue; a 2019 request asked to [remove the token-based login](https://gitlab.com/api/v4/projects/278964/issues/29067). GitLab is also [deprecating Design Management](https://gitlab.com/groups/gitlab-org/-/epics/20375) for low adoption, so no revival is coming.
- **If you can choose the host:** Netlify Drawer (free reviewers, two-way MR sync into self-managed GitLab) or Vercel Comments (element/text anchoring, JSON for agents). Both require a platform account and store data with the vendor.
- **If the page can live on claude.ai:** Claude Code artifacts already run the loop (private share, org sign-in, comment threads, Claude edits), on Team/Enterprise only.
- **Build from parts:** [Comentario](https://docs.comentario.app/en/configuration/idps/) or Artalk give GitLab/OIDC identity and self-hosted storage, page-level only; the Hypothesis client gives anchoring and identity delegation but US-hosted storage; [BugDrop](https://github.com/mean-weasel/bugdrop) shows a script tag writing to GitHub Issues through a GitHub App in a worker, with anonymous reporters; [Annotate.js](https://github.com/reviewjs/annotate) is a script tag with localStorage and a JSON export, no identity.

**What is missing** is the combination: element-anchored comments on any private HTML page, signed with the gate's identity, stored inside the project's permission boundary, readable by agents through the Git host's existing surfaces. Also note that with `vercel comments --json` (2026-08-20) and GitLab's MCP server, the *agent-reads-the-batch* half is no longer novel; the differentiator is host independence and repo-native storage.

## 5. Who could use this

| Rank | Who | What they share / where hosted | Feedback today | Why current tools fail | Adoption path | Evidence |
|---|---|---|---|---|---|---|
| 1 | Developers and technical PMs running coding agents who want a human-review step | Agent-generated HTML/plans on localhost, GitLab/GitHub Pages | Local single-user tools | human-review and Agentation are local; Plannotator's team tier is a paid waitlist | Claude Code skills, GitHub, Hacker News | [human-review](https://github.com/petergyang/human-review), [Plannotator](https://plannotator.ai/), [Agentation](https://github.com/benjitaylor/agentation), [stagewise](https://github.com/stagewise-io/stagewise) |
| 2 | PMs and designers shipping AI prototypes internally, hosted outside a vendor viewer | Claude Code / Lovable / v0 exports on GitLab/GitHub Pages or internal servers | Loom, screenshots, Google Docs, Slack, meetings | Builder comments stay in the builder; reviewers may lack Git accounts | PM newsletters, Claude Code skills | [Figma forum](https://forum.figma.com/suggest-a-feature-11/share-make-prototype-without-ai-chat-preview-code-toggle-or-publishing-40459), [r/ProductManagement](https://www.reddit.com/r/ProductManagement/comments/1um29f1/how_are_you_all_prototyping_now_that_ai_is_so/), [Lenny's survey](https://www.lennysnewsletter.com/p/ai-tools-are-overdelivering-results) (19.8% of PMs prototype with AI, 44.4% want to) |
| 3 | Docs-as-code teams needing SME/Legal review of rendered previews | Docusaurus/MkDocs previews on Netlify, Vercel, GitLab Pages | PR comments for engineers; Google Doc copies for others | GitLab docs team: rendered-page comments are "hard/impossible to track"; DraftView is GitHub-only | Write the Docs, docs blogs | [gitlab-docs #805](https://gitlab.com/gitlab-org/gitlab-docs/-/issues/805), [DraftView](https://www.draftview.app/) |
| 4 | Regulated or self-hosted GitLab organisations | Private review apps and Pages sites | MR discussions; SaaS blocked | Claude artifacts excluded for CMEK/HIPAA orgs; feedback SaaS not self-hostable; Visual Reviews gone | Platform/DevEx champions; slow | [Pages access control](https://docs.gitlab.com/user/project/pages/pages_access_control/), [artifacts docs](https://code.claude.com/docs/en/artifacts) |
| 5 | Teams on Vercel/Netlify hitting the account wall | Preview deployments | Native comments | Good enough if everyone has accounts; fails for outsiders | Only if reviewers lack vendor accounts | [Vercel sharing](https://vercel.com/docs/deployments/sharing-deployments) |
| 6 | Analytics teams sharing Quarto/Jupyter HTML reports (unverified demand) | Static HTML on Pages, Posit Connect, S3 | Slack, email | Quarto's documented comment options need public repos or Hypothesis servers | Quarto/analytics-engineering circles | [Quarto docs](https://quarto.org/docs/output-formats/html-basics.html) |
| 7 | Agencies and freelancers getting client sign-off | Password-protected staging | BugHerd, MarkUp, Userback | Clients have no Git or SSO identity; incumbents already give free unlimited guests | Unlikely | [BugHerd pricing](https://bugherd.com/pricing), [Commented](https://commented.io/pricing) |
| 8 | Marketing (Webflow) and Storybook teams | Builder or Storybook hosting | Webflow comment-only links; Chromatic | Gap closed by vendors; Storybook demand weak | Not a target | [Webflow](https://university.webflow.com/resources/guides/quick-guide-reviewer-role), [Storybook #15044](https://github.com/storybookjs/storybook/issues/15044) |

**Most likely early adopter:** a technical PM or developer already running Claude Code, hosting on GitLab or GitHub Pages, who needs one or two colleagues to comment on a page and wants the agent to pick the comments up. That person is buyer and user in one. **Buyer vs user:** in segments 1–3 they coincide; in segment 4 the platform or security team is the buyer because it must approve the script tag and the token scopes, and a designer on Hacker News [put the stakeholder view plainly](https://news.ycombinator.com/item?id=43758671): executives "want a nice login page that makes them feel secure". Practitioner evidence is thinner than vendor documentation throughout, and designers [push back](https://www.reddit.com/r/UXDesign/comments/1nq0d49/do_you_like_when_product_managers_make_prototypes/) when PMs take prototypes to stakeholders before design review, which raises a positioning question: PM-to-engineer review, design critique, or executive sign-off.

## 6. Open questions / things we could not verify

- GitLab Visual Reviews usage numbers live in private GitLab issues; "low usage" cannot be separated from its identity friction.
- Whether `https://<app-host>/cdn-cgi/access/get-identity` answers same-origin on a Cloudflare Access app, and whether Vercel's Sign in with Vercel token endpoint sends CORS headers, need live tests.
- Chromatic's Free-plan UI Review, Cloudflare Zero Trust's reported 50-user free tier, Slack's inline HTML rendering, and Lovable's password-link rollout are unverified.
- Exact error bodies when a read-only user writes a file via the GitHub Contents API or the GitLab Repository Files API were not exercised live.
- Whether "Resolve with GitLab Duo" works on a non-diff MR note carrying a DOM anchor is undocumented.
- Copilot cloud agent and Codex on GitHub Enterprise Server: docs are silent.
- Analytics-team demand and Okta/Google identity share were not found; Azure DevOps and Bitbucket shops, bolt.new and Google Stitch were not examined.

**Fact-check table**

| Claim | Verdict | Corrected statement | Source |
|---|---|---|---|
| GitHub OAuth cannot be completed from a static page; PKCE (2025-07-14) did not remove the secret; SPA project "on hold" per Sveltia | Partially true | PKCE is supported but `client_secret` is still "Required" at the token endpoint (device flow excepted) and the endpoint lacks CORS per GitHub staff; roadmap #1153 (SPA support for GitHub Apps) was labelled "Paused" by GitHub's bot on 2026-08-13, so "on hold" is now GitHub's own status | [GitHub docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [roadmap #1153](https://github.com/github/roadmap/issues/1153) |
| Hypothesis is "the only maintained open-source anchoring code" | Partially true | Apache Annotator retired 2025-08-11 and Annotator.js is unmaintained, but Recogito text-annotator-js (W3C text selectors, June 2026 release) and Annotorious are active; Hypothesis's anchoring is in-house, not the old `dom-anchor-*` packages | [text-annotator-js](https://github.com/recogito/text-annotator-js) |
| Visual Reviews was Premium, GA in 12.0, PAT-authenticated, removed 17.0 "due to low usage"; one lens: self-managed only, flag off, disabled on GitLab.com | Partially true | Starter tier in 12.0, Premium from 13.9; PAT login from the start; anonymous mode from 12.5 behind a default-off flag that gated the only submission endpoint; enabled on GitLab.com until about 15.6; deprecated 15.8 "due to limited customer usage and capabilities", "no planned replacement"; removed 17.0 | [deprecation entry](https://gitlab.com/gitlab-org/gitlab/-/blob/master/data/deprecations/15-8-visual-review-tool.yml) |
| Figma Make ships element-screenshot comments bucketed by version (vs "still a feature request") | Confirmed | Figma's help article (2026-02-27, updated 2026-03-31) documents it, "rolling out over the coming weeks"; the "feature request" reply is from August 2025 | [Figma help](https://help.figma.com/hc/en-us/articles/38701587731735-Add-comments-in-Figma-Make) |
| GitLab has no OAuth scope narrower than `api` for writing a note; fine-grained tokens are PAT-only | Confirmed | Only `api` writes via the API; fine-grained PATs (beta 18.10, GA 19.2) can be narrowed to the Work Item resource that covers issue notes, but OAuth is explicitly out of scope | [fine-grained tokens](https://docs.gitlab.com/auth/tokens/fine_grained_access_tokens/) |
| "OAuth 2.0 for Browser-Based Applications" is RFC 10017 / BCP 212 (2026) | Confirmed | Published August 2026 as RFC 10017, added to BCP 212 alongside RFC 8252; cite as "RFC 10017 (BCP 212)" | [RFC Editor](https://www.rfc-editor.org/info/bcp212) |

## 7. Sources

**Sub-problem 1 - commenting on the HTML**
- https://support.bugherd.com/en/articles/11424426-installing-bugherd-using-javascript
- https://help.feedbucket.app/en/article/getting-started-with-feedbucket-18cmcyr/
- https://usesuperflow.ai/comments
- https://github.com/hypothesis/client/blob/main/docs/publishers/embedding.rst
- https://vercel.com/docs/vercel-toolbar/in-production-and-localhost/add-to-production
- https://help.usepastel.com/en/articles/5986535-whitelisting-pastel-s-ips
- https://ruttl.com/blog/web-app/
- https://web.hypothes.is/blog/changes-to-via-hypothesis-proxy-server-for-annotation/
- https://help.marker.io/en/articles/11948672-use-marker-io-widget-on-live-production-websites
- https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/html.ts
- https://www.w3.org/TR/annotation-model/
- https://help.figma.com/hc/en-us/articles/38701587731735-Add-comments-in-Figma-Make
- https://docs.lovable.dev/features/project-comments
- https://arxiv.org/abs/1512.06195
- https://lovable.dev/blog/visual-edits
- https://github.com/onlook-dev/onlook
- https://cursor.com/blog/design-mode
- https://github.com/petergyang/human-review/blob/main/src/SKILL.md
- https://github.com/petergyang/human-review
- https://github.com/benjitaylor/agentation
- https://github.com/backnotprop/plannotator
- https://webflow.com/blog/faster-feedback-cycles-in-webflow
- https://incubator.apache.org/projects/annotator.html
- https://github.com/openannotation/annotator/blob/master/REBOOT.md
- https://github.com/recogito/text-annotator-js

**Sub-problem 2 - the feedback trail**
- https://vercel.com/docs/comments/managing-comments
- https://vercel.com/changelog/manage-vercel-toolbar-comments-from-the-cli
- https://vercel.com/docs/agent-resources/vercel-mcp/tools
- https://raw.githubusercontent.com/vercel/vercel/main/packages/cli/src/commands/comments/types.ts
- https://vercel.com/docs/comments/how-comments-work
- https://docs.netlify.com/deploy/review-deploys/netlify-drawer-for-feedback/overview/
- https://docs.netlify.com/deploy/review-deploys/netlify-drawer-for-feedback/troubleshoot-the-netlify-drawer/
- https://docs.gitlab.com/user/discussions/
- https://github.com/orgs/community/discussions/23138
- https://www.chromatic.com/docs/review/
- https://www.chromatic.com/pricing
- https://www.browserstack.com/docs/percy/build-results/comments
- https://argos-ci.com/
- https://github.com/eduardoboucas/staticman
- https://giscus.app/
- https://github.com/git-bug/git-bug
- https://web.hypothes.is/blog/showing-orphaned-annotations/
- https://github.com/github/github-mcp-server
- https://docs.gitlab.com/user/model_context_protocol/mcp_server_tools/
- https://docs.gitlab.com/user/project/merge_requests/duo_in_merge_requests/
- https://code.claude.com/docs/en/github-actions
- https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent
- https://cursor.com/docs/cloud-agent
- https://learn.chatgpt.com/docs/third-party/gitlab
- https://github.com/changesets/changesets
- https://storybook.js.org/docs/writing-docs/autodocs
- https://developers.cloudflare.com/pages/configuration/preview-deployments/
- https://www.ziflow.com/blog/the-2023-state-of-creative-workflow-report-key-findings-bonus-insights

**Sub-problem 3 - identity**
- https://github.com/giscus/giscus
- https://utteranc.es/
- https://github.com/meteorlxy/vssue
- https://decapcms.org/docs/gitlab-backend/
- https://sveltiacms.app/en/docs/backends/gitlab
- https://docs.gitlab.com/api/oauth2/
- https://docs.gitlab.com/integration/oauth_provider/
- https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- https://github.com/orgs/community/discussions/15752
- https://github.com/github/roadmap/issues/1153
- https://decapcms.org/docs/external-oauth-clients/
- https://raw.githubusercontent.com/gitalk/gitalk/master/readme.md
- https://docs.gitlab.com/user/project/repository/branches/protected/
- https://docs.gitlab.com/user/permissions/
- https://docs.gitlab.com/api/notes/
- https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization
- https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-personal-account-settings/permission-levels-for-a-personal-account-repository
- https://docs.gitlab.com/auth/tokens/fine_grained_access_tokens/
- https://gitlab.com/groups/gitlab-org/-/epics/18177
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- https://developers.cloudflare.com/pages/functions/plugins/cloudflare-access/
- https://learn.microsoft.com/en-us/azure/static-web-apps/user-information
- https://www.pomerium.com/docs/capabilities/getting-users-identity
- https://oauth2-proxy.github.io/oauth2-proxy/features/endpoints
- https://docs.cloud.google.com/iap/docs/identity-howto
- https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html
- https://vercel.com/docs/passport/read-identity
- https://docs.gitlab.com/user/project/pages/pages_access_control/
- https://gitlab.com/gitlab-org/gitlab-pages/-/raw/master/internal/auth/session.go
- https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication
- https://docs.netlify.com/security/secure-access-to-sites/site-protection/
- https://developer.okta.com/docs/guides/implement-grant-type/authcodepkce/main/
- https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-overview
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://vercel.com/docs/deployments/sharing-deployments
- https://docs.netlify.com/deploy/review-deploys/netlify-drawer-for-feedback/netlify-reviewer-quickstart/
- https://community.vercel.com/t/feedback-on-vercel-toolbar-big-potential-if-adapted-for-clients/15661
- https://forum.figma.com/suggest-a-feature-11/guest-comments-voting-for-clients-w-o-account-19333
- https://h.readthedocs.io/en/latest/publishers/authorization-grant-tokens/
- https://github.com/hypothesis/client/blob/main/docs/publishers/config.rst
- https://docs.comentario.app/en/configuration/idps/
- https://artalk.js.org/guide/frontend/auth.html

**Sub-problem 4 - security**
- https://help.usersnap.com/docs/development-faq
- https://help.marker.io/en/articles/6840044-configuring-marker-io-for-firewalls-and-secure-networks
- https://help.marker.io/en/articles/9615303-native-browser-screenshot-rendering
- https://bugherd.com/blog/screenshots-without-a-browser-extension
- https://web.hypothes.is/privacy/
- https://www.vijithassar.com/2641/how-to-block-genius-annotations
- https://web.hypothes.is/blog/why-we-no-longer-run-an-open-proxy/
- https://community.vercel.com/t/vercel-toolbar-with-strict-csp/471
- https://sansec.io/research/polyfill-supply-chain-attack
- https://www.datatilsynet.no/en/news/2021/intent-to-issue--25-million-fine-to-disqus-inc/
- https://blog.citp.princeton.edu/2017/11/15/no-boundaries-exfiltration-of-personal-data-by-session-replay-scripts/
- https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Javascript_Management_Cheat_Sheet.html
- https://www.rfc-editor.org/info/rfc10017/
- https://raw.githubusercontent.com/utterance/utterances/master/src/oauth.ts
- https://raw.githubusercontent.com/giscus/giscus/main/ADVANCED-USAGE.md
- https://github.blog/changelog/2021-01-21-access-control-for-github-pages/
- https://docs.gitlab.com/user/compliance/audit_event_types/
- https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-saml-single-sign-on-for-your-organization/about-scim-for-organizations
- https://github.com/orgs/giscus/discussions/291
- https://github.com/giscus/giscus/issues/1313

**Hosting inside a big company**
- https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site
- https://docs.github.com/en/enterprise-server@3.16/admin/configuring-settings/configuring-user-applications-for-your-enterprise/configuring-github-pages-for-your-enterprise
- https://vercel.com/docs/deployment-protection
- https://vercel.com/docs/passport
- https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/
- https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/
- https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization
- https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-custom
- https://learn.microsoft.com/en-us/azure/static-web-apps/review-publish-pull-requests
- https://docs.cloud.google.com/iap/docs/enabling-cloud-run
- https://docs.cloud.google.com/iap/docs/load-balancer-howto
- https://github.com/aws-samples/cloudfront-authorization-at-edge
- https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview
- https://ngrok.com/docs/traffic-policy/actions/oauth/
- https://ngrok.com/blog/free-security
- https://tailscale.com/kb/1312/serve
- https://learn.microsoft.com/en-us/answers/questions/321942/issue-in-loading-html-files-in-sharepoint-online(m
- https://confluence.atlassian.com/doc/html-macro-38273085.html
- https://backstage.io/docs/features/techdocs/how-to-guides/
- https://display.dev/blog/slack-renders-html-attachments
- https://code.claude.com/docs/en/artifacts
- https://docs.lovable.dev/features/share-project
- https://help.figma.com/hc/en-us/articles/31304586129559-Publish-update-or-unpublish-a-Figma-Make-file
- https://replit.com/blog/secure-more-apps
- https://survey.stackoverflow.co/2025/technology
- https://www.microsoft.com/en-us/security/business/identity-access/microsoft-entra-id

**Is it already solved?**
- https://gitlab.com/gitlab-org/gitlab/-/issues/387751
- https://gitlab.com/gitlab-org/gitlab/-/blob/master/data/deprecations/15-8-visual-review-tool.yml
- https://github.com/gitlabhq/gitlabhq/blob/v12.0.0/doc/ci/review_apps/index.md
- https://gitlab.com/api/v4/projects/278964/issues/29067
- https://gitlab.com/groups/gitlab-org/-/epics/20375
- https://github.com/mean-weasel/bugdrop
- https://github.com/reviewjs/annotate

**Who could use this**
- https://plannotator.ai/
- https://github.com/stagewise-io/stagewise
- https://forum.figma.com/suggest-a-feature-11/share-make-prototype-without-ai-chat-preview-code-toggle-or-publishing-40459
- https://www.reddit.com/r/ProductManagement/comments/1um29f1/how_are_you_all_prototyping_now_that_ai_is_so/
- https://www.lennysnewsletter.com/p/ai-tools-are-overdelivering-results
- https://gitlab.com/gitlab-org/gitlab-docs/-/issues/805
- https://www.draftview.app/
- https://quarto.org/docs/output-formats/html-basics.html
- https://bugherd.com/pricing
- https://commented.io/pricing
- https://university.webflow.com/resources/guides/quick-guide-reviewer-role
- https://github.com/storybookjs/storybook/issues/15044
- https://news.ycombinator.com/item?id=43758671
- https://www.reddit.com/r/UXDesign/comments/1nq0d49/do_you_like_when_product_managers_make_prototypes/

**Fact-check**
- https://www.rfc-editor.org/info/bcp212

## 8. Glossary

- **OAuth / PKCE** - the standard "Sign in with GitLab/GitHub" flow. PKCE is the variant that is safe to run from a web page with no server, because it needs no secret.
- **Client secret** - a password that identifies your app to GitHub. It cannot be hidden inside a web page, which is why GitHub sign-in needs a small server.
- **CORS** - a browser rule about which websites a page's script may call. If a provider's login endpoint does not allow it, a page cannot call it directly.
- **Token scope** - how much a login token is allowed to do. GitLab's only write-capable OAuth scope is `api` (everything), which is broad.
- **Guest / Reporter / Developer / Maintainer** - GitLab's project roles, least to most access. GitHub's equivalents are Read / Triage / Write / Maintain / Admin.
- **Issue note / MR note** - a comment on a GitLab issue or merge request. GitHub calls them issue comments and pull-request review comments.
- **MCP server** - a standard way for AI agents (Claude Code, Cursor, Copilot…) to read and write a service. GitHub and GitLab both run one.
- **Anchoring / orphan** - how a comment remembers which element or text it was attached to. An "orphan" is a comment whose anchor can no longer be found because the page changed.
- **W3C Web Annotation model** - a standard JSON format for comments on web pages, including several ways to describe the anchor.
- **CSP / SRI** - security settings a page uses to control which scripts may run (Content Security Policy) and to verify a script file was not tampered with (Subresource Integrity).
- **HttpOnly cookie** - a login cookie that a page's script is not allowed to read. This is why GitLab Pages cannot tell an overlay who the viewer is.
- **Reverse proxy / gate** - a layer in front of a page that checks login before serving it (Cloudflare Access, oauth2-proxy, Pomerium, Google IAP…). Some of these tell the page who the viewer is; some do not.
- **Deploy preview / review app** - a temporary hosted copy of a branch so people can look at it before merge (Vercel, Netlify, GitLab Review Apps).
- **PAT** - personal access token; a long-lived password-like key a user generates by hand. Pasting one is the login experience that sank GitLab Visual Reviews.
- **OpenID Connect** - the standard "sign in with X" handshake built on OAuth. GitLab, Slack, Google, Okta and Entra all speak it, which is why one sign-in adapter can serve them all as configuration.
- **SAML** - the older corporate single-sign-on standard. When a GitLab group has SAML on, GitLab sends sign-ins to the company's identity provider instead of showing its own login page.
- **MFA / passkey / WebAuthn** - second-step sign-in checks: a push or code (MFA), or a device-bound credential (passkey, built on WebAuthn). Some embedded browsers, such as Slack's in-app browser, cannot complete WebAuthn.
- **Confidential vs public app** - a registered sign-in app that holds a secret on a server (confidential) versus one that runs only in a web page with no secret (public). GitLab asks a public app's users for consent on every visit; a confidential app asks once.
- **Bot token** - a long-lived key that lets a server act as a service account, for example to check who is a project member or to post a note as "the gitmargin bot".
- **First-party vs third-party cookie** - a cookie set by the site you are on (first-party) versus one set by a different site (third-party). Safari and Slack's in-app browser drop third-party cookies, which is why a server on its own domain cannot rely on one reaching the prototype page.
- **URL fragment** - the part of a web address after `#`. Browsers never send it to the server, so it is a safe place to hand a one-time code back to a page.
- **Audience** - gitmargin's word for who is allowed to see a given prototype and its comments: the whole workspace, a channel, a project's members, or a list.
- **Sealed mode** - a deferred idea: encrypting the prototype itself so that a host with no login of its own still cannot show the page to strangers. Not in v0.
- **Hono** - a small web framework that runs the same code on Vercel, Cloudflare, Node and other hosts; chosen so the gitmargin server can move between them.

## 9. How this report was produced

Researched on 2026-08-31 by 18 automated research agents in four passes: seven parallel sweeps (one per question above), a critic pass that identified gaps and the six claims most likely to be wrong, three gap-fill sweeps plus six independent fact-checks against primary sources (vendor docs, changelogs, source code), and a synthesis pass. 135 findings were collected; almost every product claim was checked by opening the vendor's own page rather than relying on search results. Three of the six fact-checked claims were corrected (see the table in section 6). Anything marked *unverified* was not confirmed against a primary source and should be re-checked before being relied on.
