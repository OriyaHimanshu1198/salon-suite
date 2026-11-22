# Salon Suite — Design Guidelines

**Applies to:** `public/css/site.css`, `public/css/admin.css`, `public/index.html`,
`public/admin.html`, `public/js/site.js`, `public/js/admin.js`
**Baseline:** 22 November 2026

The visual system is deliberately small: two stylesheets, a shared palette, one serif for display
and one system sans for interface text. There is no CSS framework, no preprocessor and no build
step. New work should extend the existing tokens and component classes rather than introduce a
second system.

---

## 1. Design intent

The public site should feel like a calm, editorial salon: warm paper tones, deep plum, restrained
gold, generous whitespace and serif headlines. The console should feel like a practical front-desk
tool: same palette, denser layout, smaller type and clear status colour.

Principles:

1. **Warm, not clinical.** Cream paper backgrounds and plum ink instead of white/grey defaults.
2. **Editorial hierarchy.** Serif headings, small uppercase eyebrows, quiet body copy.
3. **One accent family.** Plum is action; gold is emphasis; rose is decoration.
4. **Status colour is semantic.** Green/amber/red/blue only for states, never decoration.
5. **Soft geometry.** Rounded cards (14–26 px), thin warm borders, diffuse plum-tinted shadows.
6. **Quiet motion.** Short hover lifts and toast fades; reduced-motion is respected.

---

## 2. Colour tokens

### 2.1 Public site (`site.css`)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#1d1620` | Primary text |
| `--ink-soft` | `#3b303c` | Secondary text |
| `--muted` | `#6f6270` | Hints, metadata, descriptions |
| `--cream` | `#faf6f1` | Page background |
| `--paper` | `#fffdfa` | Cards, header, footer |
| `--plum` | `#4a2340` | Primary buttons, selected states, links/emphasis |
| `--plum-deep` | `#33162c` | Notice bar deep end, dark surfaces |
| `--gold` | `#b08a4f` | Accent, stars, eyebrows, package pips |
| `--gold-soft` | `#e6d3b3` | Notice text/links, light accents |
| `--rose` | `#e9c9c2` | Decorative dots and soft highlights |
| `--line` | `#e9dfd5` | Borders and dividers |
| `--ok` | `#2f7d5d` | Success text/icons |
| `--warn` | `#b4682a` | Warning text |
| `--bad` | `#b3352f` | Errors, closed days, destructive actions |

Derived values used directly in the stylesheet:

| Value | Use |
|---|---|
| `#241505` | Text on gold buttons |
| `#f4eee7`, `#e4d8cb` | Inactive step pills |
| `#fbf4f9` | Selected pick card tint |
| `#f7f1ea`, `#f2ece5` | Calendar day backgrounds |
| `#fcf9f5` | Wizard footer |
| `#f4ece6`, `#e0d3c7` | Basket chips |
| `#e8f3ec` | Confirmation mark background |
| `#fdf3e6` → `#f7e3e0` | Birthday band gradient |
| `#ecd7bd` | Birthday band border |
| `#eef6ef` | Package saving pill |
| `#f1f8f2`, `#cfe6d4` | Package success panel |
| `#4a2340` → `#6d3a60` | Gold notice bar gradient |
| `#33162c` → `#4a2340` | Plum notice bar gradient |

### 2.2 Admin console (`admin.css`)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#1d1620` | Primary text |
| `--ink-2` | `#3b303c` | Secondary text |
| `--muted` | `#746a76` | Hints and metadata |
| `--bg` | `#f6f2ec` | Console background |
| `--paper` | `#fffdfa` | Cards and modals |
| `--plum` | `#4a2340` | Primary actions, active nav, selected tabs |
| `--plum-2` | `#33162c` | Primary button hover |
| `--gold` | `#b08a4f` | Accent, gold buttons, chart bars |
| `--gold-soft` | `#e6d3b3` | Sidebar active tint |
| `--line` | `#e6ddd3` | Borders |
| `--ok` / `--ok-bg` | `#2f7d5d` / `#e6f2ea` | Completed, sent, success |
| `--warn` / `--warn-bg` | `#a8641f` / `#fbf0df` | Pending, queued, warnings |
| `--bad` / `--bad-bg` | `#b3352f` / `#fbe9e7` | Failed, no-show, destructive |
| `--info` / `--info-bg` | `#2f5f8a` / `#e7eff7` | Confirmed, informational |

Status badge mapping:

| Class | Background | Text | Meaning |
|---|---|---|---|
| `badge-confirmed` | `#e7eff7` | `#2f5f8a` | Confirmed appointment / online plan |
| `badge-pending` | `#fbf0df` | `#a8641f` | Pending appointment |
| `badge-arrived` | `#efe8fb` | `#6b46a8` | Client arrived |
| `badge-completed` | `#e6f2ea` | `#2f7d5d` | Completed / live / opted in |
| `badge-no_show` | `#fbe9e7` | `#b3352f` | No-show |
| `badge-cancelled` | `#eee9e4` | `#746a76` | Cancelled / hidden / opted out |
| `badge-sent` | `#e6f2ea` | `#2f7d5d` | Message sent |
| `badge-queued` | `#fbf0df` | `#a8641f` | Message queued |
| `badge-failed` | `#fbe9e7` | `#b3352f` | Message failed |

### 2.3 Colour rules

- Do **not** use `--gold` for body text; it is an accent and fails contrast at small sizes.
- Do **not** use `--bad` for decoration or emphasis; it means error/destructive.
- Primary action on a screen should normally be plum. Gold is reserved for a secondary emphasis
  action (for example "Record payment" or "Book your treat").
- Keep status colours paired with a text label, never colour alone.
- The public site is warm cream; the console is slightly greyer (`#f6f2ec`) to reduce glare on
  tablets. Do not swap them.

---

## 3. Typography

### 3.1 Families

```css
--serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
--sans:  system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
```

- **Display / headings:** serif, weight 500, tight line-height (`1.1–1.2`), slight negative
  letter-spacing on large headings.
- **Interface / body:** system sans.
- The admin serif stack omits "Book Antiqua" but is otherwise the same.

### 3.2 Public scale

| Element | Size / treatment |
|---|---|
| Body | `16px`, line-height `1.6` |
| Hero H1 | `clamp(2.6rem, 5.4vw, 4.1rem)`; italic `<em>` in plum |
| Section H2 | `clamp(1.9rem, 3.4vw, 2.7rem)` |
| Card H3/H4 | `1.1–1.16rem` |
| Eyebrow / kicker | `0.7rem`, uppercase, `0.22em` tracking, gold |
| Hero lead | `1.08rem`, muted, max `46ch` |
| Body copy | `0.82–0.9rem` in cards, muted for descriptions |
| Metadata | `0.74–0.78rem` |
| Footer headings | `0.8rem`, uppercase, `0.14em` tracking |

### 3.3 Admin scale

| Element | Size / treatment |
|---|---|
| Body | `14.5px`, line-height `1.55` |
| Page title | `1.35rem` serif |
| Card heading | `1.02rem` serif |
| KPI value | `1.7rem` serif |
| Labels | `0.75rem`, weight 600 |
| Table / hints | `0.76–0.82rem` |
| Badges | `0.68–0.72rem`, uppercase-ish pill |

### 3.4 Copy style

- British English (`colour`, `organise`, `apologise`), sentence case.
- Warm and direct: "A quiet day — or a chance to fill it." rather than system jargon.
- Currency always `£` with two decimals via `money()`; compact prices via `moneyShort()`.
- Dates use `en-GB` formatting (`Sat 22 Nov`).
- Error copy is human: "That time was just taken. Please pick another."
- Placeholders in message templates use `{{snake_case}}`; unknown placeholders remain visible so
  typos are obvious.

---

## 4. Layout and spacing

### 4.1 Public site

| Token / rule | Value |
|---|---|
| Content width | `--maxw: 1180px` |
| Gutter | `width: min(100% - 2.5rem, 1180px)` |
| Header height | `74px` |
| Section padding | `clamp(2.5rem, 6vw, 5rem)` for hero; `3–4rem` blocks |
| Card radius | `--radius: 18px` |
| Wizard radius | `26px` |
| Shadow | `0 18px 50px -28px rgba(51,22,44,.45)` |
| Grid gaps | `0.8–1.2rem` for cards; `2–4rem` for major columns |

The public page is a single scrolling document with anchor navigation:
`#services`, `#packages`, `#team`, `#reviews`, `#about`, `#book`, `#lookup`.

### 4.2 Admin console

| Token / rule | Value |
|---|---|
| Shell | `grid-template-columns: 236px 1fr` |
| Sidebar | Dark plum gradient, fixed full height |
| Top bar | Sticky, paper background, thin border |
| View padding | `1.5rem 1.6rem 3rem` |
| Card radius | `--r: 14px` |
| Card padding | `1.15rem 1.25rem` |
| Shadow | `0 16px 40px -26px rgba(51,22,44,.4)` |
| Grid | `grid-4` min 190px; `grid-3` min 260px; `grid-2` min 320px |

Spacing follows a practical 4/8 px rhythm: `0.3rem`, `0.5rem`, `0.8rem`, `1rem`, `1.2rem`,
`1.5rem`, `2rem`, `2.5rem`. Prefer these values over arbitrary pixel counts.

---

## 5. Component guidelines

### 5.1 Buttons

| Class | Appearance | Use |
|---|---|---|
| `.btn` | Plum fill, cream text, pill radius | Primary action |
| `.btn-ghost` | Transparent/paper fill, line border | Secondary action |
| `.btn-gold` | Gold fill, dark brown text | Emphasised secondary (payment, birthday CTA) |
| `.btn-danger` | White fill, red text/border | Destructive action |
| `.btn-sm` | Smaller padding/type | Toolbars and table rows |
| `.btn-xs` | Compact, admin only | Row actions |
| `.btn-block` | Full width | Login and narrow forms |

- Public buttons lift `translateY(-1px)` on hover; respect reduced motion.
- Disabled buttons reduce opacity and remove lift/shadow.
- Do not stack more than one primary button in a toolbar.

### 5.2 Cards and KPIs

- `.card` is the base surface: paper background, 1px warm border, 14–18 px radius.
- `.card-head` holds a serif heading and an optional hint/action on the right.
- `.kpi` is a compact card with an uppercase label, large serif value and small context line.
- `.grid-4` is the standard KPI row; `.grid-2` for paired panels; `.grid-3` for team cards.
- Empty states use `.empty`: centred, muted, short sentence, no illustration.

### 5.3 Forms

- `.field` stacks label, control, optional error.
- Labels are small and semibold; required fields are marked with `*` in the label text.
- Inputs use paper background, warm border, 10 px radius (public) / 9 px (admin).
- Focus ring: plum border plus a soft `rgba(74,35,64,.08)` glow.
- Errors use `--bad`; invalid inputs get `aria-invalid="true"`.
- `.form-grid` is responsive auto-fit; `.full` spans all columns.
- Checkboxes use `.check` with a label beside the box.
- Multi-select service pickers are native `<select multiple>` with a hint to Ctrl/Cmd-click.

### 5.4 Tabs

- **Public:** pill tabs; selected is plum with white text.
- **Admin:** underline tabs inside a card header; selected uses plum text and a 2 px underline.
- Tabs must set `aria-selected` and be keyboard reachable.

### 5.5 Booking wizard

| Part | Class | Notes |
|---|---|---|
| Shell | `.wizard` | Paper, 26 px radius, shadow |
| Progress | `.steps` / `.step-pill` | Five steps; active plum, done gold check |
| Body | `.wizard-body` | Min height 300px, re-rendered per step |
| Footer | `.wizard-foot` | Summary left, Back/Continue right |
| Service choice | `.svc` cards | Selected border plum, "+ Add"/"Added ✓" |
| Stylist choice | `.pick` cards | Avatar uses staff colour |
| Calendar | `.cal` / `.cal-day` | 7-column grid; selected plum; free-count pip |
| Slots | `.slots` / `.slot` | Compact time buttons; selected plum |
| Basket | `.basket` / `.chip` | Removable selected services |
| Confirmation | `.confirm-card` / `.ref` | Large reference, detail table, WhatsApp CTA |

Rules:

- Maximum four services per booking (setting-driven; the client also enforces four).
- The primary button label changes by step: Continue → Confirm booking → Book another.
- Back is hidden on step 1 and on the confirmation step.
- The summary line shows service count, duration and price; after time selection it adds date,
  time and stylist.
- Re-render by replacing the step body node, not by appending.

### 5.6 Notice bar

- Sits above the header; hidden by default.
- Two tones: `data-tone="gold"` (default, plum→mauve gradient) and `data-tone="plum"`
  (deep plum gradient).
- Gold-soft links and warm cream body text (`#f6ead8`); close button on the right.
- Dismissal is stored in `localStorage` under `notice:<message text>`, so editing the message
  makes it visible again.
- Keep messages to one short sentence plus an optional link.

### 5.7 Birthday band

- Soft peach/rose gradient panel with a cake emoji, eyebrow, H2 and one paragraph.
- Gold CTA aligned right on desktop, below on mobile.
- Only rendered when `birthday.enabled` is on and the percentage is non-zero.

### 5.8 Package cards

- `.pkg-grid` auto-fills at 250px minimum.
- Each card: emoji, saving pill, name, description, price, session dots (paid vs free), included
  services, CTA at the bottom.
- Paid sessions are outlined gold; free sessions are filled gold.
- The reservation form appears inline below the grid (`.pkg-form-card`), not in a modal.
- On success, hide the form actions and show a green success panel with the `PKG-XXXX` reference.

### 5.9 Reviews

- Three-to-four-column responsive grid of `.review` cards.
- Gold stars, quoted body, author and source/date in the footer.
- Aggregate line: stars, average to one decimal, count, "on Google".
- The section is hidden entirely when there are no visible reviews.

### 5.10 Social links

- Pill-shaped `.social-link` anchors with an emoji/icon and label.
- Empty content keys are omitted.
- Handles are converted to URLs in `site.js`; full URLs are respected for Facebook, TikTok,
  Google and YouTube.

### 5.11 Admin shell

- Dark plum sidebar with brand mark, navigation, user block and sign-out.
- Active nav item uses a translucent gold tint.
- Message count badge appears only when queued messages exist.
- Mobile: sidebar slides in via `.open`; a menu button appears in the top bar.
- Top bar holds page title, subtitle and contextual actions; it is replaced per view.

### 5.12 Tables

- Always wrap in `.table-wrap` for horizontal scrolling.
- Numeric columns use `.num` and tabular figures (`.mono` where appropriate).
- Row actions are ghost `btn-xs` buttons.
- Empty tables use a single `.empty` cell spanning all columns.
- Do not put long free text in a table without truncation or a max width.

### 5.13 Modals

- `.modal-backdrop` covers the viewport; `.modal` is paper with 14 px radius.
- `wide` variant maxes at 820px.
- Header and footer are sticky; body scrolls.
- Escape and backdrop click close.
- Footer actions align right; destructive action sits left.
- Forms inside modals use `.form-grid`.

### 5.14 Toasts

- Bottom-right stack, dark ink by default; `.toast-bad` red, `.toast-ok` plum.
- Short confirmations only ("Saved", "Package sold", "Payment recorded").
- Do not use toasts for validation that belongs beside a field.

### 5.15 Rota grid

- Horizontally scrollable table, minimum width 860px.
- Staff column with avatar; seven day columns.
- Shift blocks use the staff colour as a left accent; time and break are shown.
- Time off renders as a diagonal-striped block; pending leave is labelled.
- Conflict warnings appear in a separate card above the grid, not as blocking dialogs.

### 5.16 Charts

- The only chart is the reports bar chart: flex columns, gold gradient bars, date labels beneath.
- Bars have a minimum 2 px height so zero-value days remain visible.
- No chart library; keep it that way unless a real need appears.

---

## 6. Responsive behaviour

### 6.1 Public breakpoints

| Breakpoint | Changes |
|---|---|
| `max-width: 900px` | Hero and about become single column; hero art moves above copy; nav collapses behind the menu button; footer becomes two columns; birthday CTA loses auto margin |
| `max-width: 640px` | Form grids become one column; lookup becomes one column; tighter section spacing; package grid reduces minimum card width |
| `max-width: 380px` | Further type/spacing reductions for small phones |

### 6.2 Admin breakpoints

| Breakpoint | Changes |
|---|---|
| `max-width: 960px` | Sidebar becomes an off-canvas panel; menu button appears; grids collapse naturally via auto-fit |
| `max-width: 640px` | Top bar and view padding tighten; actions wrap; tables scroll horizontally |

### 6.3 Responsive rules

- Never set a fixed page width. Use `min()`, `clamp()` and auto-fit grids.
- Test at 375 px, 768 px and 1280 px.
- Tables may scroll horizontally; do not hide columns that carry status or money.
- Touch targets should be at least 40 px high on the public site and 32 px in the console.

---

## 7. Accessibility

Implemented patterns to preserve:

- Semantic landmarks (`header`, `nav`, `main`, `section`, `footer`).
- Visible labels for inputs; `aria-label` on icon-only buttons.
- `aria-pressed` on service/stylist/slot choices.
- `aria-selected` on tabs and calendar days.
- `aria-expanded` on the mobile menu button.
- `role="dialog"` and `aria-modal="true"` on modals.
- Escape closes modals; backdrop click closes.
- Focus-visible outlines on interactive elements.
- `prefers-reduced-motion` disables floating-card animation.
- `.sr-only` utility for visually hidden text.
- Status is always expressed with text as well as colour.

When adding components:

- Keep a logical heading order; do not skip from H2 to H4.
- Do not remove focus outlines without providing an equivalent.
- Do not use colour alone to indicate selection or status.
- Give icon buttons an accessible name.
- Keep form errors associated with their field.

---

## 8. Motion

- Hover lifts are 1–2 px and short.
- Floating hero cards use a slow vertical drift; disabled under reduced motion.
- Toasts fade/slide in and out over ~0.2–0.5 s.
- No parallax, scroll-jacking or long entrance animations.
- New motion must have a reduced-motion fallback.

---

## 9. Do and do not

**Do**

- Reuse existing tokens and classes.
- Keep public pages warm and spacious; keep admin pages dense and scannable.
- Use serif for headings and numerals that deserve emphasis (prices, KPIs, references).
- Use plum for the main action and gold for a single accent.
- Keep copy short, human and British.
- Add responsive behaviour with auto-fit grids and `clamp()`.
- Preserve the no-build-step architecture.

**Do not**

- Add Tailwind, Bootstrap, a component library, or a bundler.
- Introduce new brand colours without updating both token sets and this document.
- Use emoji as the only label for a control.
- Put a modal inside another modal.
- Use red for non-error emphasis.
- Hard-code a salon name, price, or timezone in the UI; read it from the API payload.
- Change the booking wizard's five-step structure without updating `WORKFLOW.md`.

---

## 10. Consistency checklist for new UI

- [ ] Uses existing colour tokens, not raw hex values (except documented derivatives).
- [ ] Heading uses serif; interface text uses sans.
- [ ] Primary action is plum; only one primary per region.
- [ ] Spacing follows the 4/8 px rhythm.
- [ ] Works at 375 px and 1280 px.
- [ ] Keyboard reachable; focus visible.
- [ ] Inputs have labels; icon buttons have `aria-label`.
- [ ] Status uses both colour and text.
- [ ] Empty, loading and error states are present.
- [ ] Money formatted via `money()`/`moneyShort()`; dates via `en-GB`.
- [ ] No new dependency or build step.
- [ ] Design tokens and this document updated if something new is introduced.
