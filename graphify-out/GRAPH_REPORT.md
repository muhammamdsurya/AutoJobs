# Graph Report - AutoJobs  (2026-09-28)

## Corpus Check
- Corpus is ~34,654 words - fits in a single context window. You may not need a graph.

## Summary
- 523 nodes · 1514 edges · 14 communities (12 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.91)
- Token cost: 247,778 input · 0 output

## Community Hubs (Navigation)
- Auth, Accounts & Email
- Campaign & Report UI
- Server Actions & Profile Data
- Extension API & Answer Planning
- Extension Worker & Popup
- Listing Filters & Scrape Worker
- Deployment & Manifest Config
- Encrypted Storage & E2E Tests
- NPM Dependencies
- Portal Adapters
- TypeScript Config
- Pacing Settings & Campaign Form

## God Nodes (most connected - your core abstractions)
1. `sql` - 67 edges
2. `requireUser()` - 43 edges
3. `next` - 26 edges
4. `audit()` - 22 edges
5. `POST()` - 21 edges
6. `Portal` - 19 edges
7. `getSettings()` - 18 edges
8. `CampaignPage()` - 16 edges
9. `compilerOptions` - 16 edges
10. `Submit()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `waitForHuman()` --implements--> `Never Bypass CAPTCHAs, 2FA or Bot Checks (human handoff policy)`  [INFERRED]
  extension/background.js → README.md
- `AutoJobs Browser Extension (Chrome/Edge, Manifest V3)` --references--> `host_permissions`  [EXTRACTED]
  README.md → extension/manifest.json
- `web Service (Next.js + extension API)` --references--> `start`  [EXTRACTED]
  docker-compose.yml → package.json
- `PostgreSQL as Data Store and Persistent Queue (FOR UPDATE SKIP LOCKED)` --references--> `claimNextForUser()`  [EXTRACTED]
  README.md → src/lib/queue.ts
- `Next.js Web App (UI + Server Actions)` --references--> `dev`  [EXTRACTED]
  README.md → package.json

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Extension Pairing Flow** — readme_extension_pairing, src_app_app_connections_page, extension_popup_pairing_form, extension_background_pair, src_app_api_extension_action_route [INFERRED 0.85]
- **Server-Side Apply Logic Behind the Thin Extension** — readme_thin_executor_pattern, src_lib_adapters_jobstreet, src_lib_adapters_glints, src_lib_apply_plan, src_lib_queue [INFERRED 0.85]
- **Work Window Visibility Gating** — extension_idle_visibility_gated_queue, extension_idle_html, extension_idle, extension_background_goidle, extension_background_loop [INFERRED 0.85]

## Communities (14 total, 2 thin omitted)

### Community 0 - "Auth, Accounts & Email"
Cohesion: 0.07
Nodes (40): nextConfig, Public Multi-User SaaS (consent sign-up, email verification, ADMIN_EMAILS admin role), SMTP Email Delivery via SMTP_URL, next, ref_node_util, deleteAccount(), AccountPage(), AppLayout() (+32 more)

### Community 1 - "Campaign & Report UI"
Cohesion: 0.08
Nodes (50): Mandatory Pre-Launch Preview, AdminPage(), pct(), Campaign, Criteria(), SCRAPE_STATUS, PortalReady, PreviewItem (+42 more)

### Community 2 - "Server Actions & Profile Data"
Cohesion: 0.11
Nodes (43): ref_node_fs, done, GET(), saveAdminSettings(), createCampaign(), launchCampaign(), parseCriteria(), rescrape() (+35 more)

### Community 3 - "Extension API & Answer Planning"
Cohesion: 0.08
Nodes (43): Daily Cap of 25 Applications per Portal Account, CHALLENGE, dynamic, GET(), leasedApp(), POST(), RESULT_KINDS, status() (+35 more)

### Community 4 - "Extension Worker & Popup"
Cohesion: 0.10
Nodes (42): api(), applyFlow(), call(), checkPortals(), goIdle(), IDLE, local(), loop() (+34 more)

### Community 5 - "Listing Filters & Scrape Worker"
Cohesion: 0.09
Nodes (39): ref_node_assert, ref_node_crypto, ref_node_test, extensionLoader(), ExtensionUnavailable, isOnline(), Applied, companyTitleKey() (+31 more)

### Community 6 - "Deployment & Manifest Config"
Cohesion: 0.06
Nodes (43): docker-compose.yml — MVP Deployment Stack, caddy Service (automatic HTTPS reverse proxy), postgres Service (postgres:17-alpine), web Service (Next.js + extension API), worker Service (searches, recovery, retention), x-app Shared App Service Template (YAML anchor), action, default_icon (+35 more)

### Community 7 - "Encrypted Storage & E2E Tests"
Cohesion: 0.08
Nodes (32): appdata Volume (encrypted CVs and proofs at DATA_DIR=/data), Encrypted File Storage for CVs and Proofs (ENCRYPTION_KEY), Extension End-to-End Test (Playwright + Microsoft Edge), ref_node_http, ref_node_net, ref_node_path, playwright, GET() (+24 more)

### Community 8 - "NPM Dependencies"
Cohesion: 0.06
Nodes (32): dependencies, cheerio, next, nodemailer, postgres, react, react-dom, tsx (+24 more)

### Community 9 - "Portal Adapters"
Cohesion: 0.13
Nodes (23): cheerio, apply, glints, idr(), slug(), toListing(), CHALLENGE_TEXT, CHALLENGE_TITLE (+15 more)

### Community 10 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 11 - "Pacing Settings & Campaign Form"
Cohesion: 0.16
Nodes (14): CampaignDefaults, CampaignFields(), EMPTY_CAMPAIGN, PORTAL_NOTE, NewCampaignPage(), LEVELS, avgGapSec(), DEFAULT_SETTINGS (+6 more)

## Knowledge Gaps
- **121 isolated node(s):** `IDLE`, `status`, `manifest_version`, `name`, `version` (+116 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 160 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `sql` connect `Server Actions & Profile Data` to `Auth, Accounts & Email`, `Campaign & Report UI`, `Extension API & Answer Planning`, `Listing Filters & Scrape Worker`, `Encrypted Storage & E2E Tests`, `Pacing Settings & Campaign Form`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `next` connect `Auth, Accounts & Email` to `NPM Dependencies`, `Campaign & Report UI`, `Server Actions & Profile Data`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Why does `Extension Pairing Flow (pairing code)` connect `Extension Worker & Popup` to `Campaign & Report UI`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **What connects `IDLE`, `status`, `manifest_version` to the rest of the system?**
  _121 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth, Accounts & Email` be split into smaller, more focused modules?**
  _Cohesion score 0.07319347319347319 - nodes in this community are weakly interconnected._
- **Should `Campaign & Report UI` be split into smaller, more focused modules?**
  _Cohesion score 0.08283730158730158 - nodes in this community are weakly interconnected._
- **Should `Server Actions & Profile Data` be split into smaller, more focused modules?**
  _Cohesion score 0.10831586303284417 - nodes in this community are weakly interconnected._