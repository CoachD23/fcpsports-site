---
hero_image: /images/fcp-hero-league-game.jpg
title: "Adult Men's Basketball League Fort Walton Beach | FCP Sports"
description: "FCP Sports adult men's 5v5 basketball league forming now. Sundays, 6–9 PM. $120/player or $600/team. Fort Walton Beach. Join the waitlist."
h1: "FCP Men's League"
keyword: "adult basketball league fort walton beach"
age_range: "18+"
price: "$120/player · $600/team"
frequency: "Sundays, 6–9 PM"
program_name: "Men's League"
ghl_tag: "compete"
course_type: "adult basketball league"
summary_card:
  dates: "Launching Spring 2026 (pending waitlist)"
  days: "Sundays, 6:00–9:00 PM"
  ages: "18+"
  price: "$120/player · $600/team"
  note: "6-week regular season + playoff · Waitlist open"
  register_url: "/registration/"
faq:
  - q: "When does the league start?"
    a: "First season launches once we hit 40+ player commitments on the waitlist. Target: Spring 2026. Join the waitlist and we'll email you when the season is confirmed with exact dates."
  - q: "What's the format?"
    a: "5-on-5, full-court, standard basketball rules. 8 teams per session. 6-week regular season + single-elimination playoff on week 7. One game per Sunday."
  - q: "Can I register as an individual or do I need a team?"
    a: "Both. $120/player gets you placed on a balanced team. $600/team gets you 8 roster spots (you fill them)."
  - q: "Are there refs?"
    a: "A scorekeeper staffs the table every week. Games self-officiate or rotate volunteer refs from off-court teams. Keeps league costs down and registration prices honest."
  - q: "What's included in the price?"
    a: "6 regular-season games + playoff night, scorekeeper, scoreboard, and use of the 14,000 sq ft climate-controlled facility."
  - q: "What time on Sundays?"
    a: "6:00–9:00 PM. Two games per night (6:00–7:30 and 7:30–9:00), teams rotate weekly."
  - q: "Is there a Women's league?"
    a: "Not currently. If there's demand, we'll build one — email info@fcpsports.org to express interest."
  - q: "Is there a 3-on-3 option?"
    a: "We may run a half-court 3v3 tournament later in the year. The Men's League is a 5v5 full-court format."
---

## FCP Men's League — Sundays, Full Court, Real Ball

Fort Walton Beach has rec leagues, church leagues, and guys who miss playing real basketball. We're building a league where grown men who still have game can actually hoop.

### The Setup

- **5-on-5 full court** on our regulation hardwood
- **8 teams per session**, 6-week regular season + playoff night
- **Sundays, 6:00–9:00 PM** — after family time, before Monday morning
- **Two games per Sunday** — one at 6:00, one at 7:30. Teams rotate weekly
- **Scorekeeper staffs the table** — keeps things moving without the overhead of full refs

### Who This Is For

- Former HS/college players who still want to compete
- Guys who played YMCA or church league and want a real gym
- Active-duty military and DoD from Eglin/Hurlburt looking for Sunday pickup that isn't actually pickup
- Anyone 18+ who can still run

### Pricing

| Registration Type | Price | What You Get |
|---|---|---|
| **Individual Player** | **$120** | Placed on a balanced team by skill assessment |
| **Full Team** | **$600** | 8 roster spots, fill them yourself, guaranteed squad continuity |

### Format

**Regular Season:** 6 weeks, 1 game per Sunday per team (24 minutes running clock, stops last 2 minutes)
**Playoff Night:** Single-elimination bracket, all 8 teams compete
**Tie-breakers:** Head-to-head → point differential → coin flip (we're not precious)

### Facility

14,000 sq ft climate-controlled, regulation hardwood, scoreboard with shot clock, PA system. 33 Jet Drive NW, Fort Walton Beach. Free parking.

## Status: Waitlist Open

We're building the league based on real demand. Once we hit **40+ committed players** (5 full teams), we lock in a start date and roster everyone.

### Join the Waitlist

Drop your info below and we'll email when the first season is confirmed.

<form id="mens-league-waitlist" class="bg-white border border-gray-200 rounded-2xl p-6 max-w-lg mx-auto space-y-3" onsubmit="return submitMensWaitlist(event);">
  <div>
    <label for="ml-name" class="block text-sm font-semibold text-navy mb-1">Name</label>
    <input type="text" id="ml-name" name="name" required class="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm" placeholder="First and last">
  </div>
  <div>
    <label for="ml-email" class="block text-sm font-semibold text-navy mb-1">Email</label>
    <input type="email" id="ml-email" name="email" required class="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm" placeholder="you@email.com">
  </div>
  <div>
    <label for="ml-phone" class="block text-sm font-semibold text-navy mb-1">Phone</label>
    <input type="tel" id="ml-phone" name="phone" class="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm" placeholder="(850) 555-1234">
  </div>
  <div>
    <label for="ml-type" class="block text-sm font-semibold text-navy mb-1">Registration Type</label>
    <select id="ml-type" name="type" class="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm">
      <option value="individual">Individual ($120)</option>
      <option value="team">Full Team ($600)</option>
      <option value="maybe">Just interested — tell me more</option>
    </select>
  </div>
  <button type="submit" class="w-full bg-gold text-navy font-bold px-6 py-3 rounded-lg uppercase text-sm tracking-wide">Join Waitlist</button>
  <p id="ml-success" class="hidden text-green-600 text-sm text-center">Got it — we'll email you when the season is locked in.</p>
</form>

<script>
function submitMensWaitlist(e) {
  e.preventDefault();
  var f = document.getElementById('mens-league-waitlist');
  var data = {
    firstName: f.name.value.trim().split(' ')[0],
    lastName: f.name.value.trim().split(' ').slice(1).join(' '),
    email: f.email.value.trim().toLowerCase(),
    phone: f.phone.value.trim(),
    tag: 'mens-league-waitlist',
    source: 'mens-league-page',
    notes: 'Registration type: ' + f.type.value,
    utm: (window.fcpUTM && window.fcpUTM()) || {}
  };
  fetch('/.netlify/functions/capture-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).catch(function(){});
  if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: "Men's League Waitlist" });
  f.classList.add('hidden');
  document.getElementById('ml-success').classList.remove('hidden');
  return false;
}
</script>

## Questions?

[Call 850.961.2323](/contact/) or email [info@fcpsports.org](mailto:info@fcpsports.org).
