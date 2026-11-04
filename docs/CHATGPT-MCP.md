# RBP Proposal Studio — ChatGPT MCP connector

This is a **private remote MCP app for ChatGPT**, not a browser plugin. It operates on the existing Cloudflare D1 and R2 storage through the existing document and website business logic.

## Functions

- List brands, clients, templates and proposals.
- Create a **draft** from a template and an existing client and brand, or from the validated document schema.
- Read and edit proposal content with optimistic document version checks.
- Add or rewrite individual proposal sections.
- Read and edit hero, colours, tabs, content blocks, pricing navigation and client-facing layout using the shared website schema.
- Save reusable website designs.

**Not supported by design:** approving proposals, issuing or publishing client links, emailing clients, bypassing existing schema validation, modifying already published snapshots. Those actions stay in the protected staff web application.

## Set up Cloudflare Access as the identity provider

1. Create a Cloudflare Access **SaaS OIDC** application named **Proposal Studio ChatGPT**, restricted to named staff accounts. Configure its redirect URI to `https://<mcp-host>/callback` and use its OIDC client ID and secret. The OIDC discovery values vary by Access application: confirm the issuer, authorization, token and JWKS endpoints before setting worker configuration.
2. Create a dedicated Workers KV namespace for the short-lived OAuth authorization states.
3. In `wrangler.mcp.jsonc` replace `REPLACE_OAUTH_KV_ID` with the KV namespace ID; replace `MCP_RESOURCE` with the full public HTTPS `/mcp` URL of the Worker; verify all `ACCESS_*` endpoint values against the Access OIDC client metadata. Never use a placeholder on a production deployment.
4. Set Worker secrets **ACCESS_CLIENT_ID**, **ACCESS_CLIENT_SECRET**, **ALLOWED_EMAILS** (comma-separated authorized staff emails). The service refuses every user if the allowlist is missing. Do not commit secrets. The `ACCESS_ISSUER`, `ACCESS_AUTHORIZATION_URL`, `ACCESS_TOKEN_URL`, and `ACCESS_JWKS_URL` values must be verified and may be configured as secrets too.
5. Run `bun install`, `bun run lint`, `bun run test` and `bun run deploy:mcp`. Unlike the existing Workers, MCP deployment is **separate** and not included in the automatic production `deploy:workers` pipeline.
6. In ChatGPT, go to **Settings → Apps & Connectors / Plugins → Create** (available controls vary by workspace), choose a **remote MCP** server, and enter `https://<mcp-host>/mcp`. Complete OAuth in the browser. The account owner/admin must approve the private app for workspace use where required.
7. Test with: “List my Proposal Studio clients and templates”; “Create a draft for client X using template Y and brand Z”; “Rework the Overview page and add a Methodology tab”; “Show me the draft proposal website and publication issues”.

## Authentication and safety model

- ChatGPT uses OAuth Authorization Code + PKCE, with upstream Cloudflare Access OIDC.
- The connector verifies the Access ID token signature, issuer, audience and email, then restricts access to `ALLOWED_EMAILS`. Authentication state lives in KV for at most 10 minutes, bound to an HttpOnly SameSite cookie.
- Access token and client secret never appear in an MCP tool result.
- Each tool is authorized using the authenticated staff email, and writes are audited by the existing APIs.
- All document and website changes use the production schema validation and optimistic version checks. The connector is intentionally unable to publish or approve.

The connector cannot be considered deployed or usable until the Access OIDC credentials, KV binding, actual worker URL, production build and ChatGPT connection have been configured and verified.
