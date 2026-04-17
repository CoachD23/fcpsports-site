# FCP Sports Design System — Master

**Single source of truth for every color, font, spacing value, and component pattern used on fcpsports.org.**

Before adding a new page or component, check this document. If you need a value that's not here, add it here first, then use the token — never inline a raw hex or pixel value.

Page-specific overrides live in `design-system/pages/<page-name>.md`.

---

## 1. Color Tokens

All colors live in `tailwind.config.js` under `theme.extend.colors`. **Never use raw hex in templates.** Reference by Tailwind class (e.g., `bg-navy`, `text-gold`).

| Token | Hex | Tailwind Class | Use For |
|-------|-----|----------------|---------|
| `navy.DEFAULT` | `#0a1628` | `bg-navy`, `text-navy` | Primary dark surfaces, body text on light |
| `navy.800` | `#0d1f3c` | `bg-navy-800` | Secondary dark surface, dark footers |
| `navy.900` | `#060e1a` | `bg-navy-900` | Darkest navy (rarely used) |
| `navy.deep` | `#060f22` | `bg-navy-deep` | Deep hero backgrounds (Train/Compete hubs, stat bars) |
| `gold.DEFAULT` | `#f5a623` | `bg-gold`, `text-gold` | CTAs, accent, primary interactive |
| `gold.light` | `#f7b84a` | `bg-gold-light` | Hover/lighter accent |
| `gold.dark` | `#d4911e` | `bg-gold-dark` | Darker accent, links on hover |

**Anti-patterns — don't:**
- Use `style="background:#0a0d14;"` — that hex isn't in the token system. Use `bg-navy-deep`.
- Use `style="background:#060f22;"` inline — use `bg-navy-deep` class.

---

## 2. Typography

Three font families. Each has one purpose.

| Token | Font | Tailwind Class | Use For |
|-------|------|----------------|---------|
| Display | Bebas Neue | `font-display` | Page titles, section headings, nav labels, program names |
| Body | DM Sans (400/500/600/700) | `font-body` | All paragraph and UI text |
| Hero | Oswald italic (600/700) | `font-hero` | Homepage hero H1 **only** |

### Type Scale

Use consistent sizes — don't improvise.

| Semantic Role | Tailwind |
|---------------|----------|
| Hero H1 | `text-5xl sm:text-6xl md:text-7xl` |
| Section heading H2 | `text-4xl md:text-5xl` |
| Card heading H3 | `text-2xl` |
| Body | `text-base` (16px) |
| Small body / metadata | `text-sm` |
| Label / eyebrow | `text-xs uppercase tracking-widest` |

### Section header pair (canonical pattern)

```html
<span class="section-tag">Our Programs</span>
<h2 class="section-heading">Heading Text</h2>
```

`.section-tag` = gold uppercase label. `.section-heading` = large navy display heading.

---

## 3. Spacing Scale

Only use Tailwind's 4pt grid. **No raw `px` values in inline styles for layout gaps.**

| Use | Class |
|-----|-------|
| Compact section | `py-12` |
| Standard section | `py-16` |
| Hero section | `py-20` or `min-h-[60vh]` |
| Card padding | `p-6` (small card), `p-8` (standard card) |
| Gap between cards | `gap-4` (tight), `gap-6` (standard) |

---

## 4. Components

### 4.1 Buttons

**Always use the utility class, never inline.**

| Class | Use |
|-------|-----|
| `.btn-primary` | Gold background, navy text — primary CTAs |
| `.btn-outline` | Transparent with border — secondary |
| `.btn-dark` | Navy bg, gold text — on light surfaces |

**Minimum sizing:** all buttons ≥ 44px tall (`py-3` + `text-sm` = 38px — use `py-4` instead).

**Anti-pattern:** Do NOT manually re-implement `.btn-primary` with raw classes like `bg-gold text-navy font-bold px-6 py-3 rounded-lg`. That omits the hover transition and breaks consistency.

### 4.2 Pill / Badge

```html
<span class="pill-neutral">Label</span>  <!-- white/10 bg, white/80 text -->
<span class="pill-gold">Label</span>     <!-- gold/15 bg, gold text -->
```

Use for program category labels, status badges, age-range indicators.

### 4.3 Cards

- Base: `bg-white/5 border border-white/10 rounded-2xl` on dark surfaces
- Base: `bg-white border-2 border-gray-100 rounded-2xl` on light surfaces
- Hover: `hover:border-gold/50` (dark) or `hover:border-gold` (light)
- Padding: `p-6` or `p-8`

### 4.4 Section Header Pattern

```html
<span class="section-tag">Eyebrow</span>
<h2 class="section-heading">Heading</h2>
<!-- or for dark backgrounds -->
<h2 class="section-heading--white">Heading</h2>
```

---

## 5. Icons

All icons are inline SVG. Use stroke-based icons (no fill) except for check marks and fill-emphasis icons.

### Stroke width rules

| Icon type | Stroke width | Size |
|-----------|-------------|------|
| UI icons (arrows, chevrons, utility) | `2` | `w-4 h-4` or `w-5 h-5` |
| Emphasis icons (checkmarks in feature lists) | `3` or `fill-current` | `w-4 h-4` |

**Rule:** Pick ONE stroke width per visual layer. Do not mix 2, 2.5, and 3 on the same page.

**Anti-patterns:**
- Never use emojis (🏀 🏆) as structural icons. Use Heroicons / Lucide SVGs.
- Never mix filled and outlined variants of the same icon on the same page.

---

## 6. Elevation / Shadows

| Use | Class |
|-----|-------|
| Card (subtle) | `shadow-sm` |
| Raised card | `shadow-md` |
| Modal / popover | `shadow-xl` |
| Hero / special emphasis | `shadow-2xl` |

Avoid arbitrary `shadow-[0_2px_4px_rgba(0,0,0,0.1)]` values.

---

## 7. Motion

| Use | Duration | Easing |
|-----|----------|--------|
| Micro-interaction (hover, focus) | `duration-200` | `transition-colors` or `transition-all` |
| Card hover lift | `duration-300` | `ease-out` |
| Modal open | `duration-300` | `ease-out` |

**Respect `prefers-reduced-motion`** — any decorative animation must be gated behind a motion check.

---

## 8. Surface Backgrounds (named zones)

| Zone | Background | Text color |
|------|-----------|-----------|
| Light content | `bg-white` or `bg-gray-50` | `text-navy` / `text-gray-600` |
| Dark primary | `bg-navy` | `text-white` / `text-white/70` |
| Dark deep | `bg-navy-deep` | `text-white` / `text-white/70` |
| Gold accent (sparingly) | `bg-gold` | `text-navy` |

---

## 9. Accessibility Baselines

- **Contrast:** all body text ≥ 4.5:1, large text ≥ 3:1
- **Touch targets:** ≥ 44×44px on mobile (hero buttons `py-4`, not `py-3`)
- **Focus rings:** always visible — never `outline:none` without a replacement
- **Labels:** every input has a visible or `sr-only` `<label for="">`
- **Color not alone:** status/state must be communicated with text + color, not color only
- **Reduced motion:** respect `prefers-reduced-motion: reduce`

---

## 10. Page Overrides

When a page needs to deviate from this master document, create `design-system/pages/<page-name>.md` and document the override. Examples:

- `design-system/pages/homepage.md` — hero-specific rules (text-shadow outline, Oswald font-hero)
- `design-system/pages/register.md` — form-specific rules (input styles, step indicator)

---

*Last updated: 2026-04-16. Owner: FCP Sports. Update this file before using a new token.*
