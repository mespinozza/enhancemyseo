# Article Editor — Implementation Plan

Status: **built** — Phases 1 through 5 implemented. Phase 6 (polish) outstanding.
Target: let users fix small defects in generated articles (wrong product/collection linked, a bad sentence, an unsupported statistic) and adjust tone before pushing to Shopify.

Deployment note: the revisions security rule in §3.3 must be deployed before revision
history works in production (`firebase deploy --only firestore:rules`). Until then,
snapshot writes will be rejected by the client SDK.

Deviations from the plan as built:

- Whole-document DOMPurify on save was dropped. Re-serializing the entire article
  through DOMPurify normalizes attributes and defeats the byte-fidelity guarantee, so
  sanitizing happens only where new markup enters: AI responses and the raw-HTML editor.
- Rich text uses `contentEditable` scoped to one block rather than a library. The
  contentEditable host wraps the block element, so the element's tag and inline styles
  are preserved untouched. No editor dependency was needed after all.
- Tables are inline-editable alongside prose, because the key-takeaways rows are the
  text users most often want to reword.
- Undo/redo are header buttons, not keyboard shortcuts, to avoid fighting the browser's
  native per-element undo inside contentEditable.
- Streaming AI responses was skipped. Validation needs the complete response before it
  can be trusted, so the panel shows a spinner and then a diff.

Decisions already made:

- Editing surface: **block-based** — rich text for prose blocks, raw-HTML escape hatch for visual blocks
- History: **stored revisions with restore + diff view**
- Highlight-to-rewrite with AI, scoped to at most one block

---

## 1. Why block-based, and not a normal WYSIWYG

Generated articles are not plain prose. The generation prompt instructs Claude to emit hand-built visual components with inline styles: bar charts as nested `<div>`s, process-step boxes, parts info cards, and styled tables, all keyed to the brand color.

```6023:6038:frontend/src/app/api/generate-article/route.ts
      CHART CREATION SYSTEM (use inline styles only):
      For comparative data, create charts using this exact structure:
      <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border: 1px solid #ddd;">
```

Every schema-driven editor (TipTap, Lexical, Slate, Quill) normalizes the document to its own node schema on load and re-serializes on change. Any element the schema doesn't model gets dropped or flattened. Loading a whole article into one editor instance would therefore corrupt the charts, diagram boxes, and table styling the moment the user types.

The block model contains that risk: a rich-text editor is only ever instantiated over a **single prose block** whose schema surface is tiny (`p` / `h2` / `h3` / `strong` / `em` / `a` / `li`). Visual blocks are never handed to an editor at all.

Secondary benefit: block IDs make selection mapping tractable (see §5).

---

## 2. Current-state facts this plan depends on

Verified in the codebase, so implementation doesn't have to rediscover them.

**Storage.** Articles live in the root `blogs` collection. The full generated HTML is in the `content` field — there is no separate `html` field.

```53:67:frontend/src/lib/firebase/firestore.ts
export interface Blog extends BaseDocument {
  userId: string;
  brandId: string;
  title: string;
  content?: string;
  status: 'draft' | 'published';
  keyword?: string;
```

**Schema collision.** The `blogs` collection stores two unrelated document shapes: generated SEO articles (`Blog`, has `keyword` / `brandId` / `status`) and admin marketing posts (`BlogPost`, has `slug` / `published`). The editor must only accept the former.

**Persistence API.** `blogOperations.updateBlog(uid, id, data)` and `blogOperations.getBlogById(uid, id)` already exist and target the root collection. `blogOperations.create` returns `Promise<string>` — the document ID.

**The generation page already has real document IDs.** Its in-session article objects are seeded with the Firestore ID returned by `create`, so an Edit button there can link straight to the editor with no extra plumbing:

```670:677:frontend/src/app/dashboard/articles/page.tsx
            const newArticle: BlogPost = {
              id: blog,
              title: generatedContent.title || blogData.title,
              content: generatedContent.content || '',
```

**Publishing needs no changes.** `/api/shopify/push-article` reads `content` and forwards it as `body_html`, so persisted edits reach Shopify automatically.

```117:125:frontend/src/app/api/shopify/push-article/route.ts
    const articleData = {
      article: {
        title: article.title,
        body_html: article.content, // Use body_html instead of content for Shopify
```

**There is already an orphaned detail page** at `frontend/src/app/dashboard/articles/[id]/page.tsx`. It loads a single article by ID and is linked from nowhere. It only toggles publish status — no content editing. It is the natural host for the editor.

**Brand credentials are reachable from an article.** `Blog.brandId` → `brandProfiles/{id}`, which carries `shopifyStoreUrl`, `shopifyAccessToken`, `websiteUrl`, and `brandColor` — everything the link picker and preview styling need.

**Shopify search endpoints already exist** and follow one contract: `POST` with `{ shopifyStoreUrl, shopifyAccessToken, searchTerm, cursor }`, returning items plus `hasNextPage` / `endCursor`.

- `/api/content-search/products`
- `/api/content-search/collections`
- `/api/content-search/pages`

**No editor libraries are installed.** React 19.0.0, Next 15.4.5. Absent: tiptap, lexical, slate, quill, draft-js, dompurify, sanitize-html.

**No revision history of any kind exists** for generated articles.

**Auth convention** for API routes: `initializeFirebaseAdmin()` at module scope, then `Authorization: Bearer <idToken>` → `getAuth().verifyIdToken()`.

---

## 3. Data model

### 3.1 Fields added to `blogs/{id}`

| Field | Type | Purpose |
| --- | --- | --- |
| `contentUpdatedAt` | `Timestamp` | Last content edit, distinct from `updatedAt` which any write touches |
| `hasManualEdits` | `boolean` | Surfaces an "edited" badge and lets us measure how often generation misses |
| `originalContent` | `string` | First generated HTML, written once, so "revert to original" always works |

`originalContent` duplicates one article's HTML (tens of KB) inside a 1MB document limit. That is acceptable for one copy and is the reason revisions do **not** live on the document.

### 3.2 Revisions subcollection

`blogs/{blogId}/revisions/{revisionId}`

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | `string` | Required for security rules |
| `content` | `string` | Full HTML snapshot, not a delta |
| `createdAt` | `Timestamp` | |
| `source` | `'manual' \| 'ai-edit' \| 'link-swap' \| 'pre-restore'` | Drives the history list icons |
| `label` | `string` | e.g. `Rewrote paragraph 4`, `Swapped product link` |
| `blockId` | `string?` | Which block changed, when applicable |

Full snapshots rather than deltas: articles are small, restore becomes trivial, and diffing is computed on read.

**Retention:** keep the most recent 30 revisions per article; prune older ones on write. Without a cap this grows unbounded across every article for every user.

**Snapshot on:** explicit save, each accepted AI edit, each link swap, and immediately before a restore (so restoring is itself undoable). **Not** on keystrokes or autosave ticks.

### 3.3 Security rules — needs an explicit addition

The existing `/blogs/{document}` rule does not cover subcollections. Today an unmatched subcollection falls through to:

```81:83:firestore.rules
    match /{path=**} {
      allow read, list: if request.auth != null;
    }
```

That means without a new rule, **any authenticated user could read any other user's revisions**, and clients could not write them at all. Required addition:

```
match /blogs/{blogId}/revisions/{revisionId} {
  allow read, list: if request.auth != null &&
                       request.auth.uid == resource.data.userId;
  allow create: if request.auth != null &&
                   request.auth.uid == request.resource.data.userId;
  allow update, delete: if false;
}
```

Revisions are append-only by design; pruning runs server-side with the Admin SDK, which bypasses rules.

---

## 4. Routes and files

### New page

`frontend/src/app/dashboard/articles/[id]/edit/page.tsx` — the editor.

Layout: main column of blocks, right rail with tabs for **Links**, **History**, and **Outline**. Sticky header with title, save state, revision count, and Push to Shopify.

Reuse the existing `[id]/page.tsx` loader pattern (React Query + `getBlogById`); it stays as a read-only preview.

### New components

`frontend/src/components/article-editor/`

| File | Responsibility |
| --- | --- |
| `ArticleEditor.tsx` | Owns block array, dirty state, save orchestration |
| `BlockList.tsx` | Renders blocks, handles focus/hover affordances |
| `ProseBlock.tsx` | Rich-text editing for a single prose block |
| `VisualBlock.tsx` | Live preview + raw-HTML editing for charts/tables/callouts |
| `SelectionToolbar.tsx` | Floating toolbar anchored to a selection |
| `AiEditPanel.tsx` | Presets, free-text instruction, streaming result, accept/reject |
| `DiffView.tsx` | Word-level before/after |
| `LinkPanel.tsx` | Extracted Shopify links, validity, swap flow |
| `HistoryPanel.tsx` | Revision list, preview, restore |

### New lib modules

| File | Responsibility |
| --- | --- |
| `frontend/src/lib/article/blocks.ts` | `parseBlocks(html)` / `serializeBlocks(blocks)` |
| `frontend/src/lib/article/links.ts` | Extract and rewrite Shopify links |
| `frontend/src/lib/article/sanitize.ts` | DOMPurify config permitting inline styles |
| `frontend/src/lib/article/diff.ts` | Word-level diff helper |

### New API routes

| Route | Purpose |
| --- | --- |
| `POST /api/article/edit-block` | AI rewrite of one block or selection; returns a replacement element |
| `POST /api/article/revisions` | Create a revision + prune beyond 30 (Admin SDK) |
| `GET /api/article/revisions?blogId=` | List revisions (could be client-side Firestore instead) |
| `POST /api/article/validate-links` | Batch-check that linked handles still exist in the store |

### Shared extraction from `generate-article/route.ts`

That file is ~7,600 lines and already contains the exact primitives the AI edit path needs. Move, don't copy, into `frontend/src/lib/article/rewrite.ts`:

- the single-element rewrite prompt builder and its guard rails
- `ensureCompleteElement`
- `ensureHTMLFormat`
- the refusal/meta-commentary detection patterns
- the markdown→HTML link conversion

Then have `generate-article` import them, so the fact-check loop and the interactive editor can never drift apart.

---

## 5. Block parsing and selection mapping

`parseBlocks(html)` runs client-side with `DOMParser` — no dependency needed. It walks top-level children of `<body>` and emits:

```ts
type Block = {
  id: string;            // stable within a session, e.g. "b-12"
  kind: 'prose' | 'visual';
  tag: string;           // 'p' | 'h1' | 'h2' | 'table' | 'div' | 'ul' ...
  html: string;          // the element's full outerHTML
};
```

Classification: `h1`–`h4`, `p`, `ul`, `ol`, `blockquote` → `prose`. Everything else — `table`, `div`, `figure` — → `visual`.

`serializeBlocks` concatenates `block.html` in order. Round-tripping an untouched article must be byte-identical apart from whitespace; that is the first test to write (§11).

**Why this makes highlight-to-rewrite feasible.** A browser `Selection` gives DOM nodes and offsets. Mapping that back to a character range inside a single 40KB HTML string is unreliable in the general case — identical text recurs, and tag boundaries don't align with visible text. With per-block containers the problem reduces to "block `b-12`, visible-text offsets 40–180", resolved against that one block's own DOM. Selections that cross block boundaries are clamped to the first block, which enforces the "at most one paragraph" rule naturally.

---

## 6. AI edit flow

1. User selects text inside a prose block (or clicks a block's AI button for whole-block edits).
2. `SelectionToolbar` appears anchored to the selection rectangle.
3. User picks a preset or types an instruction.
4. Client `POST`s to `/api/article/edit-block`:

```ts
{
  blogId: string;
  blockHtml: string;        // the complete element, for context
  selectedText?: string;    // omitted for whole-block edits
  instruction: string;      // preset-expanded or free text
  brandContext: { brandName, businessType, toneOfVoice, brandColor };
}
```

5. Server verifies the token, confirms `blogs/{blogId}.userId` matches, calls Claude via the shared rewrite helper, validates the response (complete element, contains HTML, no refusal text, no stray markdown), and returns the replacement.
6. Client shows a diff. **Nothing is applied until the user accepts.**
7. On accept: replace `block.html`, mark dirty, write a revision with `source: 'ai-edit'`.

**Presets:** Shorten · Expand · More technical · Simplify · Match brand tone · Remove unsupported statistic · Fix factual claim · Tighten wording. Plus a free-text box.

**Passing only the block, not the article,** keeps latency and token cost low. Because the existing prompt already demands standalone sentences that "don't reference other paragraphs", isolated rewrites don't create dangling references — that constraint is already load-bearing in the fact-check loop.

**Streaming:** these calls take a few seconds. Stream tokens into the diff pane so the UI doesn't look frozen. If streaming complicates the validation step (which needs the complete response), stream for display only and validate on completion.

**Whole-block AI edits on visual blocks** are explicitly out of scope for v1 — too easy to destroy chart markup. Visual blocks get raw HTML editing only.

---

## 7. Shopify link management

This is the highest value-per-effort piece and the user's stated primary pain point.

Links are plain anchors with no identifying attributes — the AI writes them inline during generation from a URL list injected into the prompt:

```5673:5678:frontend/src/app/api/generate-article/route.ts
      if (contentSelection.automaticOptions.includeProducts) {
        const products = await searchShopifyProducts(...);
        if (products.length > 0) {
          relatedProductsList = products.map(p => `• ${p.title} - ${body.websiteUrl}/products/${p.handle}`).join('\n');
```

So detection is by URL path pattern, not metadata:

- `/products/{handle}` → product
- `/collections/{handle}` → collection
- `/pages/{handle}` → page

`links.ts` extracts every anchor into `{ blockId, href, anchorText, kind, handle }`.

**Link panel behavior**

- Lists every Shopify link with its type, handle, and anchor text, grouped by block, with click-to-scroll.
- `/api/article/validate-links` batch-verifies each handle still resolves in the store; unresolved handles get flagged. This catches a failure mode that is invisible today.
- Clicking a link opens a picker backed by the existing `/api/content-search/*` routes (search-as-you-type, paginated via `endCursor`).
- Selecting a replacement rewrites only that anchor's `href`, and offers — but does not force — updating the anchor text to the new title. Forcing it would break sentence grammar; offering it avoids the "link says Frymaster 8074815 but points at a different part" mismatch.
- Each swap writes a revision with `source: 'link-swap'`.

Rewriting must be done via DOM manipulation on the owning block, not string replacement on the whole article, since the same href can legitimately appear more than once.

---

## 8. History and diff

- **In-session undo/redo** is local state, instant, keyboard-driven. Separate concern from stored revisions.
- **Revision list** in the right rail: relative time, source icon, label, hover to preview, click to open diff against current, explicit Restore.
- **Restore** snapshots current state first (`source: 'pre-restore'`) so it is itself reversible.
- **Diff** is word-level, computed client-side. Recommend `diff` (jsdiff) — small, stable, no React coupling. Diffing rendered text rather than raw HTML is far more readable; diff visible text per block and mark blocks as added/removed/changed.
- **Revert to original** uses `originalContent`, which is why that field is written once at first save.

---

## 9. Save semantics

- Explicit **Save** button is the primary path, with clear dirty/saving/saved state in the header.
- **Autosave** on a 3–5s debounce after edits stop, writing only `content` + `contentUpdatedAt` + `hasManualEdits`. Autosave does **not** create revisions.
- Warn on navigation away while dirty.
- Guard against editing an article whose generation is still in flight; the generation page writes `content` after the API returns and would clobber concurrent edits. Simplest guard: only show Edit once that article's status is `completed` in the session, and on the history page always (generation has finished by then).
- Writes go through `blogOperations.updateBlog(uid, id, ...)`, matching existing conventions.

---

## 10. Security and sanitization

Article HTML is rendered with `dangerouslySetInnerHTML` today. Once users and AI responses can inject markup, that risk grows. Add `dompurify` (+ `@types/dompurify`).

The configuration matters more than the dependency: **inline `style` attributes must be allowed**, or sanitizing will strip the styling off every chart, table, and callout box in every article. Allow `style`, `href`, `target`, `rel`, `colspan`, `rowspan`; allow the structural tags the generator emits; strip `script`, `iframe`, `object`, `on*` handlers, and `javascript:` URLs.

Sanitize at three points: on load before rendering, on every AI response before diffing, and on save before persisting.

Server side, `/api/article/edit-block` must confirm the caller owns `blogs/{blogId}` before doing anything — verifying the token alone is not sufficient authorization.

---

## 11. Testing

The single most important test: **load every existing article, parse to blocks, serialize back, assert output matches input** (modulo insignificant whitespace). If round-tripping is not lossless, nothing else in this design is safe.

Then:

- Charts, styled tables, callout boxes, and info cards survive a full load → edit an unrelated paragraph → save cycle with markup intact.
- Sanitizer preserves inline styles and brand color while stripping `script` / `on*` / `javascript:`.
- Selection spanning two blocks clamps to one.
- AI edit returning a refusal or markdown is rejected and leaves content untouched.
- Link swap changes exactly one anchor when duplicate hrefs exist.
- Restore creates a `pre-restore` revision and is reversible.
- Revision pruning keeps exactly the newest 30.
- Editor refuses to open a marketing `BlogPost` document.
- Edited content reaches Shopify as `body_html`.

---

## 12. Phasing

**Phase 1 — Foundation**
Block parse/serialize with the round-trip test. Editor route and shell. Sanitizer. Save + autosave. `originalContent` backfill on first save. Edit buttons wired at both entry points (generation page card actions around `frontend/src/app/dashboard/articles/page.tsx:1985-2004`, history page card footer around `frontend/src/app/dashboard/history/page.tsx:1146-1161`). Raw-HTML editing for visual blocks.

**Phase 2 — Link manager**
Link extraction, link panel, picker wired to `/api/content-search/*`, href rewriting, handle validation. Delivers the primary pain point.

**Phase 3 — Revisions**
Subcollection, security rules, snapshot triggers, retention pruning, history panel, restore, revert-to-original.

**Phase 4 — Prose editing**
Rich text over single prose blocks. Inline `strong` / `em` / `a`, heading level changes, list handling.

**Phase 5 — AI edits**
Extract shared rewrite helpers out of `generate-article/route.ts`. New `/api/article/edit-block`. Selection toolbar, presets, streaming, diff, accept/reject.

**Phase 6 — Polish**
Word-level diff view, outline navigation, keyboard shortcuts, mobile behavior, empty/error states.

Phases 1–3 are independently shippable and cover the stated problem. Phases 4–5 are the larger build, and the cost is concentrated in frontend state management rather than the AI layer, which mostly exists already.

---

## 13. Dependencies to add

| Package | Why | Notes |
| --- | --- | --- |
| `dompurify` + `@types/dompurify` | XSS protection on rendered/edited HTML | Must be configured to allow inline `style` |
| `diff` + `@types/diff` | Word-level revision diffs | Small, framework-agnostic |
| Rich text for prose blocks | Phase 4 only | Decide at Phase 4 (see below) |

Block parsing needs no dependency — `DOMParser` is built in.

Deferring the rich-text choice to Phase 4 is deliberate: Phases 1–3 deliver the primary value without it, and by then the block model will have made the actual requirements concrete. TipTap is the leading candidate because a per-block instance keeps its schema surface minimal, but React 19 compatibility should be confirmed against current versions at that time rather than assumed now.

---

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| Lossy block round-trip corrupts articles | Round-trip test on real articles before anything else ships |
| Sanitizer strips inline styles, destroying all visuals | Explicit allowlist for `style`; visual regression check |
| Rich-text editor mangles chart markup | Editor never instantiated over visual blocks |
| Concurrent generation overwrites edits | Gate Edit until generation completes |
| Revisions grow without bound | Hard cap of 30, pruned server-side |
| Revisions leak across users | Explicit subcollection rule; current fallback rule would expose them |
| Editor opened on a marketing `BlogPost` | Validate `keyword` / `brandId` present before opening |
| AI rewrite returns prose instead of HTML | Reuse the existing validated rewrite guards, not a fresh prompt |

---

## 15. Open questions

1. Should editing an already-published Shopify article offer to re-push and update it, or stay push-as-new-draft as today?
2. Should the AI edit path count against usage limits the way generation does (`serverSideUsageUtils.canPerformAction`), or be free?
3. Should `/dashboard/articles/[id]/page.tsx` remain a read-only preview, or redirect to the editor and be deleted?
4. Is title editing in scope? It is a separate Firestore field and trivial to include, but it also feeds the Shopify article title.
5. Should link validation run automatically on editor open (a Shopify API call per article load) or only on demand?
