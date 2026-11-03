# Proposal Studio

Web-first proposal, tender-response, RFQ and capability-statement builder for Remote Business Partner. The internal studio and client-facing proposal website share the existing Cloudflare D1 database and R2 storage, but have separate frontends and API boundaries.

## Client experience

Every published proposal has a private, revocable link to a branded **Overview landing page**, followed by configurable tabs. Tabs can show proposal sections, alternative commercial offers, terms and schedules, selected resources, tender responses, a response form or custom content.

The website builder supports reordered tabs and blocks, text, callouts, cards, timelines, FAQs, statistics and owned image attachments. Design settings include colours, typography, spacing, corner styles and landing-page layouts. Reusable website layouts and schema-validated JSON import/export let designs developed in chat be applied without executing arbitrary HTML or JavaScript.

## Core workflow

1. Maintain reusable brands, clients and versioned document templates.
2. Create a commercial document through Brand -> Client -> Template, preserving master-data snapshots.
3. Complete narrative content, pricing, alternative offers, terms and any tender requirements.
4. Open **Website builder**, select that document and customise its landing page, tabs and design.
5. Explicitly select which attachments may be shared. Preview and save the website layout.
6. Review and approve the document, then publish an immutable website snapshot.
7. Copy the client link. View recorded responses, replace the link or withdraw access in **Publish & responses**.
8. Create a new revision when published content or design must change.

PDF and Word exports remain available from Documents & master data. Website publication no longer requires an uploaded PDF. A tender website is not a substitute for submitting the tender through its required procurement channel.

## Architecture

- React + Vite internal studio, Worker `proposal-generator`.
- Separate React + Vite client frontend, Worker `proposal-client`.
- Existing D1 canonical documents, master data, website layouts, immutable publications and responses.
- Existing R2 attachments, brand assets and historical issued PDFs.
- Cloudflare Access protects internal APIs; the public Worker exposes only token-scoped published proposals.
- Optimistic version checks and atomic D1 publication updates.
- Server-side decimal-safe pricing and publication-hash-linked client responses.

Internal domain: `proposal.studio.remotebusinesspartner.com.au`.
Client domain: `proposals.remotebusinesspartner.com.au`.
Synthetic, non-commercial demonstration: client domain `/demo`.

No existing drafts are published automatically. Internal notes, design briefs, hidden sections and unselected attachments are excluded from public payloads. Anyone possessing a private proposal link can access that proposal until the link expires or is withdrawn. Client responses are recorded acknowledgements, not independently identity-verified e-signatures. Payment integrations and automatic email notifications are not included.

## Local development

```bash
bun install
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bun run build
# Internal API/static assets
bunx wrangler dev --local --ip 127.0.0.1 --port 8787
# In another terminal: internal UI hot reload
bun run dev
# In another terminal: public API/static assets
bunx wrangler dev --config wrangler.public.jsonc --local --ip 127.0.0.1 --port 8788
# Optional public UI hot reload in another terminal
bun run dev:client
```

`DEV_USER_EMAIL` is accepted only on localhost. For local client-link testing, set `PUBLIC_PROPOSAL_ORIGIN=http://127.0.0.1:8788` in local variables.

## Verification and deployment

```bash
bun run lint
bun run test
bun run build
bun run deploy:check
bunx playwright install --with-deps chromium
bun run test:browser
```

Production deployment from the same checkout:

```bash
bun run deploy
```

The Cloudflare production Builds trigger must use `bun run deploy:workers` as its deploy command. This applies the additive database migrations and deploys both Workers. Non-production preview builds must not deploy the public production Worker.

Existing installations created without Wrangler migration tracking must first verify and baseline migrations 0001-0003; do not rerun the non-idempotent initial migration over existing tables. Migration 0004 adds the website/publication tables without rewriting existing document data. The internal API also has an idempotent website-schema bootstrap as a safety net.

## Documentation

- [Architecture, security, APIs and operations](docs/WEB-PROPOSALS.md)
- [Designing proposals from chat](docs/CHAT-DESIGN.md)

The original document editor and API are preserved in `src/DocumentStudio.tsx` and `worker/documents.ts`. Existing brand, client, template, pricing, approval and revision workflows are retained.
