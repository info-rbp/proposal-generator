# Web proposal architecture and operations

## Two interfaces, one canonical backend

- Internal studio: `proposal.studio.remotebusinesspartner.com.au`, Worker `proposal-generator`, protected by the existing Cloudflare Access application.
- Client website: `proposals.remotebusinesspartner.com.au`, Worker `proposal-client`, with a separate public-only frontend and public-only API.
- Both Workers bind to the existing `proposal-generator` D1 database and `proposal-generator-documents` R2 bucket. No duplicate client, brand, pricing or document database is created.
- The original document editor and API are preserved in `src/DocumentStudio.tsx` and `worker/documents.ts`. PDF/Word exports remain optional. Website publishing does not require a PDF.

## Workflow

Create the commercial document using Brands, Clients and Templates. Open Website builder and select that document. Choose a design, edit the landing page and configure tabs. Source-document sections always use current saved document content until publication; custom website blocks and the theme are stored separately in the same database. Explicitly select any shared resources. Save the layout, preview it, send the document to review, approve and publish. Copy the private link from Publish & responses.

Every client link opens an Overview landing page. Other tabs can contain selected document sections, pricing/options, terms/schedules, attachments, tender responses, a response form, or custom content. Supported custom blocks are text, callout, cards, timeline, FAQ, statistics and an image from an owned attachment. Tabs and blocks can be reordered. The mandatory home page cannot be removed.

The publication transaction checks both the document version and website version, creates an immutable public snapshot, hashes it, locks the document revision and records an audit event. A later brand/template edit cannot rewrite that snapshot. Once published, use Create new revision to change content or design. Website layouts are inherited into new revisions, but attachment sharing is cleared because attachment IDs change.

Publishing an existing PDF-issued revision is allowed when it has not previously had a web publication. Previously issued PDFs remain available. Publishing a tender webpage does not submit the tender.

## Chat-influenced design

See `docs/CHAT-DESIGN.md`. Export the current design JSON, ask for changes in chat, and import the resulting schema-v1 JSON in Chat / JSON design. Import uses the same strict Zod schema as the backend. The design brief is internal and is removed from published JSON. This is a structured design import workflow, not an embedded language-model service.

## API

All internal endpoints require the existing verified Cloudflare Access user JWT; localhost development can use `DEV_USER_EMAIL`.

- `GET /api/documents/:id/website`: canonical document, current layout/version, publication controls and submitted responses.
- `PUT /api/documents/:id/website`: `{config, expectedVersion, expectedDocumentVersion}`. Optimistic concurrency; published layouts cannot be changed.
- `POST /api/documents/:id/website/publish`: `{expectedDocumentVersion, expectedWebsiteVersion, expiresAt?}`. Only approved or already issued revisions.
- `POST /api/documents/:id/website/rotate`: `{publicationId}`. Replaces the private token; previous link stops working.
- `POST /api/documents/:id/website/revoke`: `{publicationId}`. Withdraws access, including all attachments.
- `GET /api/website-templates` and `POST /api/website-templates`: reusable layouts. Saving a template removes resource IDs and document-specific section selections.
- `GET /api/site-health`: authenticated configuration health.

Public endpoints on the separate client Worker:

- `GET /api/health`: non-sensitive schema/service check.
- `GET /api/p/:token`: only an active, unexpired published snapshot.
- `GET /api/p/:token/logo`, `/attachments/:id`, `/pdf`: publication-scoped assets only; PDF downloads are available only when an issued PDF exists and printing is enabled.
- `POST /api/p/:token/responses`: accept, decline or request changes.

The public Worker has no document-list, edit, client, brand or master-template endpoints. The public payload explicitly excludes internal source IDs, design briefs, review flags and hidden sections. File keys never appear in public JSON. Every asset request checks the token, expiry and revocation again.

## Link and response security

Links are 256-bit random capability tokens. Anyone possessing a link can access its proposal until expiry, withdrawal or replacement. Tokens are stored in the staff-only publication row so authorised staff can copy links again. Do not paste live tokens into tickets, logs or public source code. Public Worker observability is disabled to avoid retaining token-bearing URLs in invocation logs. Responses and HTML are private/no-store, noindex, no-referrer, frame-restricted and use a restrictive content security policy. There are no third-party analytics or external tracking scripts.

Required proposal sections, pricing and terms cannot be hidden when publishing. All public narrative content is rendered as escaped React text or a small safe Markdown subset; arbitrary HTML, scripts, styles and external image URLs are not supported. Image blocks use explicitly shared owned PNG/JPEG attachments.

Client responses are private-link acknowledgements, not independently identity-verified electronic signatures. Acceptance records the exact publication hash, selected option, selected optional items, canonical prices, name/email, acknowledgement and timestamp. Client-supplied prices are rejected. Rate-card/illustrative offers do not generate a misleading total commitment. Alternative offers are never summed. Repeated requests use idempotency keys; a final acceptance/decline is unique per publication. A fixed-window rate limit bounds response submissions. Response writes check active/unexpired status again atomically.

Engagement counts are labelled **link requests**, not verified human reads: email security scanners and reloads can contribute. No visitor IP address is retained by the application. Client responses require manual refresh in the studio; automatic notification emails, payments and identity-verified signing are not included.

## Deployment and schema

`bun run build` builds both isolated frontends. `bun run deploy:workers` applies D1 migrations and deploys both Workers from the same checkout. Configure the production Cloudflare Builds trigger for `main` to use that command instead of a single `wrangler deploy`. Preview builds should only upload the internal Worker version, never deploy the production public Worker.

Migration `0004_proposal_websites.sql` is additive and idempotent; it does not rewrite existing document content or publish existing drafts. The internal API also bootstraps these new tables idempotently as a safety net. The public worker does not create schema on public requests.

Existing installations whose tables were originally created outside Wrangler must baseline `d1_migrations` for migrations 0001-0003 **only after verifying their schema matches those migrations**. Do not blindly rerun non-idempotent migration 0001 against an existing database and do not delete data to fix migration tracking.

Resources:
- Existing D1: `06d03083-257c-4187-ad88-f207dfd0c401`.
- Existing R2: `proposal-generator-documents`.
- Internal config: `wrangler.jsonc`.
- Client config: `wrangler.public.jsonc`.

Do not add the public Worker to the internal Worker-level Cloudflare Access application: clients must not need a staff login. Do not remove Access from the internal Worker.

## Verification

`bun run lint`, `bun run test`, both production builds, both Wrangler dry-runs and `bun run test:browser`.

The website integration tests use a real isolated SQLite database with all migrations and the same API handlers. They cover publishing, snapshot immutability, concurrency, token rotation/revocation/expiry, public/private isolation, attachment ownership, pricing, response idempotency and rate limiting. Playwright covers desktop/mobile landing pages, tab navigation, response submission and the internal website editor. Synthetic screenshots are retained as GitHub Actions artifacts; no client proposals are used in CI.
