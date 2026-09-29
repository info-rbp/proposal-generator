# Proposal Generator

Standalone proposal, tender-response, RFQ and capability-statement builder for Remote Business Partner. It reuses the proven workflow patterns from `info-rbp/Property-Report-Tool` without sharing its production database, R2 bucket or Cloudflare Access application.

## V1 workflow
1. Create a proposal, tender response, RFQ or capability statement.
2. Complete client details and structured narrative sections.
3. Build pricing with quantity, rate, discount, tax and optional items.
4. For tenders, record closing instructions and a requirement-by-requirement compliance register.
5. Upload supporting PDF, Word, Excel or image attachments.
6. Move a complete draft through review and approval, then issue an immutable PDF snapshot.
7. Create a new revision when issued material must change.

## Architecture
- React + Vite UI
- Cloudflare Worker API
- D1 canonical document JSON and metadata
- R2 attachments and issued PDFs
- Cloudflare Access authentication
- IndexedDB recovery cache
- jsPDF PDF generation and `docx` editable Word generation
- Atomic optimistic locking with `UPDATE ... WHERE version = ?`

## Local setup
```bash
bun install
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bunx wrangler dev --local --ip 127.0.0.1 --port 8787
# second terminal
bun run dev
```

`DEV_USER_EMAIL` is accepted only on localhost.

## Cloudflare setup before production
Create dedicated resources; do **not** reuse ProInspect's D1, R2 or Access application:
```bash
bunx wrangler d1 create proposal-generator
bunx wrangler r2 bucket create proposal-generator-documents
```
Replace the all-zero `database_id` placeholder in `wrangler.jsonc`. Create a separate Cloudflare Access application, configure `TEAM_DOMAIN`, `POLICY_AUD`, and optionally comma-separated `APPROVER_EMAILS`, then run `bun run db:migrate:remote`.

## Commercial controls
- Approved and issued revisions cannot be edited in place.
- Issued PDF bytes are SHA-256 checked before storage.
- Mandatory tender responses, evidence links, word limits and review flags block progression when incomplete.
- Pricing is recalculated in the Worker from structured decimal inputs.
- Attachments are MIME allow-listed and capped at 25 MB.
- Audit events record create, save, status, attachment, revision and issue actions.
- V1 excludes AI drafting, automatic tender extraction, email sending, e-signature and external client portals.
