# FCPSports.org Full Redesign — Design Document
**Date:** 2026-03-14
**Status:** Approved
**Scope:** Complete rebuild of FCPSports.org as a Hugo static site on Netlify, optimized for local SEO dominance across the Emerald Coast basketball market.

---

## Context

The existing FCPSports.org WordPress/GoDaddy site is down (Cloudflare 526 SSL error). A temporary Jekyll site was built and deployed to `fcpsports.netlify.app`. This plan replaces that with a full Hugo + Tailwind CSS rebuild targeting 38 pages, GHL lead capture, and comprehensive local SEO.

The business is transitioning from "Spartan Training Center" to "FCP Sports." Services are live now. GBP name change is in progress.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Static site generator | **Hugo** | ~100ms builds, content archetypes for location/service pages, built-in taxonomies for blog |
| CSS framework | **Tailwind CSS** via Hugo Pipes | Utility-first, PostCSS purge, no custom CSS file needed |
| Hosting | **Netlify** | Already configured, CI/CD from GitHub push |
| DNS / SSL | **Cloudflare** | Full mode (not strict), proxied CNAME to Netlify |
| CRM / Forms | **GoHighLevel** | All forms, chat widget, nurture sequences, email delivery |
| Analytics | **Google Analytics 4** | GA4 tag in head via Hugo partial |
| Video | `fcp sports.mp4` (19MB local) | Hero background, autoplay muted loop |
| Fonts | Bebas Neue + DM Sans | Google Fonts, preconnect in head |

---

## Design System

### Colors
```
--navy:  #0a1628   (primary background, header, footer)
--gold:  #f5a623   (CTAs, highlights, accents)
--white: #ffffff   (text on dark, card backgrounds)
--gray:  #f8f9fa   (section alternating background)
--dark:  #060e1a   (hero overlay)
```

### Typography
- **Headings:** Bebas Neue — all caps, tracking-wide
- **Body:** DM Sans — 400/500/600 weights
- **Scale:** Tailwind's default type scale + fluid `clamp()` for H1

### Buttons
```
btn-primary:  bg-gold text-navy font-bold px-8 py-4 rounded hover:brightness-110
btn-outline:  border-2 border-white text-white px-8 py-4 rounded hover:bg-white hover:text-navy
btn-dark:     bg-navy text-white px-8 py-4 rounded hover:bg-navy-800
```

### Component Patterns
- **Cards:** white bg, subtle shadow, rounded-xl, hover:shadow-lg transition
- **Section alternating:** white → gray-50 → navy (dark) → repeat
- **FAQ blocks:** `<details>/<summary>` with Tailwind, FAQPage schema
- **GHL form embed:** `<iframe>` from `api.leadconnectorhq.com`, responsive wrapper

---

## Site Architecture (38 pages)

```
/                                    Homepage
/about/                              About FCP Sports
/coaches/                            Coaching staff
/pricing/                            All program pricing
/registration/                       GHL registration form page
/contact/                            Contact + map
/blog/                               Blog index
/blog/[slug]/                        4 starter posts

SERVICES (under /services/)
/services/basketball-camp/
/services/basketball-training/
/services/basketball-lessons/
/services/basketball-league/
/services/open-gym/
/services/gym-rental/
/services/summer-aau/               $6,799 AAU program
/services/youth-basketball/          Little Ballers / Junior / Elite tiers

YOUTH PROGRAMS (under /youth/)
/youth/elementary-school-basketball/
/youth/middle-school-basketball/
/youth/high-school-basketball/       Recruiting prep, NCAA eligibility

LOCATIONS (under /locations/)
/locations/fort-walton-beach/        PRIMARY — full address, map, hours
/locations/destin/
/locations/niceville/
/locations/navarre/
/locations/crestview/
/locations/pensacola/
/locations/panama-city/

FREE GUIDES — gated lead magnets (under /guides/)
/guides/youth-basketball-parents-guide/
/guides/how-to-choose-a-basketball-camp/
/guides/aau-basketball-101/
/guides/college-recruiting-roadmap/
/guides/thank-you/                   Post-submit redirect + download

INSTRUCTIONAL — AI/ChatGPT visibility (under /learn/)
/learn/what-is-aau-basketball/
/learn/basketball-positions-guide/
/learn/how-to-improve-basketball-skills/

/404/
```

---

## Hugo Content Architecture

### Content Types (archetypes)
```
archetypes/
  default.md
  services.md       → title, description, price, schema_type, target_keywords, faq[]
  locations.md      → city, county, schools[], drive_time, coordinates, area_served[]
  guides.md         → title, ghl_form_id, guide_description, benefits[]
  posts.md          → title, date, tags, categories, description
```

### Data Files (`data/`)
```
data/
  schools.yaml      → schools by city with grade range
  testimonials.yaml → name, city, program, quote, rating
  coaches.yaml      → name, title, bio, image, credentials
  pricing.yaml      → program name, price, frequency, features[]
  faqs.yaml         → per-page FAQ bank
  programs.yaml     → service cards data
```

### Layouts
```
layouts/
  _default/
    baseof.html       → HTML shell, head partial, nav, footer, scripts
    single.html       → default single page
    list.html         → blog list
  partials/
    head.html         → meta, OG, schema, GA4, fonts, Tailwind
    nav.html          → responsive nav with mobile hamburger
    footer.html       → contact, social links, Instagram embed, legal
    ghl-form.html     → reusable GHL iframe embed shortcode
    faq-block.html    → FAQ section with FAQPage schema
    cta-section.html  → reusable CTA banner
    exit-popup.html   → exit intent modal
    schema/
      local-business.html
      service.html
      faqpage.html
      breadcrumb.html
  services/
    single.html       → service page template
  locations/
    single.html       → location page template (map, schools, nearby)
  guides/
    single.html       → gated guide template with GHL form
  youth/
    single.html       → youth program template
```

---

## SEO Architecture

### Per-Page SEO (every page)
- Unique `<title>` format: `[Service] in [City] | FCP Sports`
- Unique `<meta description>` 150-160 chars with target keyword
- H1 contains primary keyword (set in front matter)
- H2/H3 hierarchy with secondary keywords
- Internal links: minimum 3 per page to related pages
- Canonical URL
- Open Graph + Twitter Card meta

### Schema Markup
| Page Type | Schema |
|---|---|
| Homepage | `SportsOrganization`, `LocalBusiness`, `WebSite` |
| Service pages | `Service`, `FAQPage`, `BreadcrumbList` |
| Location pages | `LocalBusiness` with `areaServed`, `FAQPage` |
| Guide pages | `FAQPage`, `Article` |
| Blog posts | `BlogPosting`, `BreadcrumbList` |
| Instructional | `Article`, `FAQPage`, `HowTo` |
| All pages | `BreadcrumbList` |

### Target Keywords by Section
```
Homepage:          basketball training fort walton beach, basketball gym florida panhandle
/basketball-camp/: basketball camp fort walton beach, basketball camp near me
/basketball-training/: basketball training near me, basketball workouts florida
/basketball-lessons/: basketball lessons fort walton beach, private basketball coach
/basketball-league/: basketball league fort walton beach, youth basketball league florida
/open-gym/:        open gym basketball fort walton beach, drop in basketball near me
/gym-rental/:      basketball gym rental fort walton beach, gym rental emerald coast
/summer-aau/:      AAU basketball florida, summer basketball program emerald coast
/youth-basketball/: youth basketball fort walton beach, little league basketball florida
/elementary-*/:    elementary school basketball, basketball for kids fort walton beach
/middle-school-*/: middle school basketball training, basketball for 6th graders
/high-school-*/:   high school basketball recruiting, AAU basketball florida
/locations/destin/: basketball training destin fl, basketball camp destin
[etc per city]
```

### EEAT Signals
- Coach bios with credentials, years of experience, certifications
- Testimonials with full name, city, child's age/program
- Partnership mentions (AAU affiliation, school partnerships)
- Clear contact info on every page (NAP consistency)
- Author bio on blog posts
- Trust badges: years in operation, athletes trained, tournament wins

### AI / ChatGPT Visibility
- FAQ blocks answer natural language questions exactly as typed into ChatGPT
- Instructional pages structured as definitive guides
- Schema `speakable` property on key content blocks
- `How-To` schema on instructional pages

---

## GHL Integration

### Forms
| Form | GHL Form ID | Page | Tag Applied |
|---|---|---|---|
| General inquiry | `41vI0yGp6HJG0JBllaVt` (existing) | Homepage, Contact | `general-inquiry` |
| Registration | [new form] | /registration/ | `registration-intent` |
| Exit intent | [new form] | Global popup | `exit-intent-lead` |
| Guide gating | [new form per guide] | Each guide page | `guide-[name]` |
| Gym rental | [new form] | /gym-rental/ | `rental-inquiry` |

### Chat Widget
- Widget ID: `jBDUi7Sma6tCl3eXKBmX`
- Deferred load: fires after 3 seconds via `setTimeout`
- Suppressed on `/guides/thank-you/`

### Nurture Sequences (to be built in GHL)
1. **Guide nurture** — 5-email sequence after guide download (welcome → tip 1 → tip 2 → program CTA → registration CTA)
2. **Exit intent nurture** — 3-email sequence (guide delivery → follow-up → camp CTA)
3. **Registration inquiry** — immediate confirmation + staff notification

---

## Exit Intent Popup

### Trigger Logic
```js
// Desktop: mouseleave toward top of viewport
document.addEventListener('mouseleave', (e) => {
  if (e.clientY < 20 && !sessionStorage.getItem('exitShown')) {
    showExitPopup();
  }
});
// Mobile: 40-second timer fallback
setTimeout(() => {
  if (!sessionStorage.getItem('exitShown')) showExitPopup();
}, 40000);
```

### Rules
- Fires once per session (`sessionStorage.setItem('exitShown', true)`)
- Suppressed on `/guides/` paths and `/guides/thank-you/`
- 3-second page-load delay before eligible to fire
- Close on: X button, overlay click, Escape key

### Content
- Headline: "WAIT — Don't Leave Empty-Handed!"
- Subhead: "Grab the FREE Youth Basketball Parent's Guide"
- 3 bullet benefits
- Single email field → GHL form → redirect to `/guides/thank-you/`

---

## Homepage Sections (in order)

1. **Hero** — `fcp sports.mp4` video background, dark overlay, Bebas Neue headline, 2 CTAs
2. **Stats bar** — athletes trained, years operating, tournament wins, programs offered
3. **Programs grid** — 8 service cards with icons, title, description, "Learn More" links
4. **Youth tier explainer** — Little Ballers / Junior / Elite with age ranges, school mentions
5. **About / EEAT** — facility photo, coaching credentials, mission, trust signals
6. **Testimonials** — 3 cards with name/city/program
7. **Location map teaser** — "We serve the entire Emerald Coast" with city links
8. **Free guide CTA** — "Get the Parent's Guide" section → GHL form embed
9. **Blog teaser** — 3 latest posts
10. **Final CTA** — "Ready to Start?" with registration link

---

## Navigation

```
Logo | Home | Services ▾ | Youth Programs ▾ | Locations ▾ | Blog | About | Pricing | Register
```
- Mobile: hamburger → full-screen slide-down
- Sticky on scroll with shadow
- "Register" in gold button style

---

## Footer

- Column 1: Logo, tagline, social icons (Instagram, Facebook, Twitter/X)
- Column 2: Services links
- Column 3: Locations links
- Column 4: Contact info (NAP), hours
- Instagram embed (Behold.so or Elfsight widget)
- Bottom bar: © FCP Sports | Privacy Policy | Terms | Sitemap

---

## Assets

| File | Usage |
|---|---|
| `/Users/fcp/Documents/FCP Sports/fcp sports.mp4` | Hero video background |
| `/Users/fcp/Documents/FCP Sports/unnamed.jpg` | About section / coaches |
| `/Users/fcp/Documents/FCP Sports/unnamed (1).jpg` | Program section / gallery |

All images renamed with SEO-optimized filenames on copy:
- `fcp-sports-basketball-training-fort-walton-beach.jpg`
- `fcp-sports-youth-basketball-program-florida.jpg`

---

## Schools Data (for location pages + youth pages)

### Okaloosa County — Elementary
Annette P. Edwins Elementary, Liza Jackson Preparatory, Destin Elementary, James E. Plew Elementary, Lula J. Edge Elementary, Bluewater Elementary, Antioch Elementary, Bob Sikes Elementary, Florosa Elementary, Eglin Elementary

### Okaloosa County — Middle
W.C. Pryor Middle (FWB), Destin Middle, C.W. Ruckel Middle (Niceville), Davidson Middle (Crestview), Shoal River Middle (Crestview), Clifford Meigs Middle (Shalimar), Max Bruner Jr. Middle, Okaloosa STEMM Center, Addie R. Lewis School

### Santa Rosa County (Navarre)
Holley-Navarre Middle, West Navarre Intermediate, Holley-Navarre Primary/Intermediate

### Escambia County (Pensacola) — Middle
Bellview Middle, Beulah Middle, Brown-Barge Middle, Ferry Pass Middle, Jim C. Bailey Middle, J.H. Workman Middle, Ransom Middle

### Bay County (Panama City) — Middle
Jinks Middle, Merritt Brown Middle, Deane Bozeman Middle

---

## Deployment & DNS

- **GitHub repo:** `CoachD23/fcpsports-site` (existing)
- **Netlify project:** `fcpsports` → `fcpsports.netlify.app`
- **Custom domain:** `fcpsports.org` + `www.fcpsports.org`
- **Cloudflare SSL:** Full mode (not Full Strict)
- **Cloudflare DNS:** CNAME `fcpsports.org` → `fcpsports.netlify.app` (proxied)
- **MX records:** Untouched (Microsoft 365 email)

---

## Success Criteria

- All 38 pages live and indexed
- Google Search Console verified
- GBP linked to website
- GHL forms capturing leads on all key pages
- Exit intent popup live
- Core Web Vitals: LCP < 2.5s, CLS < 0.1, FID < 100ms
- Site ranks page 1 for "basketball camp fort walton beach" within 90 days
