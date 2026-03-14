# FCPSports.org Hugo Rebuild — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild FCPSports.org as a 38-page Hugo + Tailwind CSS static site optimized for local SEO dominance across the Emerald Coast basketball market, with full GHL lead capture integration.

**Architecture:** Hugo static site generator with Tailwind CSS via Hugo Pipes/PostCSS. Content managed via Markdown front matter + YAML data files. All forms via GoHighLevel iframe embeds. Deployed to Netlify with Cloudflare DNS proxying.

**Tech Stack:** Hugo 0.124+, Tailwind CSS 3.x, PostCSS, Autoprefixer, GoHighLevel, Google Analytics 4, Netlify, Cloudflare, GitHub

**Working directory:** `/Users/fcp/fcpsports/`
**Video asset:** `/Users/fcp/Documents/FCP Sports/fcp sports.mp4`
**Images:** `/Users/fcp/Documents/FCP Sports/unnamed.jpg` + `unnamed (1).jpg`
**GHL Chat Widget ID:** `jBDUi7Sma6tCl3eXKBmX`
**GHL Form ID (existing):** `41vI0yGp6HJG0JBllaVt`

---

## PHASE 1: Project Setup

### Task 1: Remove Jekyll files, initialize Hugo

**Files:**
- Delete: `Gemfile`, `Gemfile.lock`, `_config.yml`, `index.html`, `contact.html`, `404.html`, `robots.txt`
- Delete dirs: `_includes/`, `_layouts/`, `_site/`, `.jekyll-cache/`, `.bundle/`
- Keep: `.git/`, `.gitignore`, `netlify.toml`, `docs/`, `assets/` (will restructure)

**Step 1: Remove Jekyll artifacts**
```bash
cd /Users/fcp/fcpsports
rm -f Gemfile Gemfile.lock _config.yml index.html contact.html 404.html robots.txt
rm -rf _includes _layouts _site .jekyll-cache .bundle
```

**Step 2: Initialize Hugo in existing directory**
```bash
brew install hugo   # if not installed
hugo new site . --force
```

**Step 3: Verify Hugo structure created**
```bash
ls -la
# Expected: archetypes/ config.toml content/ layouts/ static/ themes/ data/
hugo version
# Expected: hugo v0.124.0 or higher
```

**Step 4: Commit**
```bash
git add -A
git commit -m "chore: remove Jekyll, scaffold Hugo project"
```

---

### Task 2: Configure Hugo + install Tailwind

**Files:**
- Create: `hugo.toml` (replace `config.toml`)
- Create: `package.json`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `assets/css/main.css`

**Step 1: Create `hugo.toml`**
```toml
baseURL = "https://fcpsports.org/"
languageCode = "en-us"
title = "FCP Sports | Basketball Training Fort Walton Beach"
theme = ""

[params]
  description = "FCP Sports offers elite basketball training, camps, leagues, and open gym in Fort Walton Beach, FL. Serving the entire Emerald Coast."
  phone = "850.961.2323"
  email = "info@fcpsports.org"
  address = "Fort Walton Beach, FL"
  ghl_chat_widget = "jBDUi7Sma6tCl3eXKBmX"
  ghl_form_id = "41vI0yGp6HJG0JBllaVt"
  ga4_id = "G-XXXXXXXXXX"
  instagram = "https://instagram.com/fcpsports"
  facebook = "https://facebook.com/fcpsports"
  twitter = "https://twitter.com/fcpsports"

[taxonomies]
  tag = "tags"
  category = "categories"

[outputs]
  home = ["HTML", "RSS"]
  section = ["HTML", "RSS"]
  page = ["HTML"]

[markup.goldmark.renderer]
  unsafe = true

[markup.highlight]
  noClasses = false
```

**Step 2: Delete `config.toml`**
```bash
rm -f config.toml
```

**Step 3: Install Node dependencies**
```bash
npm init -y
npm install -D tailwindcss @tailwindcss/typography autoprefixer postcss
```

**Step 4: Create `tailwind.config.js`**
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './layouts/**/*.html',
    './content/**/*.md',
    './assets/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0a1628',
          800: '#0d1f3c',
          900: '#060e1a',
        },
        gold: {
          DEFAULT: '#f5a623',
          light: '#f7b84a',
          dark: '#d4911e',
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'cursive'],
        body: ['"DM Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
```

**Step 5: Create `postcss.config.js`**
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Step 6: Create `assets/css/main.css`**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html { font-family: 'DM Sans', sans-serif; }
  h1, h2, h3, h4, h5 { font-family: 'Bebas Neue', cursive; }
}

@layer components {
  .btn-primary {
    @apply bg-gold text-navy font-bold px-8 py-4 rounded-lg hover:brightness-110 transition-all duration-200 inline-block text-center;
  }
  .btn-outline {
    @apply border-2 border-white text-white px-8 py-4 rounded-lg hover:bg-white hover:text-navy transition-all duration-200 inline-block text-center;
  }
  .btn-dark {
    @apply bg-navy text-white font-bold px-8 py-4 rounded-lg hover:bg-navy-800 transition-all duration-200 inline-block text-center;
  }
  .section-tag {
    @apply text-gold font-display tracking-widest text-sm uppercase mb-2 block;
  }
  .section-heading {
    @apply font-display text-4xl md:text-5xl text-navy leading-tight mb-4;
  }
  .section-heading--white {
    @apply font-display text-4xl md:text-5xl text-white leading-tight mb-4;
  }
  .card {
    @apply bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden;
  }
  .fade-in {
    @apply opacity-0 translate-y-6 transition-all duration-700;
  }
  .fade-in.is-visible {
    @apply opacity-100 translate-y-0;
  }
}
```

**Step 7: Verify Tailwind installed**
```bash
npx tailwindcss --version
# Expected: 3.x.x
```

**Step 8: Commit**
```bash
git add -A
git commit -m "feat: add Hugo config and Tailwind CSS pipeline"
```

---

### Task 3: Update `netlify.toml` for Hugo

**Files:**
- Modify: `netlify.toml`

**Step 1: Replace `netlify.toml`**
```toml
[build]
  publish = "public"
  command = "npm ci && hugo --minify"

[build.environment]
  HUGO_VERSION = "0.124.0"
  NODE_VERSION = "20"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "SAMEORIGIN"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/videos/*"
  [headers.values]
    Cache-Control = "public, max-age=2592000"

[[redirects]]
  from = "/home"
  to = "/"
  status = 301
```

**Step 2: Commit**
```bash
git add netlify.toml
git commit -m "chore: update netlify.toml for Hugo build"
```

---

### Task 4: Copy and rename assets

**Files:**
- Create: `static/videos/fcp-sports-hero.mp4`
- Create: `static/images/fcp-sports-basketball-training-fort-walton-beach.jpg`
- Create: `static/images/fcp-sports-youth-basketball-program-florida.jpg`

**Step 1: Create directories**
```bash
mkdir -p /Users/fcp/fcpsports/static/videos
mkdir -p /Users/fcp/fcpsports/static/images
```

**Step 2: Copy assets with SEO filenames**
```bash
cp "/Users/fcp/Documents/FCP Sports/fcp sports.mp4" \
   /Users/fcp/fcpsports/static/videos/fcp-sports-hero.mp4

cp "/Users/fcp/Documents/FCP Sports/unnamed.jpg" \
   /Users/fcp/fcpsports/static/images/fcp-sports-basketball-training-fort-walton-beach.jpg

cp "/Users/fcp/Documents/FCP Sports/unnamed (1).jpg" \
   /Users/fcp/fcpsports/static/images/fcp-sports-youth-basketball-program-florida.jpg
```

**Step 3: Verify**
```bash
ls -lah /Users/fcp/fcpsports/static/videos/
ls -lah /Users/fcp/fcpsports/static/images/
```

**Step 4: Commit**
```bash
git add static/
git commit -m "feat: add hero video and optimized image assets"
```

---

## PHASE 2: Data Files

### Task 5: Create YAML data files

**Files:**
- Create: `data/coaches.yaml`
- Create: `data/testimonials.yaml`
- Create: `data/pricing.yaml`
- Create: `data/programs.yaml`
- Create: `data/schools.yaml`

**Step 1: Create `data/coaches.yaml`**
```yaml
- name: "Coach D"
  title: "Head Coach & Founder"
  bio: "Former collegiate athlete with 10+ years developing basketball talent across the Florida Panhandle. Specializes in skill development and college recruiting prep."
  image: "/images/coach-d-fcp-sports.jpg"
  credentials:
    - "USA Basketball Certified"
    - "10+ Years Coaching Experience"
    - "Former Collegiate Athlete"

- name: "Coach Name"
  title: "Skills & Development Coach"
  bio: "Specializes in guard development, ball handling, and shooting mechanics for youth athletes ages 8-18."
  image: "/images/coach-placeholder.jpg"
  credentials:
    - "AAU Certified Coach"
    - "Youth Development Specialist"
```

**Step 2: Create `data/testimonials.yaml`**
```yaml
- name: "Marcus T."
  city: "Fort Walton Beach"
  program: "Elite Training"
  quote: "My son improved more in 3 months at FCP Sports than in 2 years elsewhere. The coaches actually care about development, not just wins."
  rating: 5

- name: "Jennifer R."
  city: "Destin"
  program: "Youth Basketball"
  quote: "The Little Ballers program was perfect for my 7-year-old. Patient coaches, structured curriculum, and my daughter actually loves going."
  rating: 5

- name: "David K."
  city: "Niceville"
  program: "Summer AAU"
  quote: "Worth every penny. My son got exposure to college scouts and improved his game dramatically over the summer."
  rating: 5

- name: "Tanya M."
  city: "Navarre"
  program: "Basketball Lessons"
  quote: "Private lessons transformed my daughter's confidence on the court. She made the school team after just 8 weeks of training."
  rating: 5
```

**Step 3: Create `data/pricing.yaml`**
```yaml
- name: "Little Ballers"
  ages: "Ages 5-8 (K-2nd)"
  price: "Contact for pricing"
  frequency: "Weekly sessions"
  features:
    - "Fundamentals & fun"
    - "Small group sizes"
    - "Progress reports"
    - "Parent updates"

- name: "Junior Program"
  ages: "Ages 8-11 (3rd-5th)"
  price: "Contact for pricing"
  frequency: "2x per week"
  features:
    - "Skill-based curriculum"
    - "Position training"
    - "Game IQ development"
    - "League play included"

- name: "Elite Youth"
  ages: "Ages 11-14 (6th-8th)"
  price: "Contact for pricing"
  frequency: "3x per week"
  features:
    - "Competitive prep"
    - "AAU pipeline"
    - "Film review"
    - "Recruiting education"

- name: "Summer AAU Program"
  ages: "Ages 12-18"
  price: "$6,799"
  frequency: "Full summer"
  features:
    - "Tournament travel"
    - "NCAA exposure windows"
    - "College coach exposure"
    - "All-inclusive package"

- name: "Private Lessons"
  ages: "All ages"
  price: "Contact for rates"
  frequency: "Flexible scheduling"
  features:
    - "1-on-1 coaching"
    - "Custom curriculum"
    - "Video analysis"
    - "Parent progress reports"

- name: "Gym Rental"
  ages: "N/A"
  price: "Contact for rates"
  frequency: "Hourly / Half-day / Full-day"
  features:
    - "Full regulation court"
    - "Scoreboard available"
    - "Equipment included"
    - "Weekday & weekend slots"
```

**Step 4: Create `data/programs.yaml`**
```yaml
- title: "Basketball Camp"
  slug: "/services/basketball-camp/"
  icon: "🏕️"
  description: "Immersive multi-day camps for all skill levels. Structured drills, scrimmages, and elite coaching in Fort Walton Beach."
  keyword: "basketball camp fort walton beach"

- title: "Skills Training"
  slug: "/services/basketball-training/"
  icon: "🎯"
  description: "Position-specific skill development for serious athletes. Ball handling, shooting, footwork, and game IQ."
  keyword: "basketball training near me"

- title: "Private Lessons"
  slug: "/services/basketball-lessons/"
  icon: "👤"
  description: "1-on-1 and small group instruction tailored to your athlete's specific needs and goals."
  keyword: "basketball lessons fort walton beach"

- title: "Basketball League"
  slug: "/services/basketball-league/"
  icon: "🏆"
  description: "Competitive league play for youth and adults. Organized games, standings, and playoff brackets."
  keyword: "basketball league fort walton beach"

- title: "Open Gym"
  slug: "/services/open-gym/"
  icon: "🚪"
  description: "Drop-in court access for pick-up games, individual work, and free play. Check the schedule and come run."
  keyword: "open gym basketball fort walton beach"

- title: "Gym Rental"
  slug: "/services/gym-rental/"
  icon: "🏟️"
  description: "Rent our full regulation court for practices, tryouts, birthday parties, and private events."
  keyword: "basketball gym rental fort walton beach"

- title: "Summer AAU"
  slug: "/services/summer-aau/"
  icon: "✈️"
  description: "All-inclusive summer AAU program with tournament travel, college coach exposure, and NCAA window events. $6,799."
  keyword: "AAU basketball florida"

- title: "Youth Basketball"
  slug: "/services/youth-basketball/"
  icon: "👦"
  description: "Age-tiered youth programs: Little Ballers (K-2), Junior Program (3rd-5th), and Elite Youth (6th-8th)."
  keyword: "youth basketball fort walton beach"
```

**Step 5: Create `data/schools.yaml`**
```yaml
fort_walton_beach:
  elementary:
    - "Annette P. Edwins Elementary"
    - "Liza Jackson Preparatory School"
    - "Florosa Elementary"
    - "Eglin Elementary"
  middle:
    - "W.C. Pryor Middle School"
    - "Max Bruner Jr. Middle School"
    - "Clifford Meigs Middle School"

destin:
  elementary:
    - "Destin Elementary School"
  middle:
    - "Destin Middle School"

niceville:
  elementary:
    - "James E. Plew Elementary"
    - "Lula J. Edge Elementary"
    - "Bluewater Elementary"
  middle:
    - "C.W. Ruckel Middle School"
    - "Okaloosa STEMM Center"

navarre:
  elementary:
    - "Holley-Navarre Primary"
    - "Holley-Navarre Intermediate"
    - "West Navarre Intermediate"
  middle:
    - "Holley-Navarre Middle School"

crestview:
  elementary:
    - "Antioch Elementary"
    - "Bob Sikes Elementary"
  middle:
    - "Davidson Middle School"
    - "Shoal River Middle School"

pensacola:
  middle:
    - "Bellview Middle School"
    - "Beulah Middle School"
    - "Ferry Pass Middle School"
    - "Jim C. Bailey Middle School"
    - "J.H. Workman Middle School"
    - "Ransom Middle School"

panama_city:
  middle:
    - "Jinks Middle School"
    - "Merritt Brown Middle School"
    - "Deane Bozeman Middle School"
```

**Step 6: Commit**
```bash
git add data/
git commit -m "feat: add YAML data files for coaches, programs, pricing, schools"
```

---

## PHASE 3: Base Layout System

### Task 6: Create base layout (`baseof.html`)

**Files:**
- Create: `layouts/_default/baseof.html`

**Step 1: Create `layouts/_default/baseof.html`**
```html
<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
  {{ partial "head.html" . }}
</head>
<body class="font-body bg-white text-gray-900">

  {{ partial "nav.html" . }}

  <main id="main-content">
    {{ block "main" . }}{{ end }}
  </main>

  {{ partial "footer.html" . }}
  {{ partial "exit-popup.html" . }}
  {{ partial "ghl-chat.html" . }}

  {{ $js := resources.Get "js/main.js" | resources.Minify | resources.Fingerprint }}
  <script src="{{ $js.RelPermalink }}" defer></script>

</body>
</html>
```

---

### Task 7: Create head partial

**Files:**
- Create: `layouts/partials/head.html`

**Step 1: Create `layouts/partials/head.html`**
```html
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />

<!-- Title & Description -->
<title>{{ if .IsHome }}{{ site.Title }}{{ else }}{{ .Title }} | FCP Sports{{ end }}</title>
<meta name="description" content="{{ with .Description }}{{ . }}{{ else }}{{ site.Params.description }}{{ end }}" />

<!-- Canonical -->
<link rel="canonical" href="{{ .Permalink }}" />

<!-- Open Graph -->
<meta property="og:type" content="{{ if .IsPage }}article{{ else }}website{{ end }}" />
<meta property="og:title" content="{{ .Title }}" />
<meta property="og:description" content="{{ with .Description }}{{ . }}{{ else }}{{ site.Params.description }}{{ end }}" />
<meta property="og:url" content="{{ .Permalink }}" />
<meta property="og:image" content="{{ site.BaseURL }}images/fcp-sports-basketball-training-fort-walton-beach.jpg" />
<meta property="og:site_name" content="FCP Sports" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{{ .Title }}" />
<meta name="twitter:description" content="{{ with .Description }}{{ . }}{{ else }}{{ site.Params.description }}{{ end }}" />

<!-- Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

<!-- Tailwind CSS via Hugo Pipes -->
{{ $css := resources.Get "css/main.css" | resources.PostCSS | resources.Minify | resources.Fingerprint }}
<link rel="stylesheet" href="{{ $css.RelPermalink }}" />

<!-- GA4 -->
{{ with site.Params.ga4_id }}
<script async src="https://www.googletagmanager.com/gtag/js?id={{ . }}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '{{ . }}');
</script>
{{ end }}

<!-- Schema: LocalBusiness (homepage only) -->
{{ if .IsHome }}{{ partial "schema/local-business.html" . }}{{ end }}

<!-- Schema: BreadcrumbList (all non-home pages) -->
{{ if not .IsHome }}{{ partial "schema/breadcrumb.html" . }}{{ end }}

<!-- Schema: per content type -->
{{ if eq .Section "services" }}{{ partial "schema/service.html" . }}{{ end }}
{{ if .Params.faq }}{{ partial "schema/faqpage.html" . }}{{ end }}

<link rel="icon" type="image/x-icon" href="/favicon.ico" />
```

---

### Task 8: Create nav partial

**Files:**
- Create: `layouts/partials/nav.html`

**Step 1: Create `layouts/partials/nav.html`**
```html
<header class="header fixed top-0 left-0 right-0 z-50 bg-navy shadow-lg transition-all duration-300" id="site-header">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between h-20">

      <!-- Logo -->
      <a href="/" class="flex items-center gap-3 flex-shrink-0">
        <span class="font-display text-3xl text-white tracking-wider">FCP <span class="text-gold">SPORTS</span></span>
      </a>

      <!-- Desktop Nav -->
      <nav class="hidden lg:flex items-center gap-1" aria-label="Main navigation">
        <a href="/" class="nav-link text-white/80 hover:text-gold px-3 py-2 text-sm font-medium transition-colors">Home</a>

        <!-- Services dropdown -->
        <div class="relative group">
          <button class="nav-link text-white/80 hover:text-gold px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1">
            Services <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div class="absolute top-full left-0 bg-white rounded-xl shadow-xl p-4 w-64 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 mt-1">
            <a href="/services/basketball-camp/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Basketball Camp</a>
            <a href="/services/basketball-training/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Skills Training</a>
            <a href="/services/basketball-lessons/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Private Lessons</a>
            <a href="/services/basketball-league/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Basketball League</a>
            <a href="/services/open-gym/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Open Gym</a>
            <a href="/services/gym-rental/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Gym Rental</a>
            <a href="/services/summer-aau/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Summer AAU</a>
          </div>
        </div>

        <!-- Youth dropdown -->
        <div class="relative group">
          <button class="nav-link text-white/80 hover:text-gold px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1">
            Youth Programs <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div class="absolute top-full left-0 bg-white rounded-xl shadow-xl p-4 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 mt-1">
            <a href="/youth/elementary-school-basketball/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Elementary (K-5th)</a>
            <a href="/youth/middle-school-basketball/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Middle School (6th-8th)</a>
            <a href="/youth/high-school-basketball/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">High School & Recruiting</a>
          </div>
        </div>

        <!-- Locations dropdown -->
        <div class="relative group">
          <button class="nav-link text-white/80 hover:text-gold px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1">
            Locations <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div class="absolute top-full left-0 bg-white rounded-xl shadow-xl p-4 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 mt-1">
            <a href="/locations/fort-walton-beach/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Fort Walton Beach</a>
            <a href="/locations/destin/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Destin</a>
            <a href="/locations/niceville/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Niceville</a>
            <a href="/locations/navarre/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Navarre</a>
            <a href="/locations/crestview/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Crestview</a>
            <a href="/locations/pensacola/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Pensacola</a>
            <a href="/locations/panama-city/" class="block px-3 py-2 text-navy hover:text-gold text-sm rounded-lg hover:bg-gray-50">Panama City</a>
          </div>
        </div>

        <a href="/blog/" class="nav-link text-white/80 hover:text-gold px-3 py-2 text-sm font-medium transition-colors">Blog</a>
        <a href="/about/" class="nav-link text-white/80 hover:text-gold px-3 py-2 text-sm font-medium transition-colors">About</a>
        <a href="/pricing/" class="nav-link text-white/80 hover:text-gold px-3 py-2 text-sm font-medium transition-colors">Pricing</a>
        <a href="/registration/" class="btn-primary ml-4 text-sm py-3 px-6">Register Now</a>
      </nav>

      <!-- Mobile hamburger -->
      <button class="lg:hidden nav-toggle p-2 text-white" aria-label="Toggle menu" aria-expanded="false">
        <span class="nav-toggle__bar block w-6 h-0.5 bg-white mb-1.5 transition-all duration-300"></span>
        <span class="nav-toggle__bar block w-6 h-0.5 bg-white mb-1.5 transition-all duration-300"></span>
        <span class="nav-toggle__bar block w-6 h-0.5 bg-white transition-all duration-300"></span>
      </button>
    </div>
  </div>

  <!-- Mobile nav drawer -->
  <div class="mobile-nav hidden lg:hidden bg-navy-900 border-t border-white/10 pb-6 px-4">
    <a href="/" class="block py-3 text-white border-b border-white/10 font-medium">Home</a>
    <p class="text-gold text-xs font-display tracking-widest mt-4 mb-2">SERVICES</p>
    <a href="/services/basketball-camp/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Basketball Camp</a>
    <a href="/services/basketball-training/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Skills Training</a>
    <a href="/services/basketball-lessons/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Private Lessons</a>
    <a href="/services/basketball-league/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Basketball League</a>
    <a href="/services/open-gym/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Open Gym</a>
    <a href="/services/gym-rental/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Gym Rental</a>
    <a href="/services/summer-aau/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Summer AAU</a>
    <p class="text-gold text-xs font-display tracking-widest mt-4 mb-2">YOUTH PROGRAMS</p>
    <a href="/youth/elementary-school-basketball/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Elementary (K-5th)</a>
    <a href="/youth/middle-school-basketball/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Middle School</a>
    <a href="/youth/high-school-basketball/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">High School & Recruiting</a>
    <p class="text-gold text-xs font-display tracking-widest mt-4 mb-2">LOCATIONS</p>
    <a href="/locations/fort-walton-beach/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Fort Walton Beach</a>
    <a href="/locations/destin/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Destin</a>
    <a href="/locations/niceville/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Niceville</a>
    <a href="/locations/navarre/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Navarre</a>
    <a href="/locations/crestview/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Crestview</a>
    <a href="/locations/pensacola/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Pensacola</a>
    <a href="/locations/panama-city/" class="block py-2 text-white/80 hover:text-gold pl-3 text-sm">Panama City</a>
    <div class="mt-4 border-t border-white/10 pt-4 space-y-2">
      <a href="/blog/" class="block py-2 text-white font-medium">Blog</a>
      <a href="/about/" class="block py-2 text-white font-medium">About</a>
      <a href="/pricing/" class="block py-2 text-white font-medium">Pricing</a>
      <a href="/registration/" class="btn-primary block text-center mt-4">Register Now</a>
    </div>
  </div>
</header>
<div class="h-20"></div><!-- Spacer for fixed header -->
```

---

### Task 9: Create footer partial

**Files:**
- Create: `layouts/partials/footer.html`

**Step 1: Create `layouts/partials/footer.html`**
```html
<footer class="bg-navy text-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">

      <!-- Column 1: Brand -->
      <div>
        <div class="font-display text-3xl tracking-wider mb-4">FCP <span class="text-gold">SPORTS</span></div>
        <p class="text-white/70 text-sm leading-relaxed mb-6">Elite basketball training, camps, leagues, and open gym on Florida's Emerald Coast. Developing athletes, building champions.</p>
        <div class="flex gap-4">
          <a href="{{ site.Params.instagram }}" aria-label="Instagram" class="text-white/60 hover:text-gold transition-colors">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
          </a>
          <a href="{{ site.Params.facebook }}" aria-label="Facebook" class="text-white/60 hover:text-gold transition-colors">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </a>
        </div>
      </div>

      <!-- Column 2: Services -->
      <div>
        <h3 class="font-display text-lg text-gold tracking-wider mb-4">PROGRAMS</h3>
        <ul class="space-y-2">
          <li><a href="/services/basketball-camp/" class="text-white/70 hover:text-gold text-sm transition-colors">Basketball Camp</a></li>
          <li><a href="/services/basketball-training/" class="text-white/70 hover:text-gold text-sm transition-colors">Skills Training</a></li>
          <li><a href="/services/basketball-lessons/" class="text-white/70 hover:text-gold text-sm transition-colors">Private Lessons</a></li>
          <li><a href="/services/basketball-league/" class="text-white/70 hover:text-gold text-sm transition-colors">Basketball League</a></li>
          <li><a href="/services/open-gym/" class="text-white/70 hover:text-gold text-sm transition-colors">Open Gym</a></li>
          <li><a href="/services/gym-rental/" class="text-white/70 hover:text-gold text-sm transition-colors">Gym Rental</a></li>
          <li><a href="/services/summer-aau/" class="text-white/70 hover:text-gold text-sm transition-colors">Summer AAU</a></li>
        </ul>
      </div>

      <!-- Column 3: Locations -->
      <div>
        <h3 class="font-display text-lg text-gold tracking-wider mb-4">LOCATIONS</h3>
        <ul class="space-y-2">
          <li><a href="/locations/fort-walton-beach/" class="text-white/70 hover:text-gold text-sm transition-colors">Fort Walton Beach</a></li>
          <li><a href="/locations/destin/" class="text-white/70 hover:text-gold text-sm transition-colors">Destin</a></li>
          <li><a href="/locations/niceville/" class="text-white/70 hover:text-gold text-sm transition-colors">Niceville</a></li>
          <li><a href="/locations/navarre/" class="text-white/70 hover:text-gold text-sm transition-colors">Navarre</a></li>
          <li><a href="/locations/crestview/" class="text-white/70 hover:text-gold text-sm transition-colors">Crestview</a></li>
          <li><a href="/locations/pensacola/" class="text-white/70 hover:text-gold text-sm transition-colors">Pensacola</a></li>
          <li><a href="/locations/panama-city/" class="text-white/70 hover:text-gold text-sm transition-colors">Panama City</a></li>
        </ul>
      </div>

      <!-- Column 4: Contact -->
      <div>
        <h3 class="font-display text-lg text-gold tracking-wider mb-4">CONTACT</h3>
        <ul class="space-y-3 text-sm text-white/70">
          <li class="flex gap-2">
            <svg class="w-4 h-4 text-gold flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            Fort Walton Beach, FL 32547
          </li>
          <li class="flex gap-2">
            <svg class="w-4 h-4 text-gold flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
            <a href="tel:{{ site.Params.phone }}" class="hover:text-gold transition-colors">{{ site.Params.phone }}</a>
          </li>
          <li class="flex gap-2">
            <svg class="w-4 h-4 text-gold flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            <a href="mailto:{{ site.Params.email }}" class="hover:text-gold transition-colors">{{ site.Params.email }}</a>
          </li>
        </ul>
        <a href="/registration/" class="btn-primary inline-block mt-6 text-sm py-3 px-6">Register Now →</a>
      </div>
    </div>
  </div>

  <!-- Bottom bar -->
  <div class="border-t border-white/10">
    <div class="max-w-7xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
      <p class="text-white/50 text-xs">© {{ now.Year }} FCP Sports. All rights reserved.</p>
      <div class="flex gap-6 text-xs text-white/50">
        <a href="/privacy/" class="hover:text-gold transition-colors">Privacy Policy</a>
        <a href="/terms/" class="hover:text-gold transition-colors">Terms of Service</a>
        <a href="/sitemap.xml" class="hover:text-gold transition-colors">Sitemap</a>
      </div>
    </div>
  </div>
</footer>
```

---

### Task 10: Create schema partials

**Files:**
- Create: `layouts/partials/schema/local-business.html`
- Create: `layouts/partials/schema/service.html`
- Create: `layouts/partials/schema/faqpage.html`
- Create: `layouts/partials/schema/breadcrumb.html`

**Step 1: Create `layouts/partials/schema/local-business.html`**
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": ["SportsOrganization", "LocalBusiness"],
  "name": "FCP Sports",
  "alternateName": "Florida Coastal Prep Sports",
  "url": "https://fcpsports.org",
  "logo": "https://fcpsports.org/images/fcp-sports-logo.png",
  "image": "https://fcpsports.org/images/fcp-sports-basketball-training-fort-walton-beach.jpg",
  "description": "Elite basketball training, camps, leagues, and open gym in Fort Walton Beach, FL. Serving the entire Emerald Coast.",
  "telephone": "{{ site.Params.phone }}",
  "email": "{{ site.Params.email }}",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Fort Walton Beach",
    "addressRegion": "FL",
    "postalCode": "32547",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 30.4057,
    "longitude": -86.6188
  },
  "areaServed": [
    "Fort Walton Beach, FL",
    "Destin, FL",
    "Niceville, FL",
    "Navarre, FL",
    "Crestview, FL",
    "Pensacola, FL",
    "Panama City, FL"
  ],
  "sport": "Basketball",
  "sameAs": [
    "{{ site.Params.instagram }}",
    "{{ site.Params.facebook }}"
  ],
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      "opens": "09:00",
      "closes": "21:00"
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Saturday","Sunday"],
      "opens": "09:00",
      "closes": "18:00"
    }
  ],
  "priceRange": "$$"
}
</script>
```

**Step 2: Create `layouts/partials/schema/faqpage.html`**
```html
{{ if .Params.faq }}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {{ range $i, $faq := .Params.faq }}{{ if $i }},{{ end }}
    {
      "@type": "Question",
      "name": {{ $faq.q | jsonify }},
      "acceptedAnswer": {
        "@type": "Answer",
        "text": {{ $faq.a | jsonify }}
      }
    }
    {{ end }}
  ]
}
</script>
{{ end }}
```

**Step 3: Create `layouts/partials/schema/breadcrumb.html`**
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://fcpsports.org/"
    },
    {{ if .Parent }}
    {
      "@type": "ListItem",
      "position": 2,
      "name": "{{ .Parent.Title }}",
      "item": "{{ .Parent.Permalink }}"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "{{ .Title }}",
      "item": "{{ .Permalink }}"
    }
    {{ else }}
    {
      "@type": "ListItem",
      "position": 2,
      "name": "{{ .Title }}",
      "item": "{{ .Permalink }}"
    }
    {{ end }}
  ]
}
</script>
```

**Step 4: Create `layouts/partials/schema/service.html`**
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": {{ .Title | jsonify }},
  "description": {{ .Description | jsonify }},
  "provider": {
    "@type": "LocalBusiness",
    "name": "FCP Sports",
    "url": "https://fcpsports.org"
  },
  "areaServed": {
    "@type": "State",
    "name": "Florida Panhandle"
  },
  "serviceType": "Basketball Training"
}
</script>
```

---

### Task 11: Create reusable component partials

**Files:**
- Create: `layouts/partials/ghl-form.html`
- Create: `layouts/partials/ghl-chat.html`
- Create: `layouts/partials/exit-popup.html`
- Create: `layouts/partials/faq-block.html`
- Create: `layouts/partials/cta-section.html`

**Step 1: Create `layouts/partials/ghl-form.html`**
```html
{{ $formId := .formId | default site.Params.ghl_form_id }}
<div class="ghl-form-wrapper w-full overflow-hidden rounded-xl">
  <iframe
    src="https://api.leadconnectorhq.com/widget/form/{{ $formId }}"
    style="width:100%;height:600px;border:none;border-radius:12px"
    scrolling="no"
    id="ghl-form-{{ $formId }}"
    title="Contact Form"
    loading="lazy"
  ></iframe>
  <script src="https://link.msgsndr.com/js/form_embed.js" defer></script>
</div>
```

**Step 2: Create `layouts/partials/ghl-chat.html`**
```html
{{ with site.Params.ghl_chat_widget }}
<script>
  setTimeout(function() {
    var s = document.createElement('script');
    s.src = 'https://widgets.leadconnectorhq.com/loader.js';
    s.setAttribute('data-resources-url', 'https://widgets.leadconnectorhq.com/chat-widget/loader.js');
    s.setAttribute('data-widget-id', '{{ . }}');
    document.body.appendChild(s);
  }, 3000);
</script>
{{ end }}
```

**Step 3: Create `layouts/partials/exit-popup.html`**

Check if current page is a guide page — suppress popup on guides:
```html
{{ if not (hasPrefix .RelPermalink "/guides/") }}
<div id="exit-popup" class="fixed inset-0 z-[100] hidden" role="dialog" aria-modal="true" aria-labelledby="exit-popup-title">
  <!-- Overlay -->
  <div id="exit-overlay" class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
  <!-- Modal -->
  <div class="relative z-10 flex items-center justify-center min-h-screen p-4">
    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
      <!-- Header -->
      <div class="bg-navy p-8 text-center relative">
        <button id="exit-close" class="absolute top-4 right-4 text-white/60 hover:text-white" aria-label="Close">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
        <div class="text-4xl mb-3">🏀</div>
        <h2 id="exit-popup-title" class="font-display text-3xl text-white">WAIT — DON'T LEAVE<br><span class="text-gold">EMPTY-HANDED!</span></h2>
      </div>
      <!-- Body -->
      <div class="p-8">
        <p class="text-gray-600 text-center mb-4">Grab the <strong>FREE Youth Basketball Parent's Guide</strong> before you go:</p>
        <ul class="space-y-2 mb-6">
          <li class="flex items-center gap-2 text-sm text-gray-700"><span class="text-gold">✓</span> What to look for in a training program</li>
          <li class="flex items-center gap-2 text-sm text-gray-700"><span class="text-gold">✓</span> AAU basketball basics for new parents</li>
          <li class="flex items-center gap-2 text-sm text-gray-700"><span class="text-gold">✓</span> How to help your athlete level up fast</li>
        </ul>
        <!-- GHL inline form — replace GUIDE_FORM_ID with actual GHL exit intent form ID -->
        <iframe
          src="https://api.leadconnectorhq.com/widget/form/EXIT_INTENT_FORM_ID"
          style="width:100%;height:220px;border:none;"
          scrolling="no"
          title="Get Free Guide"
          loading="lazy"
        ></iframe>
        <p class="text-center text-xs text-gray-400 mt-3">No spam. Unsubscribe anytime.</p>
      </div>
    </div>
  </div>
</div>
{{ end }}
```

**Step 4: Create `layouts/partials/faq-block.html`**
```html
{{ if .Params.faq }}
<section class="py-16 bg-gray-50">
  <div class="max-w-3xl mx-auto px-4">
    <span class="section-tag">FAQ</span>
    <h2 class="section-heading">Common Questions</h2>
    <div class="mt-8 space-y-4">
      {{ range .Params.faq }}
      <details class="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <summary class="flex items-center justify-between p-6 cursor-pointer font-semibold text-navy hover:text-gold transition-colors list-none">
          {{ .q }}
          <svg class="w-5 h-5 flex-shrink-0 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </summary>
        <div class="px-6 pb-6 text-gray-600 leading-relaxed">{{ .a }}</div>
      </details>
      {{ end }}
    </div>
  </div>
</section>
{{ end }}
```

**Step 5: Create `layouts/partials/cta-section.html`**
```html
<section class="bg-gold py-20">
  <div class="max-w-4xl mx-auto px-4 text-center">
    <span class="font-display text-navy/60 text-sm tracking-widest uppercase">Take The Next Step</span>
    <h2 class="font-display text-5xl md:text-6xl text-navy mt-2 mb-6">READY TO LEVEL UP?</h2>
    <p class="text-navy/80 text-lg mb-8 max-w-2xl mx-auto">Join hundreds of Emerald Coast athletes training at FCP Sports. Spots fill fast — secure your athlete's spot today.</p>
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="/registration/" class="btn-dark text-lg py-4 px-10">Register Now</a>
      <a href="/contact/" class="border-2 border-navy text-navy px-10 py-4 rounded-lg font-bold hover:bg-navy hover:text-white transition-all duration-200 inline-block text-center text-lg">Ask a Question</a>
    </div>
  </div>
</section>
```

**Step 6: Commit**
```bash
git add layouts/
git commit -m "feat: add base layout, nav, footer, schema, and component partials"
```

---

### Task 12: Create main JavaScript file

**Files:**
- Create: `assets/js/main.js`

**Step 1: Create `assets/js/main.js`**
```js
/* =============================================
   FCP Sports — main.js
   ============================================= */

// ── Nav: mobile toggle ──────────────────────
const navToggle = document.querySelector('.nav-toggle');
const mobileNav = document.querySelector('.mobile-nav');
if (navToggle && mobileNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = !mobileNav.classList.contains('hidden');
    mobileNav.classList.toggle('hidden', isOpen);
    navToggle.setAttribute('aria-expanded', String(!isOpen));
  });
}

// ── Nav: scroll shadow ───────────────────────
const header = document.getElementById('site-header');
if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('shadow-xl', window.scrollY > 60);
  }, { passive: true });
}

// ── Scroll animations ────────────────────────
const fadeEls = document.querySelectorAll('.fade-in');
if (fadeEls.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  fadeEls.forEach(el => observer.observe(el));
}

// ── Exit intent popup ────────────────────────
(function () {
  const popup = document.getElementById('exit-popup');
  if (!popup) return;

  const sessionKey = 'fcp_exit_shown';
  if (sessionStorage.getItem(sessionKey)) return;

  let eligible = false;
  setTimeout(() => { eligible = true; }, 3000);

  function showPopup() {
    if (!eligible || sessionStorage.getItem(sessionKey)) return;
    popup.classList.remove('hidden');
    sessionStorage.setItem(sessionKey, '1');
    document.body.style.overflow = 'hidden';
  }

  function closePopup() {
    popup.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Desktop: mouse leaves toward top
  document.addEventListener('mouseleave', (e) => {
    if (e.clientY < 20) showPopup();
  });

  // Mobile: 40-second timer
  setTimeout(showPopup, 40000);

  // Close handlers
  document.getElementById('exit-close')?.addEventListener('click', closePopup);
  document.getElementById('exit-overlay')?.addEventListener('click', closePopup);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePopup();
  });
})();
```

**Step 2: Commit**
```bash
git add assets/js/main.js
git commit -m "feat: add main JS (nav, scroll animations, exit intent)"
```

---

## PHASE 4: Homepage

### Task 13: Create homepage layout + content

**Files:**
- Create: `layouts/index.html`
- Create: `content/_index.md`

**Step 1: Create `content/_index.md`**
```markdown
---
title: "Basketball Training Fort Walton Beach | FCP Sports"
description: "FCP Sports offers elite basketball camps, training, leagues, open gym, and youth programs in Fort Walton Beach, FL. Serving the entire Emerald Coast."
---
```

**Step 2: Create `layouts/index.html`**
```html
{{ define "main" }}

<!-- ── HERO ──────────────────────────────────── -->
<section class="relative min-h-screen flex items-center justify-center overflow-hidden">
  <!-- Video background -->
  <video
    class="absolute inset-0 w-full h-full object-cover"
    autoplay muted loop playsinline
    poster="/images/fcp-sports-basketball-training-fort-walton-beach.jpg"
  >
    <source src="/videos/fcp-sports-hero.mp4" type="video/mp4" />
  </video>
  <!-- Dark overlay -->
  <div class="absolute inset-0 bg-navy/75"></div>
  <!-- Content -->
  <div class="relative z-10 text-center px-4 max-w-5xl mx-auto">
    <span class="inline-block text-gold font-display tracking-[0.3em] text-sm uppercase mb-4">Fort Walton Beach, FL • Est. 2020</span>
    <h1 class="font-display text-6xl md:text-8xl lg:text-9xl text-white leading-none mb-6">
      TRAIN LIKE<br><span class="text-gold">A CHAMPION</span>
    </h1>
    <p class="text-white/80 text-lg md:text-xl max-w-2xl mx-auto mb-10 font-body">
      Elite basketball training, camps, leagues, and youth programs on Florida's Emerald Coast. From Little Ballers to AAU hopefuls — we develop athletes.
    </p>
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="/registration/" class="btn-primary text-lg py-5 px-12">Register Now</a>
      <a href="/guides/youth-basketball-parents-guide/" class="btn-outline text-lg py-5 px-12">Free Parent's Guide</a>
    </div>
  </div>
  <!-- Scroll indicator -->
  <div class="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/40 animate-bounce">
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
  </div>
</section>

<!-- ── STATS BAR ─────────────────────────────── -->
<section class="bg-gold py-10">
  <div class="max-w-6xl mx-auto px-4">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
      <div class="fade-in">
        <div class="font-display text-5xl text-navy">500+</div>
        <div class="text-navy/70 text-sm font-semibold uppercase tracking-wider mt-1">Athletes Trained</div>
      </div>
      <div class="fade-in">
        <div class="font-display text-5xl text-navy">8</div>
        <div class="text-navy/70 text-sm font-semibold uppercase tracking-wider mt-1">Programs Offered</div>
      </div>
      <div class="fade-in">
        <div class="font-display text-5xl text-navy">7</div>
        <div class="text-navy/70 text-sm font-semibold uppercase tracking-wider mt-1">Cities Served</div>
      </div>
      <div class="fade-in">
        <div class="font-display text-5xl text-navy">5★</div>
        <div class="text-navy/70 text-sm font-semibold uppercase tracking-wider mt-1">Google Rating</div>
      </div>
    </div>
  </div>
</section>

<!-- ── PROGRAMS GRID ──────────────────────────── -->
<section class="py-24 bg-white">
  <div class="max-w-7xl mx-auto px-4">
    <div class="text-center mb-16">
      <span class="section-tag">What We Offer</span>
      <h2 class="section-heading">Programs For Every Athlete</h2>
      <p class="text-gray-500 max-w-2xl mx-auto">From first-time ballers to college-bound athletes, FCP Sports has a program designed for your athlete's exact level and goals.</p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {{ range site.Data.programs }}
      <a href="{{ .slug }}" class="card p-6 group hover:-translate-y-1 transition-all duration-300 fade-in">
        <div class="text-4xl mb-4">{{ .icon }}</div>
        <h3 class="font-display text-xl text-navy mb-2 group-hover:text-gold transition-colors">{{ .title }}</h3>
        <p class="text-gray-500 text-sm leading-relaxed mb-4">{{ .description }}</p>
        <span class="text-gold text-sm font-semibold">Learn More →</span>
      </a>
      {{ end }}
    </div>
  </div>
</section>

<!-- ── YOUTH TIERS ────────────────────────────── -->
<section class="py-24 bg-navy">
  <div class="max-w-6xl mx-auto px-4">
    <div class="text-center mb-16">
      <span class="text-gold font-display tracking-widest text-sm uppercase">Youth Development</span>
      <h2 class="section-heading--white mt-2">Programs Built For<br>Every Age Group</h2>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div class="border border-white/20 rounded-2xl p-8 text-center hover:border-gold transition-colors fade-in">
        <div class="text-5xl mb-4">🐣</div>
        <h3 class="font-display text-2xl text-gold mb-2">Little Ballers</h3>
        <p class="text-white/60 text-sm mb-4">K – 2nd Grade • Ages 5-8</p>
        <p class="text-white/80 text-sm leading-relaxed">Fun fundamentals, coordination, and love for the game. No experience needed.</p>
        <a href="/youth/elementary-school-basketball/" class="btn-outline text-sm py-3 px-6 mt-6 inline-block">Learn More</a>
      </div>
      <div class="border border-gold rounded-2xl p-8 text-center relative fade-in">
        <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-navy text-xs font-bold px-4 py-1 rounded-full">MOST POPULAR</div>
        <div class="text-5xl mb-4">🏀</div>
        <h3 class="font-display text-2xl text-gold mb-2">Junior Program</h3>
        <p class="text-white/60 text-sm mb-4">3rd – 5th Grade • Ages 8-11</p>
        <p class="text-white/80 text-sm leading-relaxed">Skill-based curriculum covering all positions. League play and competitive prep.</p>
        <a href="/youth/elementary-school-basketball/" class="btn-primary text-sm py-3 px-6 mt-6 inline-block">Learn More</a>
      </div>
      <div class="border border-white/20 rounded-2xl p-8 text-center hover:border-gold transition-colors fade-in">
        <div class="text-5xl mb-4">🌟</div>
        <h3 class="font-display text-2xl text-gold mb-2">Elite Youth</h3>
        <p class="text-white/60 text-sm mb-4">6th – 8th Grade • Ages 11-14</p>
        <p class="text-white/80 text-sm leading-relaxed">Competitive prep, AAU pipeline, film review, and recruiting education starts here.</p>
        <a href="/youth/middle-school-basketball/" class="btn-outline text-sm py-3 px-6 mt-6 inline-block">Learn More</a>
      </div>
    </div>
  </div>
</section>

<!-- ── ABOUT / EEAT ───────────────────────────── -->
<section class="py-24 bg-gray-50">
  <div class="max-w-7xl mx-auto px-4">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
      <div class="fade-in">
        <img
          src="/images/fcp-sports-basketball-training-fort-walton-beach.jpg"
          alt="Basketball training at FCP Sports Fort Walton Beach Florida"
          class="rounded-2xl shadow-xl w-full object-cover aspect-[4/3]"
          loading="lazy"
        />
      </div>
      <div class="fade-in">
        <span class="section-tag">Why FCP Sports</span>
        <h2 class="section-heading">The Emerald Coast's Premier Basketball Facility</h2>
        <p class="text-gray-600 leading-relaxed mb-6">FCP Sports was built for one reason: to give Emerald Coast athletes access to the same elite development programs available in major cities. Whether your child is picking up a basketball for the first time or preparing for college recruitment, we have a structured, proven pathway for them.</p>
        <ul class="space-y-4 mb-8">
          <li class="flex gap-3 items-start">
            <span class="text-gold text-xl flex-shrink-0">✓</span>
            <div><strong class="text-navy">USA Basketball Certified Coaches</strong> with 10+ years developing youth athletes</div>
          </li>
          <li class="flex gap-3 items-start">
            <span class="text-gold text-xl flex-shrink-0">✓</span>
            <div><strong class="text-navy">500+ athletes trained</strong> across Okaloosa, Santa Rosa, Escambia, and Bay Counties</div>
          </li>
          <li class="flex gap-3 items-start">
            <span class="text-gold text-xl flex-shrink-0">✓</span>
            <div><strong class="text-navy">AAU tournament access</strong> with real NCAA exposure window events</div>
          </li>
          <li class="flex gap-3 items-start">
            <span class="text-gold text-xl flex-shrink-0">✓</span>
            <div><strong class="text-navy">School partnerships</strong> serving athletes from Bruner, Ruckel, Pryor, Destin Middle, and more</div>
          </li>
        </ul>
        <a href="/about/" class="btn-dark inline-block">Meet The Coaches →</a>
      </div>
    </div>
  </div>
</section>

<!-- ── TESTIMONIALS ───────────────────────────── -->
<section class="py-24 bg-white">
  <div class="max-w-7xl mx-auto px-4">
    <div class="text-center mb-16">
      <span class="section-tag">What Parents Say</span>
      <h2 class="section-heading">Real Results From Real Families</h2>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      {{ range first 3 site.Data.testimonials }}
      <div class="card p-8 fade-in">
        <div class="flex gap-1 text-gold mb-4">
          {{ range seq .rating }}★{{ end }}
        </div>
        <p class="text-gray-600 italic leading-relaxed mb-6">"{{ .quote }}"</p>
        <div>
          <div class="font-semibold text-navy">{{ .name }}</div>
          <div class="text-sm text-gray-400">{{ .city }} • {{ .program }}</div>
        </div>
      </div>
      {{ end }}
    </div>
  </div>
</section>

<!-- ── LOCATIONS TEASER ───────────────────────── -->
<section class="py-16 bg-navy">
  <div class="max-w-6xl mx-auto px-4 text-center">
    <span class="text-gold font-display tracking-widest text-sm uppercase">We Serve The Entire Emerald Coast</span>
    <h2 class="section-heading--white mt-2 mb-8">Athletes Come From All Over The Panhandle</h2>
    <div class="flex flex-wrap justify-center gap-3">
      {{ $cities := slice "Fort Walton Beach" "Destin" "Niceville" "Navarre" "Crestview" "Pensacola" "Panama City" }}
      {{ $slugs := slice "fort-walton-beach" "destin" "niceville" "navarre" "crestview" "pensacola" "panama-city" }}
      {{ range $i, $city := $cities }}
      <a href="/locations/{{ index $slugs $i }}/" class="bg-white/10 hover:bg-gold hover:text-navy text-white px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 border border-white/20 hover:border-gold">
        {{ $city }}
      </a>
      {{ end }}
    </div>
  </div>
</section>

<!-- ── FREE GUIDE CTA ─────────────────────────── -->
<section class="py-24 bg-gray-50">
  <div class="max-w-6xl mx-auto px-4">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
      <div class="fade-in">
        <span class="section-tag">Free Resource</span>
        <h2 class="section-heading">The Youth Basketball Parent's Guide</h2>
        <p class="text-gray-600 leading-relaxed mb-6">Not sure where to start? Our free guide covers everything Emerald Coast parents need to know: how to choose the right program, what AAU basketball really means, and how to support your athlete's development without adding pressure.</p>
        <ul class="space-y-3 mb-8">
          <li class="flex gap-2 text-gray-700"><span class="text-gold">→</span> What to look for in a youth basketball program</li>
          <li class="flex gap-2 text-gray-700"><span class="text-gold">→</span> AAU basketball 101 for first-time sports parents</li>
          <li class="flex gap-2 text-gray-700"><span class="text-gold">→</span> How to help your athlete improve at home</li>
          <li class="flex gap-2 text-gray-700"><span class="text-gold">→</span> Understanding the recruiting timeline (starts earlier than you think)</li>
        </ul>
        <a href="/guides/youth-basketball-parents-guide/" class="btn-primary inline-block">Get the Free Guide →</a>
      </div>
      <div class="fade-in">
        {{ partial "ghl-form.html" (dict "formId" site.Params.ghl_form_id) }}
      </div>
    </div>
  </div>
</section>

<!-- ── FINAL CTA ──────────────────────────────── -->
{{ partial "cta-section.html" . }}

{{ end }}
```

**Step 3: Verify build**
```bash
cd /Users/fcp/fcpsports
hugo server --port 1313 --open
# Visit http://localhost:1313 — verify homepage renders
```

**Step 4: Commit**
```bash
git add content/ layouts/index.html
git commit -m "feat: homepage with video hero, programs grid, youth tiers, testimonials"
```

---

## PHASE 5: Content Type Layouts

### Task 14: Service page layout + all 8 service pages

**Files:**
- Create: `layouts/services/single.html`
- Create: `archetypes/services.md`
- Create: `content/services/*.md` (8 files)
- Create: `content/services/_index.md`

**Step 1: Create `archetypes/services.md`**
```markdown
---
title: "{{ replace .Name "-" " " | title }}"
description: ""
h1: ""
keyword: ""
price: ""
faq:
  - q: ""
    a: ""
---
```

**Step 2: Create `layouts/services/single.html`**
```html
{{ define "main" }}

<!-- Page Hero -->
<section class="bg-navy py-24 text-center">
  <div class="max-w-4xl mx-auto px-4">
    <span class="text-gold font-display tracking-widest text-sm uppercase">FCP Sports Programs</span>
    <h1 class="font-display text-6xl md:text-7xl text-white mt-3 mb-6">{{ .Params.h1 | default .Title }}</h1>
    <p class="text-white/70 text-lg max-w-2xl mx-auto">{{ .Description }}</p>
    <div class="flex gap-4 justify-center mt-8">
      <a href="/registration/" class="btn-primary">Enroll Now</a>
      <a href="/contact/" class="btn-outline">Ask a Question</a>
    </div>
  </div>
</section>

<!-- Main content -->
<section class="py-20 bg-white">
  <div class="max-w-7xl mx-auto px-4">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
      <!-- Content column -->
      <div class="lg:col-span-2 prose prose-lg max-w-none prose-headings:font-display prose-headings:text-navy prose-a:text-gold">
        {{ .Content }}
      </div>
      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Quick info card -->
        {{ if .Params.price }}
        <div class="card p-6 border-t-4 border-gold">
          <h3 class="font-display text-xl text-navy mb-4">PROGRAM DETAILS</h3>
          <div class="space-y-3 text-sm">
            {{ if .Params.price }}<div class="flex justify-between border-b pb-2"><span class="text-gray-500">Starting From</span><span class="font-bold text-navy">{{ .Params.price }}</span></div>{{ end }}
          </div>
          <a href="/registration/" class="btn-primary w-full text-center mt-6 block">Register Now</a>
          <a href="/contact/" class="block text-center text-sm text-gray-500 hover:text-gold mt-3 transition-colors">Have questions? Contact us</a>
        </div>
        {{ end }}
        <!-- Other programs -->
        <div class="card p-6">
          <h3 class="font-display text-lg text-navy mb-4">OTHER PROGRAMS</h3>
          <ul class="space-y-2">
            {{ range site.Data.programs }}
            <li><a href="{{ .slug }}" class="text-sm text-gray-600 hover:text-gold transition-colors">{{ .title }}</a></li>
            {{ end }}
          </ul>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FAQ -->
{{ partial "faq-block.html" . }}

<!-- CTA -->
{{ partial "cta-section.html" . }}

{{ end }}
```

**Step 3: Create `content/services/_index.md`**
```markdown
---
title: "Basketball Programs Fort Walton Beach | FCP Sports"
description: "Explore all FCP Sports basketball programs: camps, training, lessons, leagues, open gym, gym rentals, and Summer AAU."
---
```

**Step 4: Create `content/services/basketball-camp.md`**
```markdown
---
title: "Basketball Camp Fort Walton Beach | FCP Sports"
description: "Multi-day basketball camps in Fort Walton Beach, FL for all skill levels. Structured drills, scrimmages, and elite coaching on the Emerald Coast."
h1: "Basketball Camp Fort Walton Beach"
keyword: "basketball camp fort walton beach"
price: "Contact for pricing"
faq:
  - q: "What age groups are your basketball camps for?"
    a: "Our basketball camps in Fort Walton Beach serve athletes ages 6 through 18. We group campers by age and skill level to ensure every athlete gets appropriate instruction and competitive experience."
  - q: "How long do your basketball camps run?"
    a: "We offer multi-day camps typically running 3-5 days. Check our registration page or contact us for the current camp schedule and available dates."
  - q: "Is your basketball camp near me if I'm from Destin or Niceville?"
    a: "Yes — FCP Sports is centrally located in Fort Walton Beach, making us easily accessible from Destin (15 min), Niceville (20 min), Navarre (25 min), and Crestview (30 min)."
  - q: "What's included in the camp fee?"
    a: "All coaching, court time, drills, and scrimmage sessions are included. Meals are not included. Some camps include a camp t-shirt."
  - q: "Do you offer basketball camps for beginners?"
    a: "Absolutely. We have skill-tiered groups within each camp so beginners receive foundational instruction while more advanced players get pushed at their level."
---

## Basketball Camp in Fort Walton Beach, FL

FCP Sports runs structured basketball camps throughout the year in Fort Walton Beach, serving athletes from across the Emerald Coast — Destin, Niceville, Navarre, Crestview, and beyond.

Our camps are designed around **proven skill development progressions**, not just fun and games. Every day includes purposeful drills, competitive small-sided games, and full scrimmages with coach feedback.

### What Happens at FCP Sports Camp?

**Morning sessions** focus on individual skill work: ball handling, shooting mechanics, footwork, and defensive positioning. Athletes move through stations with dedicated coaches at each.

**Afternoon sessions** shift to competitive play: 3-on-3, 5-on-5, and situational drills that test what athletes learned in the morning. Coaches evaluate and correct in real time.

**End-of-camp** includes a parents' report card — written feedback on your athlete's strengths and the specific skills to work on before the next session.

### Who Should Attend?

- Beginners (ages 6-9) learning the basics of the game
- Developing players (ages 10-13) building competitive skills
- Serious players (ages 14-18) preparing for school or AAU tryouts
- Athletes from Bruner Middle, Ruckel Middle, Pryor Middle, Destin Middle, and other Emerald Coast schools

### Schools We Serve

Athletes from the following schools regularly attend our Fort Walton Beach basketball camps:
Annette P. Edwins Elementary, Liza Jackson Preparatory School, W.C. Pryor Middle School, Max Bruner Jr. Middle School, Clifford Meigs Middle School, Fort Walton Beach High School, and more.

[See all locations we serve →](/locations/fort-walton-beach/)
```

**Step 5: Create remaining 7 service content files**

Create the following files with the same front matter pattern, customized content for each:

- `content/services/basketball-training.md` — keyword: "basketball training near me", focus: position-specific skill development, weekly training schedules
- `content/services/basketball-lessons.md` — keyword: "basketball lessons fort walton beach", focus: 1-on-1 and small group, custom curriculum, video analysis
- `content/services/basketball-league.md` — keyword: "basketball league fort walton beach", focus: season format, standings, age divisions, registration windows
- `content/services/open-gym.md` — keyword: "open gym basketball fort walton beach", focus: schedule, drop-in pricing, rules, what to bring
- `content/services/gym-rental.md` — keyword: "basketball gym rental fort walton beach", focus: hourly/half-day/full-day rates, what's included, booking process
- `content/services/youth-basketball.md` — keyword: "youth basketball fort walton beach", focus: Little Ballers/Junior/Elite tier breakdown, parent FAQ, school schedule compatibility
- `content/services/summer-aau.md` — keyword: "AAU basketball florida panhandle", price: "$6,799", focus: all-inclusive package, tournament schedule, NCAA exposure windows, what's included

Each file follows this structure:
```markdown
---
title: "[Service] [City] | FCP Sports"
description: "[150-char unique description with keyword]"
h1: "[Service Name] [City]"
keyword: "[primary keyword]"
price: "[price or 'Contact for pricing']"
faq:
  - q: "[natural language question exactly as someone would type it]"
    a: "[complete helpful answer, 2-3 sentences]"
  [4 more Q&A pairs]
---
[500-700 words of unique, keyword-rich content]
[Internal links to 3 related pages]
[Schools/locations mentions where relevant]
```

**Step 6: Verify all service pages build**
```bash
hugo server
# Check http://localhost:1313/services/ — verify all 8 pages exist
```

**Step 7: Commit**
```bash
git add content/services/ layouts/services/
git commit -m "feat: add all 8 service pages with SEO content and FAQ schema"
```

---

### Task 15: Location page layout + all 7 location pages

**Files:**
- Create: `layouts/locations/single.html`
- Create: `content/locations/*.md` (7 files)

**Step 1: Create `layouts/locations/single.html`**
```html
{{ define "main" }}

<!-- Hero -->
<section class="bg-navy py-24 text-center">
  <div class="max-w-4xl mx-auto px-4">
    <span class="text-gold font-display tracking-widest text-sm uppercase">Emerald Coast Basketball</span>
    <h1 class="font-display text-6xl md:text-7xl text-white mt-3 mb-4">{{ .Params.h1 | default .Title }}</h1>
    <p class="text-white/70 text-lg max-w-2xl mx-auto">{{ .Description }}</p>
    <a href="/registration/" class="btn-primary mt-8 inline-block">Register Now</a>
  </div>
</section>

<!-- Map + Info -->
<section class="py-16 bg-white">
  <div class="max-w-7xl mx-auto px-4">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
      <!-- Map -->
      <div class="rounded-2xl overflow-hidden shadow-xl aspect-video">
        <iframe
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d111000!2d-86.6188!3d30.4057!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x88313e6d8f7b8473%3A0x3f3f3f3f3f3f3f3f!2sFCP+Sports!5e0!3m2!1sen!2sus!4v1"
          width="100%" height="100%"
          style="border:0"
          allowfullscreen loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          title="FCP Sports location map"
        ></iframe>
      </div>
      <!-- Info -->
      <div>
        <span class="section-tag">Getting Here From {{ .Params.city }}</span>
        <h2 class="section-heading">FCP Sports Is Your Local Basketball Facility</h2>
        <div class="prose prose-gray max-w-none mb-8">{{ .Content }}</div>
        {{ if .Params.drive_time }}
        <div class="bg-gold/10 border border-gold/30 rounded-xl p-4 text-sm text-navy mb-6">
          🚗 <strong>Drive time from {{ .Params.city }}:</strong> {{ .Params.drive_time }}
        </div>
        {{ end }}
      </div>
    </div>
  </div>
</section>

<!-- Schools we serve -->
{{ if .Params.schools }}
<section class="py-16 bg-gray-50">
  <div class="max-w-7xl mx-auto px-4">
    <span class="section-tag">School Community</span>
    <h2 class="section-heading">Is Your School on Our Roster?</h2>
    <p class="text-gray-600 mb-8 max-w-2xl">Athletes from these {{ .Params.city }} schools train at FCP Sports. Ask about our school partner discounts.</p>
    <div class="flex flex-wrap gap-3">
      {{ range .Params.schools }}
      <span class="bg-white border border-gray-200 rounded-full px-4 py-2 text-sm text-navy font-medium shadow-sm">🏫 {{ . }}</span>
      {{ end }}
    </div>
  </div>
</section>
{{ end }}

<!-- FAQ -->
{{ partial "faq-block.html" . }}

<!-- CTA -->
{{ partial "cta-section.html" . }}

{{ end }}
```

**Step 2: Create `content/locations/fort-walton-beach.md`**
```markdown
---
title: "Basketball Training Fort Walton Beach FL | FCP Sports"
description: "FCP Sports is Fort Walton Beach's premier basketball facility. Camps, training, leagues, open gym, and youth programs for athletes ages 5-18."
h1: "Basketball in Fort Walton Beach"
city: "Fort Walton Beach"
drive_time: "You're already here!"
schools:
  - "Annette P. Edwins Elementary"
  - "Liza Jackson Preparatory School"
  - "Florosa Elementary"
  - "Eglin Elementary"
  - "W.C. Pryor Middle School"
  - "Max Bruner Jr. Middle School"
  - "Clifford Meigs Middle School"
  - "Fort Walton Beach High School"
faq:
  - q: "Where is FCP Sports located in Fort Walton Beach?"
    a: "FCP Sports is located in Fort Walton Beach, FL 32547. We are easily accessible from throughout Okaloosa County and the surrounding Emerald Coast area."
  - q: "What basketball programs does FCP Sports offer in Fort Walton Beach?"
    a: "We offer basketball camps, skills training, private lessons, basketball leagues, open gym drop-in sessions, gym rentals, Summer AAU, and youth programs for all ages from K through 12th grade."
  - q: "Do you have basketball programs for elementary school kids in Fort Walton Beach?"
    a: "Yes! Our Little Ballers program (K-2nd grade) and Junior Program (3rd-5th grade) are specifically designed for elementary-age athletes. Athletes from Edwins Elementary, Liza Jackson Prep, Florosa Elementary, and Eglin Elementary all participate."
  - q: "Is there open gym basketball in Fort Walton Beach?"
    a: "Yes, FCP Sports offers open gym drop-in sessions throughout the week. Check our schedule or contact us for current open gym times."
  - q: "Can I rent a basketball gym in Fort Walton Beach?"
    a: "Absolutely. Our regulation basketball court is available for hourly, half-day, and full-day rentals for team practices, tryouts, private events, and birthday parties."
---

FCP Sports is Fort Walton Beach's only dedicated basketball development facility, serving athletes from across Okaloosa County and the Emerald Coast.

Whether your athlete is a kindergartner dribbling for the first time or a high schooler chasing a college scholarship, FCP Sports has a structured program designed for their exact stage of development.

**Programs available in Fort Walton Beach:**
- Basketball camps (multi-day, seasonal)
- Individual skills training (weekly sessions)
- Private 1-on-1 lessons
- Competitive basketball league
- Open gym drop-in access
- Gym rental for teams and events
- Summer AAU program ($6,799 all-inclusive)
- Youth programs: Little Ballers, Junior Program, Elite Youth
```

**Step 3: Create remaining 6 location files** using the same front matter pattern, each with:
- City-specific `drive_time` (e.g., Destin: "Approximately 15 minutes via US-98")
- `schools` array pulled from `data/schools.yaml` for that city
- 5 city-specific FAQ Q&As mentioning the city by name
- 200-400 words of unique content mentioning local landmarks/context
- Internal links to relevant service pages

Location files to create:
- `content/locations/destin.md` — drive_time: "~15 min via US-98 W"
- `content/locations/niceville.md` — drive_time: "~20 min via FL-85 S", mention Eglin AFB families
- `content/locations/navarre.md` — drive_time: "~25 min via US-98 E"
- `content/locations/crestview.md` — drive_time: "~30 min via FL-85 S"
- `content/locations/pensacola.md` — drive_time: "~45 min via US-98 E"
- `content/locations/panama-city.md` — drive_time: "~1 hr via US-98 E"

**Step 4: Verify**
```bash
hugo server
# Check http://localhost:1313/locations/ — verify 7 pages exist with maps
```

**Step 5: Commit**
```bash
git add content/locations/ layouts/locations/
git commit -m "feat: add all 7 location pages with school targeting and maps"
```

---

### Task 16: Youth program pages (3 pages)

**Files:**
- Create: `layouts/youth/single.html`
- Create: `content/youth/elementary-school-basketball.md`
- Create: `content/youth/middle-school-basketball.md`
- Create: `content/youth/high-school-basketball.md`

**Step 1: Create `layouts/youth/single.html`**

Reuse same structure as `layouts/services/single.html` — copy it and adjust hero color to a slightly different shade if desired.

```bash
cp layouts/services/single.html layouts/youth/single.html
```

**Step 2: Create `content/youth/elementary-school-basketball.md`**
```markdown
---
title: "Elementary School Basketball Fort Walton Beach | FCP Sports"
description: "Basketball programs for K-5th grade athletes in Fort Walton Beach and across the Emerald Coast. Little Ballers (K-2) and Junior Program (3rd-5th) at FCP Sports."
h1: "Elementary School Basketball Programs"
keyword: "elementary school basketball fort walton beach"
faq:
  - q: "What age is too young to start basketball training?"
    a: "We accept athletes as young as 5 years old (Kindergarten) in our Little Ballers program. At this age, we focus on fun, coordination, and basic movement skills — not competition. There is no age too young to learn to love the game."
  - q: "Do you have basketball for kids at Edwins Elementary or Liza Jackson Prep?"
    a: "Yes! Many of our Little Ballers and Junior Program athletes attend Annette P. Edwins Elementary and Liza Jackson Preparatory School. We schedule sessions with school calendars in mind."
  - q: "What is the Little Ballers program?"
    a: "Little Ballers is our K-2nd grade basketball program for ages 5-8. It focuses on fundamental movement, dribbling, passing, shooting basics, and most importantly — having fun and falling in love with basketball."
  - q: "My 4th grader has never played basketball. Is it too late to start?"
    a: "Not at all. Our Junior Program (3rd-5th grade) is designed to meet athletes where they are. We group kids by skill level, not just age, so a new player won't be thrown in with experienced travel players."
  - q: "Do elementary school basketball programs in Fort Walton Beach run year-round?"
    a: "Yes, FCP Sports runs youth basketball programs throughout the year, with seasonal camp intensives in summer and spring break. Contact us for the current schedule."
---

## Basketball for Elementary School Athletes on the Emerald Coast

FCP Sports offers structured basketball programming for elementary-age athletes from **Kindergarten through 5th grade** across Fort Walton Beach, Destin, Niceville, Navarre, and the surrounding Emerald Coast area.

### Little Ballers (K – 2nd Grade, Ages 5-8)
[content continues...]

### Junior Program (3rd – 5th Grade, Ages 8-11)
[content continues...]

### Schools We Serve
[list of elementary schools across all 7 cities]
```

**Step 3: Create `content/youth/middle-school-basketball.md`** and `content/youth/high-school-basketball.md` following same pattern.

Middle school focuses on: competitive prep, AAU introduction, school team tryout prep, mentions all middle schools by name across all 7 cities.

High school focuses on: recruiting prep, college exposure, NCAA eligibility rules, AAU national circuit, film review, GPA/eligibility education.

**Step 4: Commit**
```bash
git add content/youth/ layouts/youth/
git commit -m "feat: add youth program pages (elementary, middle, high school)"
```

---

### Task 17: Guide pages (gated lead magnets)

**Files:**
- Create: `layouts/guides/single.html`
- Create: `content/guides/*.md` (5 files including thank-you)

**Step 1: Create `layouts/guides/single.html`**
```html
{{ define "main" }}

<section class="bg-navy py-16 text-center">
  <div class="max-w-3xl mx-auto px-4">
    <span class="text-gold font-display tracking-widest text-sm uppercase">Free Resource</span>
    <h1 class="font-display text-5xl md:text-6xl text-white mt-3 mb-4">{{ .Title }}</h1>
    <p class="text-white/70 text-lg">{{ .Description }}</p>
  </div>
</section>

<section class="py-20 bg-gray-50">
  <div class="max-w-6xl mx-auto px-4">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
      <!-- Guide preview / benefits -->
      <div class="prose prose-lg max-w-none prose-headings:font-display prose-headings:text-navy">
        {{ .Content }}
      </div>
      <!-- GHL form -->
      <div class="bg-white rounded-2xl shadow-xl p-8 sticky top-28">
        <h2 class="font-display text-2xl text-navy mb-2">Get Instant Access</h2>
        <p class="text-gray-500 text-sm mb-6">Enter your email below and we'll send the guide directly to your inbox.</p>
        {{ partial "ghl-form.html" (dict "formId" (.Params.ghl_form_id | default site.Params.ghl_form_id)) }}
        <p class="text-xs text-gray-400 mt-4 text-center">No spam ever. Unsubscribe with one click.</p>
      </div>
    </div>
  </div>
</section>

{{ end }}
```

**Step 2: Create `content/guides/youth-basketball-parents-guide.md`**
```markdown
---
title: "Youth Basketball Parent's Guide — Free Download"
description: "Everything Emerald Coast parents need to know about youth basketball programs, AAU basics, and how to support your athlete's development."
ghl_form_id: "GUIDE_FORM_ID_HERE"
---

## What's Inside This Free Guide

After working with 500+ Emerald Coast families, we put together the questions every parent asks — answered clearly and honestly.

### What You'll Learn:

**Section 1: Choosing the Right Program**
- Rec league vs. skills training vs. travel team — what's right for your kid's age and goals
- Red flags to watch for when evaluating youth basketball programs
- The questions to ask any coach before enrolling

**Section 2: AAU Basketball 101**
- What AAU actually means and how it works
- When should your child start AAU (hint: not as early as most people think)
- The real cost of AAU — what families don't know going in

**Section 3: Supporting Your Athlete at Home**
- How to talk about performance without adding pressure
- Simple at-home drills for ages 5-18
- The parent behaviors that coaches wish they could tell you directly

**Section 4: The Recruiting Timeline**
- When does the recruiting process actually start?
- What college coaches are looking for beyond stats
- How to build a recruiting profile and get exposure
```

**Step 3: Create `content/guides/thank-you.md`**
```markdown
---
title: "You're In! Check Your Email | FCP Sports"
description: "Your free guide is on its way. Here's what to do next."
---
```

Create a custom layout for thank-you that fires the GA4 conversion event and suppresses the exit popup. Create `layouts/guides/thank-you.html`:

```html
{{ define "main" }}
<section class="min-h-screen bg-gray-50 flex items-center justify-center py-24">
  <div class="max-w-2xl mx-auto px-4 text-center">
    <div class="text-6xl mb-6">🎉</div>
    <h1 class="font-display text-5xl text-navy mb-4">YOU'RE ALL SET!</h1>
    <p class="text-gray-600 text-lg mb-8">Your free guide is heading to your inbox right now. While you wait — here's your next step:</p>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
      <a href="/registration/" class="card p-6 hover:-translate-y-1 transition-all">
        <div class="text-3xl mb-3">📋</div>
        <h3 class="font-display text-lg text-navy">Register</h3>
        <p class="text-gray-500 text-sm">Secure your spot in a program</p>
      </a>
      <a href="/services/basketball-camp/" class="card p-6 hover:-translate-y-1 transition-all">
        <div class="text-3xl mb-3">🏕️</div>
        <h3 class="font-display text-lg text-navy">View Camps</h3>
        <p class="text-gray-500 text-sm">See upcoming camp dates</p>
      </a>
      <a href="/contact/" class="card p-6 hover:-translate-y-1 transition-all">
        <div class="text-3xl mb-3">💬</div>
        <h3 class="font-display text-lg text-navy">Ask Us Anything</h3>
        <p class="text-gray-500 text-sm">Talk to a real coach</p>
      </a>
    </div>
  </div>
</section>
<!-- GA4 conversion event -->
<script>gtag('event', 'guide_download', { event_category: 'lead', event_label: 'parent_guide' });</script>
{{ end }}
```

**Step 4: Create remaining guide content files:**
- `content/guides/how-to-choose-a-basketball-camp.md`
- `content/guides/aau-basketball-101.md`
- `content/guides/college-recruiting-roadmap.md`

**Step 5: Commit**
```bash
git add content/guides/ layouts/guides/
git commit -m "feat: add gated guide pages with GHL forms and thank-you conversion page"
```

---

### Task 18: Instructional pages + Blog

**Files:**
- Create: `layouts/learn/single.html`
- Create: `content/learn/*.md` (3 files)
- Create: `content/blog/_index.md`
- Create: `content/blog/*.md` (4 starter posts)
- Create: `layouts/_default/list.html`

**Step 1: Create `layouts/learn/single.html`**
```html
{{ define "main" }}
<article class="py-24 bg-white">
  <div class="max-w-4xl mx-auto px-4">
    <nav class="text-sm text-gray-400 mb-8">
      <a href="/" class="hover:text-gold">Home</a> /
      <a href="/learn/" class="hover:text-gold">Learn</a> /
      <span>{{ .Title }}</span>
    </nav>
    <h1 class="font-display text-5xl md:text-6xl text-navy mb-6">{{ .Title }}</h1>
    <p class="text-xl text-gray-500 mb-12 border-b pb-12">{{ .Description }}</p>
    <div class="prose prose-xl max-w-none prose-headings:font-display prose-headings:text-navy prose-a:text-gold">
      {{ .Content }}
    </div>
  </div>
</article>
{{ partial "cta-section.html" . }}
{{ partial "faq-block.html" . }}
{{ end }}
```

**Step 2: Create instructional content files:**

`content/learn/what-is-aau-basketball.md` — 800-word definitive guide answering: what is AAU, how does it work in Florida, what age to start, cost, what college coaches think of it, how FCP Sports feeds into AAU.

`content/learn/basketball-positions-guide.md` — 600-word guide: point guard, shooting guard, small forward, power forward, center — roles, skills needed, training focus at FCP Sports.

`content/learn/how-to-improve-basketball-skills.md` — 700-word HowTo guide with schema: specific drills, frequency, what to practice at home, when to get a coach.

**Step 3: Create blog index and 4 starter posts**

`content/blog/_index.md`:
```markdown
---
title: "Basketball Blog | FCP Sports Emerald Coast"
description: "Basketball tips, training advice, AAU guides, and local sports news for Emerald Coast families from FCP Sports in Fort Walton Beach, FL."
---
```

4 starter posts (200-500 words each, keyword-targeted):
1. `content/blog/basketball-camp-fort-walton-beach-what-to-expect.md`
2. `content/blog/aau-basketball-florida-panhandle-guide.md`
3. `content/blog/youth-basketball-benefits-kids.md`
4. `content/blog/how-to-improve-your-childs-basketball-at-home.md`

**Step 4: Create `layouts/_default/list.html`** (blog list page)
```html
{{ define "main" }}
<section class="bg-navy py-20 text-center">
  <div class="max-w-3xl mx-auto px-4">
    <h1 class="font-display text-6xl text-white">{{ .Title }}</h1>
    <p class="text-white/70 mt-4">{{ .Description }}</p>
  </div>
</section>
<section class="py-20 bg-white">
  <div class="max-w-7xl mx-auto px-4">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {{ range .Pages }}
      <a href="{{ .Permalink }}" class="card group hover:-translate-y-1 transition-all duration-300">
        <div class="p-6">
          <p class="text-gold text-xs font-semibold uppercase tracking-wider mb-2">{{ .Date.Format "January 2, 2006" }}</p>
          <h2 class="font-display text-2xl text-navy mb-3 group-hover:text-gold transition-colors">{{ .Title }}</h2>
          <p class="text-gray-500 text-sm leading-relaxed">{{ .Description }}</p>
          <span class="text-gold text-sm font-semibold mt-4 inline-block">Read More →</span>
        </div>
      </a>
      {{ end }}
    </div>
  </div>
</section>
{{ end }}
```

**Step 5: Commit**
```bash
git add content/learn/ content/blog/ layouts/learn/ layouts/_default/list.html
git commit -m "feat: add instructional pages and blog with 4 starter posts"
```

---

### Task 19: Core pages (About, Coaches, Pricing, Registration, Contact, 404)

**Files:**
- Create: `layouts/_default/single.html`
- Create: `content/about.md`
- Create: `content/coaches.md`
- Create: `content/pricing.md`
- Create: `content/registration.md`
- Create: `content/contact.md`
- Create: `layouts/404.html`

**Step 1: Create `layouts/_default/single.html`**
```html
{{ define "main" }}
<section class="bg-navy py-20 text-center">
  <div class="max-w-3xl mx-auto px-4">
    <h1 class="font-display text-6xl text-white">{{ .Title }}</h1>
    {{ with .Description }}<p class="text-white/70 mt-4 text-lg">{{ . }}</p>{{ end }}
  </div>
</section>
<section class="py-20 bg-white">
  <div class="max-w-4xl mx-auto px-4 prose prose-lg max-w-none prose-headings:font-display prose-headings:text-navy prose-a:text-gold">
    {{ .Content }}
  </div>
</section>
{{ partial "cta-section.html" . }}
{{ end }}
```

**Step 2: Create `content/pricing.md`**
```markdown
---
title: "Program Pricing | FCP Sports Fort Walton Beach"
description: "Transparent pricing for basketball camps, training, lessons, leagues, open gym, and gym rentals at FCP Sports on the Emerald Coast."
---
[Use data/pricing.yaml to render pricing cards — create a pricing-specific layout]
```

Create `layouts/pricing/single.html` or override in the default to loop through `site.Data.pricing` and display cards.

**Step 3: Create `content/registration.md`**
```markdown
---
title: "Register for Basketball Programs | FCP Sports"
description: "Register for FCP Sports basketball camps, training, leagues, and youth programs in Fort Walton Beach, FL."
---
```

Create `layouts/registration/single.html` that renders a full-width GHL registration form.

**Step 4: Create `content/contact.md`**
```markdown
---
title: "Contact FCP Sports | Fort Walton Beach Basketball"
description: "Get in touch with FCP Sports. Ask about programs, pricing, scheduling, or gym rentals. We're located in Fort Walton Beach, FL."
---
```

Contact layout: 2-column grid — GHL form on left, Google Maps + NAP info on right.

**Step 5: Create `layouts/404.html`**
```html
{{ define "main" }}
<section class="min-h-screen bg-navy flex items-center justify-center text-center px-4">
  <div>
    <div class="font-display text-[180px] text-gold/20 leading-none">404</div>
    <h1 class="font-display text-5xl text-white -mt-8 mb-4">PAGE NOT FOUND</h1>
    <p class="text-white/60 text-lg mb-8">Looks like this play got called back. Let's get you back on the court.</p>
    <a href="/" class="btn-primary">Back to Home</a>
  </div>
</section>
{{ end }}
```

**Step 6: Commit**
```bash
git add content/about.md content/coaches.md content/pricing.md content/registration.md content/contact.md layouts/404.html layouts/_default/single.html
git commit -m "feat: add core pages (about, coaches, pricing, registration, contact, 404)"
```

---

## PHASE 6: SEO Assets

### Task 20: robots.txt, sitemap, and .gitignore

**Step 1: Create `static/robots.txt`**
```
User-agent: *
Allow: /
Disallow: /guides/thank-you/

Sitemap: https://fcpsports.org/sitemap.xml
```

**Step 2: Verify Hugo auto-generates sitemap**

Hugo generates `/sitemap.xml` automatically. Confirm in `hugo.toml`:
```toml
# Sitemap is auto-generated. No extra config needed.
```

**Step 3: Update `.gitignore`**
```
public/
.hugo_build.lock
node_modules/
.DS_Store
.claude/
.playwright-mcp/
```

**Step 4: Commit**
```bash
git add static/robots.txt .gitignore
git commit -m "chore: add robots.txt and update gitignore for Hugo"
```

---

## PHASE 7: Build Verification + Deploy

### Task 21: Full production build test

**Step 1: Install dependencies**
```bash
cd /Users/fcp/fcpsports
npm ci
```

**Step 2: Run production build**
```bash
hugo --minify
# Expected: 38+ pages built in < 500ms, 0 errors
```

**Step 3: Check for errors**
```bash
hugo --minify 2>&1 | grep -i "error\|warn"
# Expected: no errors
```

**Step 4: Count pages built**
```bash
hugo --minify 2>&1 | grep "pages"
# Expected: 38+ pages
```

**Step 5: Verify `public/` structure**
```bash
ls public/
ls public/services/
ls public/locations/
ls public/guides/
```

---

### Task 22: Push to GitHub + trigger Netlify deploy

**Step 1: Stage all changes**
```bash
cd /Users/fcp/fcpsports
git status
git add -A
git commit -m "feat: complete Hugo rebuild — 38 pages, Tailwind, GHL, full SEO"
```

**Step 2: Push to GitHub**
```bash
git push origin main
```

**Step 3: Monitor Netlify build**
```bash
# Check Netlify dashboard or:
curl -s https://fcpsports.netlify.app | grep -i "fcp sports"
# Expected: site title in response within 2-3 minutes of push
```

**Step 4: Verify all key pages live**
```bash
for path in "/" "/services/basketball-camp/" "/locations/fort-walton-beach/" "/guides/youth-basketball-parents-guide/" "/blog/"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "https://fcpsports.netlify.app$path")
  echo "$path → $status"
done
# Expected: all 200
```

---

### Task 23: Complete Cloudflare DNS changes (in progress from prior session)

**Goal:** Point fcpsports.org → fcpsports.netlify.app, fix SSL to "Full" mode.

**Step 1:** Navigate to `https://dash.cloudflare.com` → fcpsports.org → DNS → Records

**Step 2:** Delete the `fcpsports.org` A record pointing to `23.229.214.0`

**Step 3:** Add CNAME record:
- Name: `fcpsports.org` (or `@`)
- Target: `fcpsports.netlify.app`
- Proxy: On (orange cloud)

**Step 4:** Add/update `www` CNAME:
- Name: `www`
- Target: `fcpsports.netlify.app`
- Proxy: On

**Step 5:** Navigate to SSL/TLS → Overview → Change from "Full (strict)" → **"Full"**

**Step 6:** In Netlify → fcpsports project → Domain management → Add custom domain → `fcpsports.org` and `www.fcpsports.org`

**Step 7:** Verify after propagation (5-30 min):
```bash
curl -I https://fcpsports.org
# Expected: HTTP/2 200
```

---

### Task 24: Add Netlify custom domain

**Step 1:** Log into Netlify → Sites → fcpsports → Domain management

**Step 2:** Click "Add custom domain" → enter `fcpsports.org`

**Step 3:** Add alias `www.fcpsports.org`

**Step 4:** Netlify will auto-provision Let's Encrypt SSL for the custom domain

---

## PHASE 8: Post-Launch

### Task 25: Google Search Console + GBP

**Step 1:** Submit `https://fcpsports.org` to Google Search Console

**Step 2:** Verify via DNS TXT record or HTML file in `static/`

**Step 3:** Submit sitemap: `https://fcpsports.org/sitemap.xml`

**Step 4:** Link Google Business Profile website to `https://fcpsports.org`

**Step 5:** Update GBP description to match site content and target keywords

---

### Task 26: Summer AAU — pull content from floridacoastalprep.com

**Step 1:** Fetch AAU page content
```bash
curl -s https://summer.floridacoastalprep.com | grep -i "aau\|summer\|price\|tournament\|6799"
```

**Step 2:** Extract: program details, pricing breakdown, tournament schedule, what's included, testimonials

**Step 3:** Rewrite into `content/services/summer-aau.md` with full SEO treatment

**Step 4:** Commit
```bash
git add content/services/summer-aau.md
git commit -m "feat: populate summer AAU page with floridacoastalprep.com content"
```

---

## Summary

| Phase | Tasks | Pages Built | Commits |
|---|---|---|---|
| 1: Setup | 1-4 | 0 | 4 |
| 2: Data | 5 | 0 | 1 |
| 3: Layouts | 6-12 | 0 | 3 |
| 4: Homepage | 13 | 1 | 1 |
| 5: Content | 14-19 | 37 | 6 |
| 6: SEO Assets | 20 | 0 | 1 |
| 7: Deploy | 21-24 | — | 1 |
| 8: Post-Launch | 25-26 | — | 1 |
| **Total** | **26** | **38** | **18** |

**Definition of done:** `curl -I https://fcpsports.org` returns HTTP/2 200, all 38 pages indexed in Search Console, GHL forms capturing leads, exit intent popup live.
