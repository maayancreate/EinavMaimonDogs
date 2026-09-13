# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A **design handoff bundle** exported from Claude Design (claude.ai/design) — not an application. There is no package manager, build step, test suite, linter, or dependency manifest anywhere in the tree. The only "code" is prototype markup plus a vendored runtime that renders it.

The subject is a Hebrew (RTL) landing page for **עינב מימון — כלבנות טיפולית ואילוף** (Einav Maimon, therapy-dog handling and dog training).

`README.md` at the root is the handoff instruction sheet written for coding agents. Note that its paths are prefixed `untitled/` (e.g. `untitled/project/...`); in this checkout that prefix does not exist — files live under `project/`.

## Layout

- `project/קונספט דף נחיתה - עינב מימון.dc.html` — **the primary design.** The full landing page: splash, header, hero, marquee, services, about + certifications, session walkthrough, dogs, testimonials/pricing, contact form, logo showcase, footer.
- `project/לוגו ואנימציית כניסה.dc.html` — logo exploration: three intro-animation directions (paw / monogram / collar-and-tag), then paw variants (solid, outline, face, etc.).
- `project/support.js` — the vendored Claude Design runtime (~69 KB). Treat as read-only vendor code; never edit it and never port it into the implementation.
- `project/uploads/` — photos referenced by the prototypes via relative `uploads/...` paths.
- `project/design_handoff_einav_landing/` — a **duplicate** of both `.dc.html` files (byte-identical) and of `uploads/`, plus `logo.svg` which exists only there. Edit the copies under `project/` directly; the nested folder is an export artifact.

## Reading the `.dc.html` format

Each file is a standalone page: `<script src="./support.js">` in the head, prototype markup inside `<x-dc>`, and a `<script type="text/x-dc" data-dc-script>` block at the bottom holding `class Component extends DCLogic`. The runtime custom-element syntax that appears in the markup:

- `{{ expr }}` — binds to a key returned from `renderVals()` in the logic class (values, labels, and event handlers alike, e.g. `onClick="{{ toggleLang }}"`).
- `<sc-if value="{{ flag }}" hint-placeholder-val="{{ false }}">` — conditional block; the hint attribute is only a static-preview default.
- `style-hover="..."` / `style-focus="..."` — pseudo-state styles, since everything is inline `style`. These must become real `:hover` / `:focus` rules when implemented.
- `data-t` / `data-en` — Hebrew and English text for the same node. The runtime's `applyLang()` swaps `textContent` between them and flips the wrapper's `dir` between `rtl` and `ltr`.

All styling is inline `style` attributes plus one `<style>` block of `@keyframes` inside `<helmet>`. That structure is an artifact of the design tool — recreate the *visual output*, not this structure.

## Design system (extracted from the prototypes — keep these exact)

| Token | Value | Used for |
| --- | --- | --- |
| Ink / navy | `#16324F` | Body text, dark sections, footer, primary button |
| Cream | `#FBF6EE` | Page background, text on dark |
| Coral | `#E4572E` | Accent, eyebrow labels, CTA button, the fourth toe |
| Amber | `#F2A03D` | Logo fill, stat cards, highlight panels |
| Green | `#4C9A6B` | Status dot, pulse ring |
| Body slate | `#4A5C6F` | Paragraph text |
| Muted brown | `#8A7A66` / `#7C6A55` | Captions, metadata |

- Fonts: **Heebo** (400/500/700/900) for UI and headings; **Alef** (400/700) for body paragraphs. Both from Google Fonts.
- Headings are `font-weight:900` with `letter-spacing:-.03em`; sizes use `clamp()` throughout. Section padding is `clamp(48px,7vw,96px) 20px` inside a `max-width:1140px` centred container.
- Radii: cards `24px`, images `22–28px`, buttons/pills `99px`.
- Grids are `repeat(auto-fit,minmax(min(100%,NNNpx),1fr))` — no media queries for layout.
- `@media (prefers-reduced-motion: reduce)` disables animation; preserve this.

## Behaviours worth preserving

- **Splash/intro** — full-screen navy curtain with the paw popping in toe by toe, ~2.4 s total, then `curtainUp`. Shown **only on first visit** (`localStorage` key `einav_intro_v1`) and skipped entirely under reduced motion. A footer button replays it.
- **Logo meaning** — the paw has four toes: three are the dog, the fourth (coral, `cx=39.5`) is the person sitting opposite. It is the only differently-coloured toe and lands **last** in the intro animation. This is explained on the page itself; don't break the colour or the timing.
- **Language toggle** — Hebrew default, RTL. Toggling to English also switches `dir` to `ltr`.
- **Scroll reveal** — `[data-reveal]` elements fade/rise via `IntersectionObserver`, with a 4 s fallback timer that force-shows everything.
- **Contact form** — deliberately inert in the concept; the copy says so. Submitting only flips a label.

## Placeholder content

Square-bracket text (`[ שם ]`, `[ שנה ]`, `[ מקום להמלצה … ]`), the phone number `05X‑XXX‑XXXX`, the three dog cards, testimonials, and the whole pricing/service-area card are **intentional placeholders** awaiting real content from Einav. The certificate links (`href="#"`) are meant to point at scans of real certificates. Keep them as placeholders unless given real values.

## Working here

- Hebrew is the source language. Filenames, copy, and paths contain Hebrew — quote paths in shell commands, and keep RTL text intact when editing.
- Per the handoff README: **do not open these files in a browser or screenshot them unless asked.** Dimensions, colours and layout rules are all explicit in the source.
- No implementation target has been chosen yet. Before scaffolding a framework, ask — the bundle deliberately leaves the technology open.
