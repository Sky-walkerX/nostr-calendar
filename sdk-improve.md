# Formstr SDK Improvements for Calendar Integration

These are future Formstr SDK improvements that would make the Nostr Calendar form/RSPV integration simpler, more consistent, and less app-specific. They are out of scope for the current calendar PR stack, but worth keeping as product/SDK context.

## Current Calendar Integration Pain Points

- Calendar embeds the SDK-generated fill form, but has to build its own read-only response summary for attendees.
- Calendar has to query relays directly to determine whether the current user already submitted a kind `1069` response.
- Calendar has to parse kind `1069` `response` tags itself to display answers.
- Host response viewing is better delegated to Formstr because Formstr already owns the full responses experience.
- URL shape knowledge (`/f/:naddr`, `/s/:naddr`, `viewKey`) currently lives in the calendar app instead of the SDK.

## Highest-Value SDK Additions

### 1. Fetch Latest User Response

Add an SDK method that returns the latest response for a specific form and responder.

Example API:

```ts
sdk.fetchUserResponse({
  naddr,
  pubkey,
  relays,
}): Promise<NostrEvent | null>
```

This would centralize relay selection, `#a` filtering, kind `1069` lookup, and latest-response selection.

### 2. Normalize / Parse Response Events

Add a helper that converts a response event into display-ready answers using the normalized form template.

Example API:

```ts
sdk.parseResponse(form, responseEvent): ParsedFormResponse
```

It should handle:

- option IDs mapped to labels
- checkbox and multi-select values
- `other` option metadata
- grid responses expanded into readable row/column labels
- date, time, and datetime formatting primitives
- file-upload metadata
- unknown field fallback

### 3. Render Read-Only Submitted Response

Add a renderer for showing a submitted response using the same form/question layout.

Example API:

```ts
sdk.renderResponseHtml(form, responseEvent, options)
```

or, in a React package:

```tsx
<ResponseRenderer form={form} response={responseEvent} />
```

This would remove the need for every embedding app to create separate summary UIs for short answer, MCQ, polls, grids, files, etc.

### 4. Support Initial Values and Modes in `renderHtml`

Extend the existing HTML renderer with modes and initial values.

Example API:

```ts
sdk.renderHtml(form, {
  mode: "fill" | "readonly" | "update",
  initialValues,
})
```

This would make `View / update response` feel natural: the same form can be shown prefilled, read-only, or editable.

### 5. Export a Supported React Renderer

The Formstr web app already has rich React field renderers for text, paragraph, number, radio, checkboxes, dropdown, date/time/datetime, signature, file upload, and grids. Exporting a stable package would let other apps embed the exact Formstr UI.

Possible package:

```ts
@formstr/react
```

Useful exports:

- `FormRenderer`
- `ResponseRenderer`
- field renderers and types
- response parsing utilities

### 6. URL Helper APIs

Add SDK helpers for canonical Formstr URLs so apps do not hard-code route shapes.

Example API:

```ts
sdk.buildFormUrl({ naddr, viewKey })
sdk.buildResponsesUrl({ naddr, viewKey })
sdk.buildEditUrl({ naddr, editKey })
```

### 7. Encrypted Response Utilities

If supported by Formstr's security model, expose safe helpers for owners/authorized viewers to decode encrypted responses.

Example API:

```ts
sdk.decryptResponse({ form, responseEvent, editKey })
```

This would let host apps render owner-only responses without copying internals from the Formstr web app.

### 8. Submit Listener Cleanup

Make `attachSubmitListener` return a detach function.

Example API:

```ts
const detach = sdk.attachSubmitListener(form, signer, callbacks);
detach();
```

This would make React integrations safer by preventing duplicate submit listeners after remounts.

### 9. Stronger Field and Response Types

Tighten SDK types around:

- render element values
- option metadata
- grid option payloads
- response tag metadata
- normalized field config

This would reduce brittle casts in embedding apps and make future field types easier to support safely.

## Suggested Priority

1. `fetchUserResponse`
2. `parseResponse`
3. `renderResponseHtml` or `ResponseRenderer`
4. `renderHtml` modes + `initialValues`
5. URL helpers
6. React renderer package
7. encrypted response utilities
8. submit listener cleanup
9. stronger field/response types

The first three would immediately improve the current calendar implementation and remove most app-side response-display glue.
