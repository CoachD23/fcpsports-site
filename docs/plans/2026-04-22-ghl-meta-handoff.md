# GHL + Meta + Token Handoff — Things That Need Your Hands

Date: 2026-04-22
Status: Requires user action in external systems

Everything below has the code paths wired up on fcpsports.org. What's missing is the **external configuration** — GHL workflows, Meta ad audiences, a fresh API token. I can't configure these remotely because my GHL token is invalid and Meta Ads Manager has no API access in this environment.

---

## 🔑 Priority 1 — Rotate the GHL API token (5 min)

The Private Integration token I have stored (`pit-0b589b91-…`) returns `Invalid Private Integration token` on every call. Needs to be rotated.

**Steps:**

1. Log in to app.gohighlevel.com → switch to **FCP Sports** location
2. Settings → Integrations → Private Integrations
3. Click **New Token**
4. Scopes required:
   - `contacts.readonly`
   - `contacts.write`
   - `opportunities.readonly`
   - `opportunities.write`
   - `tags.readonly`
   - `tags.write`
   - `businesses.readonly`
5. Copy the token (starts with `pit-…`)
6. **Two places to update it:**
   - **Netlify dashboard** → Site configuration → Environment variables → set `GHL_API_KEY` = new token. Trigger a redeploy.
   - **Send the token to me** in the next message so I can update my memory file and query GHL directly (contact counts, lead attribution, etc)

Why it matters: without this, I can't tell you how many leads you have, confirm registrations sync properly, or debug flow issues.

---

## 📱 Priority 2 — Set up GHL workflows (3 workflows, 45 min total)

All three workflows use data we already capture. Build them in GHL: **Automation → Workflows → New Workflow**.

### Workflow A — 48-hour camp reminder

**Trigger:** Contact Tag Added = `camp-registered`
**Delay:** Until 2 days before a custom date field value

Wait — GHL doesn't natively support "X days before a date field" as a delay. Two options:

**Option A1 (simplest):** Send the reminder 3 days after registration. Not perfect but works.
- Trigger: Tag Added = `camp-registered`
- Wait: 3 days
- Action: Send Email + SMS

**Option A2 (better):** Store the camp start date as a custom contact field, then use GHL's date-based trigger.
- Add Custom Field: `Camp Start Date` (date type) on Contact
- Update register-camp.js to set this field (I can do this — just say the word)
- Trigger: Contact Custom Field `Camp Start Date` is 2 days away
- Action: Send Email + SMS

**Email template:**
```
Subject: 2 days until camp — what to bring

Hey {{contact.first_name}},

Just a heads up — {{contact.camper_name}}'s camp starts Monday.

What to bring:
✓ Court shoes (clean, non-marking soles)
✓ Athletic clothes
✓ Water bottle
✓ Packed lunch

Drop-off: 9:15 AM at 33 Jet Drive NW
Pickup: 2:00 PM same spot

Questions? Reply to this email or call 850.961.2323.

See you Monday,
FCP Sports
```

**SMS template:**
```
Hi {{contact.first_name}}! Reminder: {{contact.camper_name}}'s FCP Sports camp starts Monday. Drop-off 9:15 AM, pickup 2 PM. Bring court shoes + lunch + water. Questions? Reply to this text. -FCP Sports
```

### Workflow B — Abandoned cart (partial lead follow-up)

**Trigger:** Contact Tag Added = `camp-partial`
**Condition:** Tag `camp-registered` is NOT present (so we don't harass people who completed)

**Step 1 — 2 hours after:**
Email subject: "Still interested in [CAMP NAME]? Your spot is saved."
Body:
```
Hey {{contact.first_name}},

Saw you started registering for camp. Still interested? Your info is saved — you just need to finish.

[BUTTON: Complete Registration → https://fcpsports.org/register/?camp={{contact.camp_week_id}}]

If you have questions first, reply here or call 850.961.2323.

FCP Sports
```

**Step 2 — 1 day after:**
Email subject: "Camp spots filling up"
Body:
```
Hey {{contact.first_name}},

{{contact.camp_week}} has limited spots. Want us to hold yours?

[BUTTON: Finish Registration]

Want to chat first? Reply and we'll call you back.

FCP Sports
```

**Step 3 — 3 days after:**
Email subject: "Last call — or we'll let it go"
Body:
```
Hey {{contact.first_name}},

We'll take you off the waitlist if we don't hear back. No worries either way — just want to make sure we're not holding a spot you don't need.

Reply YES to lock it in, or ignore this and we'll move on.

FCP Sports
```

**Goal:** recover 15-25% of abandoned carts.

### Workflow C — Post-registration nurture sequence

**Trigger:** Contact Tag Added = `camp-registered`

**Day 1 (same day) — what to expect email:**
Subject: "You're in — here's what happens next"
Body: intro to coaches, week-one schedule, drop-off logistics, parent handbook link

**Day 7 — multi-week + sibling upsell:**
Subject: "Want to add another week (or a sibling)?"
Body:
```
Hey {{contact.first_name}},

Quick note — families who add a second camp week save $20 per week. And siblings save $20 off the second child's registration.

[BUTTON: Add Another Week → /register/?camp={{contact.camp_week_id}}&promo=ADD20]
[BUTTON: Register a Sibling → /register/?camp={{contact.camp_week_id}}&promo=SIBLING20]

Spots go first-come-first-served.

FCP Sports
```

**Day 14 — review/referral request (AFTER camp ends):**
Subject: "How'd {{contact.camper_name}} do at camp?"
Body:
```
Hey {{contact.first_name}},

Hope {{contact.camper_name}} had a great week.

Two quick things:
1. If you have 60 seconds, would you leave us a Google review?
[BUTTON: Leave a Review → https://g.page/fcpsports/review]

2. Know another family who'd be a good fit? Send them your referral link:
https://fcpsports.org/?ref={{contact.first_name}}

Thanks for being part of the gym.

FCP Sports
```

---

## 📈 Priority 3 — Set up Meta retargeting (20 min)

Meta Pixel is already firing on every page. Now build the audiences.

**In Meta Ads Manager → Audiences → Custom Audiences → Create Audience → Website:**

### Audience 1 — Camp register visitors (didn't convert)

- **Rule 1:** People who visited pages containing URL: `/register/?camp=`
- **Rule 2:** EXCLUDE people who triggered `Purchase` event
- Duration: **30 days**
- Name: `Camp Register — Abandoned`

### Audience 2 — Camp viewers (high intent)

- **Rule 1:** People who visited pages containing URL: `/camps/`
- EXCLUDE Audience 1 registrants
- Duration: **14 days**
- Name: `Camp Browsers`

### Audience 3 — Youth league browsers

- **Rule 1:** People who visited pages containing URL: `/youth-league/`
- Duration: **30 days**
- Name: `League Browsers`

### Audience 4 — Existing camper parents (lookalike seed)

- **Rule 1:** People who triggered `Purchase` event
- Duration: **180 days**
- Name: `Camp Purchasers`

Then create a **Lookalike Audience** from `Camp Purchasers` targeting 1-3% of users in Florida panhandle. Once you have 100+ purchasers, this becomes your best cold-traffic source.

**Ad campaigns to run:**

1. **Retargeting ad to Audience 1** — Budget: $5/day. Creative: photo of camp action + "Still thinking about it? Session 4 starts July 13. $149." Link to `/register/?camp=summer-s4-jul13&utm_source=facebook&utm_campaign=retarget_abandoned`

2. **Retargeting ad to Audience 2** — Budget: $3/day. Creative: "See all 10 summer camps — from $79." Link to `/camps/?utm_source=facebook&utm_campaign=retarget_browsers`

3. **Lookalike ad (cold)** — Budget: $10/day. Creative: testimonial video or action shot. Link to `/camps/?utm_source=facebook&utm_campaign=cold_lookalike`

---

## 💳 Priority 4 — Payment flow smoketest (20 min, one-time)

Before pushing any ads that drive real parents to `/register/`, verify the full pipeline works end-to-end.

**Option A — Production test with a $1 camp:**

Add a test camp to `data/camps.yaml`:
```yaml
- id: smoketest-camp
  name: "Internal Test Camp"
  summary: "Do not register — internal test"
  start_date: "2030-01-01"
  end_date: "2030-01-05"
  dates_display: "Internal only"
  days: "Mon–Fri"
  times: "Internal"
  hours: "Internal"
  grades: "Internal"
  age_min: 5
  age_max: 99
  price: 1
  active: true
```

Then:
1. Go to `https://fcpsports.org/register/?camp=smoketest-camp`
2. Fill out with real info
3. Pay with YOUR card ($1)
4. Verify all downstream:
   - ✅ Email confirmation in your inbox
   - ✅ New row in Airtable `Camp_Registrations` table
   - ✅ New GHL contact with `camp-registered` + `camp-smoketest-camp` tags + attribution source
   - ✅ Netlify function log shows `[register-camp] Payment approved: $1 txn=…`
5. Refund yourself in Authorize.net merchant dashboard
6. Remove the test camp from `data/camps.yaml`, push

**Option B — Authorize.net sandbox mode:**

1. In Netlify → env vars → add `AUTHNET_ENV=sandbox`
2. Rebuild site
3. Register with sandbox card `4111 1111 1111 1111`, exp `12/2030`, CVV `123`
4. Sandbox mode logs the transaction without charging anything
5. Verify downstream (GHL tag, Airtable row, email)
6. Remove `AUTHNET_ENV` env var (or set to blank) to re-enable production mode

**I recommend Option A.** Sandbox mode sometimes behaves differently than production. A $1 real test with a refund gives you the most confidence.

---

## 📊 Priority 5 — Set the ADMIN_PASSWORD env var (2 min)

The new `/admin/` dashboard requires a password.

1. Netlify → Site configuration → Environment variables → **New variable**
2. Key: `ADMIN_PASSWORD`
3. Value: (something long, like `fcpsports-dashboard-2026-9xR4vP8`)
4. Click Save
5. Trigger a redeploy
6. Visit `https://fcpsports.org/admin/` → enter password → see stats

Password is validated server-side with `crypto.timingSafeEqual` (constant-time comparison — can't be brute-forced). Rate limit: 3 attempts/min per IP.

---

## Summary — what's wired up vs what you need to do

| # | Item | Code wired? | Needs your action? |
|---|------|-------------|---------------------|
| 2 | Payment flow end-to-end | ✅ Yes | Test with $1 real card or sandbox |
| 3 | 48hr reminder workflow | ⚠️ Code path exists (tags, fields) | Build GHL workflow |
| 5 | Abandoned-cart sequence | ⚠️ Code path exists (`camp-partial` tag) | Build GHL workflow |
| 6 | Post-registration nurture | ⚠️ Code path exists (`camp-registered` tag) | Build GHL workflow |
| 8 | Camp Event schema | ✅ Yes | Nothing — already live |
| 9 | Meta retargeting | ⚠️ Pixel fires on `Purchase` event now | Build Meta audiences + ads |
| 10 | Conversion tracking | ✅ Yes | Verify in Google Ads + Meta reporting after first ad |
| 11 | GHL token rotation | ❌ Needs you | Generate new token, update Netlify + send to me |
| 13 | Admin dashboard | ✅ Yes | Set `ADMIN_PASSWORD` env var in Netlify |
| 14 | Security headers + img dims + H2 dedup | ✅ Yes | Nothing — already live |

---

## Recommended sequence

1. **Today (30 min):**
   - Rotate GHL token + send me the new one
   - Set `ADMIN_PASSWORD` env var
   - Run the $1 smoketest on Option A
   - Visit /admin/ and confirm data appears

2. **This week (1 hour):**
   - Build the 3 GHL workflows (48hr reminder, abandoned cart, post-reg sequence)
   - Write email copy in GHL templates section

3. **Next week (1 hour):**
   - Build the 4 Meta audiences
   - Launch one $5/day retargeting campaign to test attribution

4. **Ongoing:**
   - Check /admin/ daily for registrations
   - Refine email copy based on what parents ask

Every new paid registration from here on fires Purchase conversions in both Google Ads and Meta automatically, so once ads are live you'll have clean attribution data immediately.
