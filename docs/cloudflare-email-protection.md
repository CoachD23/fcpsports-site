# Cloudflare Email Address Obfuscation

## What It Is

Cloudflare's "Email Address Obfuscation" (under Scrape Shield) rewrites any plain
`mailto:` links and email addresses found on the page into JavaScript-decoded
references. The decoded URL takes the form `/cdn-cgi/l/email-protection#...`.

## Why Screaming Frog Reports a 404

Screaming Frog crawls pages without executing JavaScript. When it encounters a
`/cdn-cgi/l/email-protection` URL, it makes a direct HTTP request for that path.
That path is handled entirely client-side by Cloudflare's JS snippet — there is no
real server resource at that URL, so Screaming Frog receives a 404.

Real visitors are not affected: their browsers execute Cloudflare's inline script,
which decodes the email address and renders it correctly.

## The Tradeoff

| Option | Pro | Con |
|--------|-----|-----|
| Leave obfuscation ON (current) | Email addresses harder to harvest by spambots | Screaming Frog (and other non-JS crawlers) see 65 broken inlinks |
| Turn obfuscation OFF | Clean crawl; real `mailto:` links; no false-positive 404s | Email addresses visible in raw HTML to scrapers |

## Recommendation

**Disable Email Address Obfuscation.**

The site already displays email addresses as plain visible text in the footer and
contact page, so obfuscation provides minimal spam protection. Disabling it
eliminates the false-positive 404s and gives crawlers a clean picture of internal
link structure.

### How to Disable

1. Log in to the Cloudflare dashboard.
2. Select the **fcpsports.org** zone.
3. Go to **Scrape Shield** (under the Security section).
4. Toggle **Email Address Obfuscation** to **Off**.
5. No deploy needed — takes effect immediately.

After disabling, re-crawl with Screaming Frog to confirm the `/cdn-cgi/l/email-protection`
URLs no longer appear.
