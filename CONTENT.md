# Editing the site

The site's words and photos live in one file — `content/site.json` — and are
edited through a page, not by hand.

```
content/site.json   all the copy, both languages, the photos, the settings
site/index.html     the site (built — do not edit by hand)
site/edit.html      the editor
site/app.js         the site's runtime: fills the page in from site.json
site/editor.js      the editor's runtime
tools/              the build and the local dev server
worker/             the publish endpoint (Cloudflare Worker)
project/            the original design prototype — the reference, not the site
```

## Running it locally

```
node tools/dev-server.js          # http://127.0.0.1:8139
```

- site — <http://127.0.0.1:8139/site/index.html>
- editor — <http://127.0.0.1:8139/site/edit.html>

Locally the publish password is `dev` (set `EINAV_PUBLISH_PW` to change it), and
publishing writes straight to `content/site.json` on disk instead of committing.
That is the whole point of it: the editor can be driven end to end without
deploying anything or handing anyone a GitHub token.

## How the editor behaves

- **Hebrew and English are independent.** Changing one never requires touching
  the other. Missing English is flagged, never blocked — the site falls back to
  Hebrew, so a half-translated page is a valid state.
- **Language switching is a setting.** Turn it off and the published site drops
  the EN button entirely and is Hebrew only. English already written is kept,
  waiting.
- **Lists can grow.** Services, certificates, session steps, dogs, testimonials,
  the audience strip and the form's topic dropdown are all add/remove/reorder.
  The site numbers and styles them by position, so a fourth dog needs no code.
- **Photos are swapped in the editor.** Pick a file, see it in the preview
  immediately; the bytes are only uploaded when she publishes.
- **Nothing is destructive until Publish.** Edits are kept in the browser as a
  draft, so a closed tab loses nothing, and "ביטול שינויים" throws the draft
  away and goes back to what is live.
- **Placeholders are a checklist.** Anything still in `[ brackets ]` is flagged
  "ממתין לתוכן", and each section counts how many it has left.

## Why the site can't break from an edit

`site/index.html` is built with the Hebrew already in it. `site.json` is an
override layer, applied key by key. If the file fails to load, or a key is
missing, or the JSON is malformed, the page renders the copy it was built with.
There is no edit that produces a blank page.

Rebuild the page after changing the design prototype:

```
node tools/build-site.js
```

`tools/keymap.js` is the single table saying which line of the prototype each
key comes from. Both the build and the content extractor read it, and both
refuse to run if the prototype no longer matches — so a moved line is a loud
error, not a silently mis-filed string.

## Publishing for real

GitHub Pages serves bytes and accepts no writes, so something has to commit to
the repo. That is `worker/publish.js`: a Cloudflare Worker holding the GitHub
token as a secret. Einav needs a password and nothing else — no GitHub account,
no token in her browser, nothing to leak from the editor page.

Setup is in the comment at the top of `worker/publish.js`. In short:

```
npm i -g wrangler && wrangler login
cd worker && wrangler deploy
wrangler secret put GITHUB_TOKEN        # fine-grained PAT, THIS repo only,
                                        # Contents: Read and write, nothing else
wrangler secret put PUBLISH_PASSWORD    # what you give Einav
wrangler secret put ALLOWED_ORIGIN      # https://maayancreate.github.io
```

Then point the editor at it, in `site/edit.html` above the `editor.js` tag:

```html
<script>window.PUBLISH_ENDPOINT = 'https://einav-publish.<you>.workers.dev';</script>
```

Every publish is an ordinary git commit, so the history is diffable and any
change can be reverted. Pages rebuilds in about a minute — the editor says so
rather than pretending it is instant.

**If you would rather not deploy anything:** the editor's "⭳ הורדת קובץ" button
downloads `site.json`. Commit it yourself and skip the Worker entirely. Einav
still gets the editor and the preview; only the Publish button needs the Worker.
