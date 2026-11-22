# 02 Design Guidelines
Preserve colours, layouts and branding.

## Visual Identity (from `public/css/site.css`)

### Colour Palette (CSS Custom Properties)
```css
:root {
  --ink: #1d1620;
  --ink-soft: #3b303c;
  --muted: #6f6270;
  --cream: #faf6f1;
  --paper: #fffdfa;
  --plum: #4a2340;
  --plum-deep: #33162c;
  --gold: #b08a4f;
  --gold-soft: #e6d3b3;
  --rose: #e9c9c2;
  --line: #e9dfd5;
  --ok: #2f7d5d;
  --warn: #b4682a;
  --bad: #b3352f;
}
```

### Typography
- **Headings (`h1–h4`):** `--serif`: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif.
- **Body/UI:** `--sans`: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif.
- **Base size:** 16px, line-height 1.6.

### Spacing & Layout
- **Max width:** `--maxw: 1180px`.
- **Container:** `.wrap { width: min(100% - 2.5rem, var(--maxw)); margin-inline: auto; }`
- **Border radius:** `--radius: 18px` (cards, buttons, inputs).
- **Shadow:** `--shadow: 0 18px 50px -28px rgba(51, 22, 44, .45)` (hero panel, cards, modals).
- **Breakpoints:** 900px (tablet), 640px (mobile), 380px (small mobile).
- **Fluid sizing:** `clamp()` for padding, font sizes, hero height.

### Core Components
| Component | Variants | Key Classes |
|-----------|----------|-------------|
| Buttons | Primary, Ghost, Gold, Danger, Sm, Block | `.btn`, `.btn-ghost`, `.btn-gold`, `.btn-danger`, `.btn-sm`, `.btn-block` |
| Cards | Service, Staff, Package, Review, Offer | `.svc`, `.member`, `.pkg-card`, `.review`, `.offer` |
| Form Fields | Input, Select, Textarea, Checkbox | `.field`, `.field input`, `.check` |
| Calendar | Month grid, Day cells | `.cal`, `.cal-day`, `.cal-nav` |
| Slot Picker | Time buttons | `.slots`, `.slot` |
| Notice Bar | Gold, Plum tones | `.notice-bar[data-tone="gold|plum"]` |
| Birthday Band | Gradient banner | `.birthday-band`, `.birthday-inner` |
| Toast | Ok, Bad | `.toast`, `.toast-ok`, `.toast-bad` |

### Brand Mark
- **SVG Icon:** "L" in plum/gold gradient circle (used in favicon, header, footer, login).
- **Brand Name:** "Lumière" (serif) + "Hair & Beauty" (sans, uppercase, letter-spaced).

### Rules for New Modules
1. **Use existing CSS variables** — never hardcode colours.
2. **Reuse component classes** — extend `.svc`, `.member`, `.pkg-card` patterns for new card types.
3. **Follow spacing scale** — use `--radius`, `--maxw`, `.wrap`, clamp() fluid padding.
4. **Mobile-first** — test at 380px, 640px, 900px breakpoints.
5. **Accessibility** — `prefers-reduced-motion` respected (float animation disabled), semantic HTML, focus states on all interactive elements.
6. **No new frameworks** — vanilla CSS + ES modules only.

### Admin Console (`public/css/admin.css`)
- **Sidebar:** Fixed left, dark plum background, white/gold text.
- **Topbar:** Sticky, cream background, page title + actions.
- **Views:** Hash-router (`#/dashboard`, `#/calendar`, etc.), each a render function.
- **Tables:** Striped, hover highlight, responsive scroll on mobile.
- **Modals:** Centered, backdrop blur, `.modal` + `.modal-content`.
- **Form Layout:** `.field-grid` (2-col), `.field-full` for wide fields.