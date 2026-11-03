# Designing proposals from chat

Start from Website builder -> select proposal -> Chat / JSON design -> Export design JSON. Supply that JSON and the desired changes in chat. Ask for a complete schema-v1 configuration rather than HTML or executable JavaScript. Import the result, click Validate & apply JSON, preview and save. Changes remain a draft until separately approved and published.

A useful request:

> Keep the existing commercial content. Use an editorial layout with forest green and warm neutral colours. The landing page should introduce the engagement and show the proposal reference, client and validity date. Use tabs named Overview, Our approach, Delivery plan, Investment, Terms and Your response. Add a three-stage timeline under Delivery plan and an FAQ under Our approach. Return a complete website configuration matching shared/website.ts.

## Stable structure

The source of truth is `websiteSchema` in `shared/website.ts`.

- `schemaVersion`: 1.
- `designBrief`: internal text only; never sent to clients.
- `theme`: preset (`editorial`, `corporate`, `minimal`), primary/accent/background/text colours as six-digit hex, heading font (`sans`, `serif`), corner radius (`square`, `soft`, `round`), density (`comfortable`, `compact`), hero (`split`, `centred`, `simple`).
- `home`: eyebrow, title, introduction, ctaLabel and ctaTabId.
- `tabs`: ordered array. First must be the one enabled `home` tab. Every tab has a unique id, label, kind, enabled boolean, sectionIds array and blocks array.
- `publicAttachmentIds`: IDs explicitly approved for this proposal. Never invent attachment IDs.
- `allowResponses`, `allowPrint`: booleans.

Tab kinds: home, sections, pricing, terms, attachments, requirements, response, custom.

An empty sectionIds array on a sections tab means all source document sections. Nonempty arrays must refer to actual section UUIDs from the selected document. Use a custom tab for a page containing only new website blocks.

Each block has an id, kind, title, body and items array. Supported kinds: text, callout, cards, timeline, faq, stats, image. Each item is `{title, body}`. Image blocks additionally use `attachmentId` (an owned, explicitly shared PNG/JPEG) and optional `caption`.

A custom tab fragment:

```json
{
  "id":"delivery",
  "label":"Delivery plan",
  "kind":"custom",
  "enabled":true,
  "sectionIds":[],
  "blocks":[{
    "id":"delivery-timeline",
    "kind":"timeline",
    "title":"From priorities to progress",
    "body":"A staged approach with clear review points.",
    "items":[
      {"title":"Discover","body":"Confirm the current position and success measures."},
      {"title":"Design","body":"Agree the plan, responsibilities and milestones."},
      {"title":"Deliver","body":"Implement, review and refine."}
    ]
  }]
}
```

Landing-page text can use `{{title}}`, `{{client.name}}`, `{{business.name}}`, `{{reference}}`, `{{validUntil}}` and `{{preparedBy}}`. These placeholders substitute text; they never execute code.

Keep required source sections visible. Keep pricing and terms tabs when the underlying proposal contains pricing or terms. Enable a response tab when allowResponses is true. CTA destinations must refer to an enabled tab. Custom CSS, remote scripts, inline HTML and external tracking URLs are deliberately not supported.

Future assistants modifying a proposal via the authenticated API must first GET `/api/documents/:id/website`, inspect the current configuration and versions, and PUT the full validated config with `expectedVersion` and `expectedDocumentVersion`. A conflict means re-read and reconcile. Do not modify published snapshots or use direct database writes to bypass approval and version controls. Publishing, accepting and sending a client link are separate actions and require explicit user instructions.
