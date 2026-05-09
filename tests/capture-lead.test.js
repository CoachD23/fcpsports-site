const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");

const sentMail = [];
const originalCreateTransport = nodemailer.createTransport;
nodemailer.createTransport = () => ({
  sendMail: async (message) => {
    sentMail.push(message);
    return { messageId: "test-message" };
  },
});

const { handler, _test } = require("../netlify/functions/capture-lead");

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

async function run() {
  const today = "2026-05-09";
  assert.deepEqual(_test.tagsForLead("homepage-lead", today), [
    "fcpsports",
    _test.HOMEPAGE_CAPTURE_TAG,
    `submitted-${today}`,
  ]);
  assert(!_test.tagsForLead("homepage-lead", today).includes("homepage-lead"));
  assert(!_test.tagsForLead("homepage-lead", today).includes("general-inquiry"));

  const homepageEmail = _test.buildHomepageLeadEmail();
  assert.equal(homepageEmail.subject, "FCP Sports next step");
  assert.match(homepageEmail.html, /Tyler/);
  assert.match(homepageEmail.html, /850\.961\.2323/);
  assert.doesNotMatch(homepageEmail.html, /before spots open/i);
  assert.doesNotMatch(homepageEmail.html, /newsletter/i);

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/contacts/upsert")) {
      return response(200, { contact: { id: "contact-1" } });
    }
    if (String(url).endsWith("/contacts/contact-1")) {
      return response(200, { contact: { id: "contact-1", tags: [] } });
    }
    if (String(url).endsWith("/contacts/contact-1/tags")) {
      return response(200, { ok: true });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  process.env.GHL_API_KEY = "test-key";
  process.env.GHL_LOCATION_ID = "test-location";
  process.env.FCPSPORTS_SMTP_PASS = "test-pass";

  const result = await handler({
    httpMethod: "POST",
    headers: { "x-forwarded-for": "198.51.100.10" },
    body: JSON.stringify({
      email: "parent@example.com",
      tag: "homepage-lead",
      source: "homepage-hero",
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(sentMail.length, 1);
  assert.equal(sentMail[0].to, "parent@example.com");
  assert.match(sentMail[0].html, /Tyler/);

  const tagPayloads = calls
    .filter((call) => call.url.endsWith("/tags"))
    .map((call) => JSON.parse(call.options.body).tags);

  assert.deepEqual(tagPayloads[0].slice(0, 2), ["fcpsports", _test.HOMEPAGE_CAPTURE_TAG]);
  assert(!tagPayloads[0].includes("homepage-lead"));
  assert(!tagPayloads[0].includes("general-inquiry"));
  assert.deepEqual(tagPayloads[1], [_test.HOMEPAGE_AUTORESPONDER_SENT_TAG]);

  sentMail.length = 0;
  const skippedCalls = [];
  global.fetch = async (url, options = {}) => {
    skippedCalls.push({ url: String(url), options });
    if (String(url).endsWith("/contacts/upsert")) {
      return response(200, { contact: { id: "contact-2" } });
    }
    if (String(url).endsWith("/contacts/contact-2")) {
      return response(200, {
        contact: { id: "contact-2", tags: [_test.HOMEPAGE_AUTORESPONDER_SENT_TAG] },
      });
    }
    if (String(url).endsWith("/contacts/contact-2/tags")) {
      return response(200, { ok: true });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  const skipped = await handler({
    httpMethod: "POST",
    headers: { "x-forwarded-for": "198.51.100.11" },
    body: JSON.stringify({
      email: "parent@example.com",
      tag: "homepage-lead",
      source: "exit-popup",
    }),
  });

  assert.equal(skipped.statusCode, 200);
  assert.equal(sentMail.length, 0);
  const skippedTagPayloads = skippedCalls
    .filter((call) => call.url.endsWith("/tags"))
    .map((call) => JSON.parse(call.options.body).tags);
  assert.equal(skippedTagPayloads.length, 1);
  assert(!skippedTagPayloads[0].includes(_test.HOMEPAGE_AUTORESPONDER_SENT_TAG));
}

run()
  .then(() => {
    nodemailer.createTransport = originalCreateTransport;
    console.log("capture-lead tests passed");
  })
  .catch((error) => {
    nodemailer.createTransport = originalCreateTransport;
    console.error(error);
    process.exit(1);
  });
