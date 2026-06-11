const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = (process.env.CHECKOUT_BASE_URL || "http://localhost:1313").replace(/\/$/, "");
const mobileViewport = { width: 390, height: 844 };

function url(path) {
  return `${baseUrl}${path}`;
}

async function assertVisible(page, selector, label) {
  const visible = await page.locator(selector).isVisible();
  assert.equal(visible, true, `${label || selector} should be visible`);
}

async function assertTextContains(page, selector, expected, label) {
  const text = (await page.locator(selector).textContent()) || "";
  assert.match(text, expected, label || `${selector} text should match ${expected}`);
}

async function openMobilePage(browser, path) {
  const page = await browser.newPage({ viewport: mobileViewport, isMobile: true });
  await page.goto(url(path), { waitUntil: "domcontentloaded" });
  return page;
}

async function genericCheckoutSmoke(browser, programId, expectedPrice) {
  const page = await openMobilePage(browser, `/checkout/?program=${encodeURIComponent(programId)}`);
  try {
    assert.equal(await page.locator(`#prog-${programId}`).isChecked(), true, `${programId} should preselect`);
    const programCards = page.locator("#program-cards");
    assert.equal(await programCards.locator("text=Summer Day Camp").count(), 0, "generic checkout should not show camp card");
    assert.equal(await programCards.locator("text=Saturday League").count(), 0, "generic checkout should not show league card");

    await page.locator("#step-1 button").click();
    await page.locator("#step-2").waitFor({ state: "visible" });
    await page.fill("#f-parentFirst", "Audit");
    await page.fill("#f-parentLast", "Parent");
    await page.fill("#f-email", `checkout-${programId}@example.com`);
    await page.fill("#f-phone", "8505550100");
    await page.fill("#f-athleteName", `Audit ${programId}`);
    await page.fill("#f-age", "11");
    await page.selectOption("#f-grade", { label: "5th" });
    await page.locator("#step-2 button:has-text('Continue to Payment')").click();

    await page.locator("#step-3").waitFor({ state: "visible" });
    await assertTextContains(page, "#summary-price", new RegExp(`\\$${expectedPrice}`), `${programId} price`);
    await assertVisible(page, "#cc-number", `${programId} card number`);
    await assertVisible(page, "#cc-exp", `${programId} card expiration`);
    await assertVisible(page, "#cc-cvv", `${programId} card cvv`);
    await assertTextContains(page, "#pay-btn", new RegExp(`Pay \\$${expectedPrice}\\.00`), `${programId} pay button`);
  } finally {
    await page.close();
  }
}

async function campCheckoutSmoke(browser) {
  const page = await openMobilePage(browser, "/register/?camp=summer-s1-jun08");
  try {
    await page.fill("#p-email", "camp-audit@example.com");
    await page.fill("#p-first", "Audit");
    await page.fill("#p-last", "Parent");
    await page.fill("#p-zip", "32548");
    await page.fill("#p-phone", "8505550100");
    await page.locator("#btn-next").click();

    await page.locator('.step-panel[data-step="2"]').waitFor({ state: "visible" });
    await page.fill("#c-first", "Rowan");
    await page.fill("#c-last", "Audit");
    await page.fill("#c-dob", "2016-06-15");
    await page.selectOption("#c-grade", "4");
    await page.selectOption("#c-shirt", "YL");
    await page.fill("#e-name", "Audit Emergency");
    await page.fill("#e-phone", "8505550199");
    await page.check("#r-waiver");
    await page.locator("#btn-next").click();

    await page.locator('.step-panel[data-step="3"]').waitFor({ state: "visible" });
    await assertTextContains(page, "#pay-price", /\$149/, "camp price");
    await assertVisible(page, "#cc-name", "camp cardholder name");
    await assertVisible(page, "#cc-number", "camp card number");
    await assertVisible(page, "#cc-exp", "camp card expiration");
    await assertVisible(page, "#cc-cvv", "camp card cvv");
  } finally {
    await page.close();
  }
}

async function leagueCheckoutSmoke(browser) {
  const page = await openMobilePage(browser, "/youth-league/register/?session=mid-summer-2026");
  try {
    await page.fill("#p-email", "league-audit@example.com");
    await page.fill("#p-first", "Audit");
    await page.fill("#p-last", "Parent");
    await page.fill("#p-zip", "32548");
    await page.fill("#p-phone", "8505550100");
    await page.locator("#btn-next").click();

    await page.locator('.step-panel[data-step="2"]').waitFor({ state: "visible" });
    await page.fill("#c-first", "League");
    await page.fill("#c-last", "Audit");
    await page.fill("#c-dob", "2016-01-15");
    await page.fill("#e-name", "Audit Emergency");
    await page.fill("#e-phone", "8505550199");
    await page.locator("#btn-next").click();

    await page.locator('.step-panel[data-step="3"]').waitFor({ state: "visible" });
    await page.locator("label.jersey-option").filter({ hasText: "YM" }).click();
    await page.locator("#btn-next").click();

    await page.locator('.step-panel[data-step="4"]').waitFor({ state: "visible" });
    await page.check("#r-pledge");
    await page.check("#r-terms");
    await page.locator("#btn-next").click();

    await page.locator('.step-panel[data-step="5"]').waitFor({ state: "visible" });
    await assertTextContains(page, "#pay-session-name", /Saturday Summer League — Session 2/, "league payment session");
    await assertTextContains(page, "#pay-session-dates", /August 1 – September 12, 2026/, "league payment dates");
    await assertTextContains(page, "#pay-price", /\$149/, "league price");
    await assertVisible(page, "#cc-name", "league cardholder name");
    await assertVisible(page, "#cc-number", "league card number");
    await assertVisible(page, "#cc-exp", "league card expiration");
    await assertVisible(page, "#cc-cvv", "league card cvv");
  } finally {
    await page.close();
  }
}

function functionEvent(body) {
  return {
    httpMethod: "POST",
    headers: {
      origin: "https://fcpsports.org",
      "content-type": "application/json",
      "user-agent": "checkout-smoke",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify(body),
  };
}

function installSafeFunctionEnv() {
  process.env.AUTHNET_API_LOGIN ||= "checkout-smoke-login";
  process.env.AUTHNET_TRANSACTION_KEY ||= "checkout-smoke-key";
  process.env.AIRTABLE_PAT ||= "checkout-smoke-pat";
  process.env.AIRTABLE_BASE_ID ||= "checkout-smoke-base";
  process.env.PAYMENT_ALERT_TO ||= "info@fcpsports.org,coachdeforest@gmail.com";
}

function fakePayment() {
  return {
    dataDescriptor: "COMMON.ACCEPT.INAPP.PAYMENT",
    dataValue: "checkout-smoke-fake-token",
  };
}

async function invoke(handler, body) {
  const res = await handler(functionEvent(body));
  let parsed = {};
  try { parsed = JSON.parse(res.body || "{}"); } catch (_) {}
  return { statusCode: res.statusCode, body: parsed };
}

async function functionSmokeChecks() {
  installSafeFunctionEnv();
  const processPayment = require("../netlify/functions/process-payment").handler;
  const registerCamp = require("../netlify/functions/register-camp").handler;
  const registerLeague = require("../netlify/functions/register-youth-league").handler;

  const unsupported = await invoke(processPayment, {
    ...fakePayment(),
    amount: 149,
    program: "saturday-league",
    programLabel: "Saturday League",
    parentFirst: "Audit",
    email: "unsupported-audit@example.com",
    athleteName: "Audit Athlete",
  });
  assert.equal(unsupported.statusCode, 400, "unsupported generic program should be rejected");
  assert.match(unsupported.body.error || "", /Invalid program/i);

  const genericFake = await invoke(processPayment, {
    ...fakePayment(),
    amount: 149,
    program: "skills-training",
    programLabel: "Skills Training",
    parentFirst: "Audit",
    parentLast: "Parent",
    email: "generic-fake-token@example.com",
    phone: "8505550100",
    athleteName: "Audit Athlete",
    zip: "32548",
  });
  assert.equal(genericFake.statusCode, 400, "generic fake token should return controlled payment failure");
  assert.ok(genericFake.body.error, "generic fake token response should include error");

  const campFake = await invoke(registerCamp, {
    camp: "summer-s1-jun08",
    campName: "Session 1 Morning",
    campDates: "June 8-12",
    parentEmail: "camp-fake-token@example.com",
    parentFirst: "Audit",
    parentLast: "Parent",
    parentPhone: "8505550100",
    parentZip: "32548",
    childFirst: "Camp",
    childLast: "Audit",
    childDob: "2016-06-15",
    childGrade: "4",
    shirtSize: "YL",
    emergencyName: "Audit Emergency",
    emergencyPhone: "8505550199",
    photoConsent: true,
    waiverAccepted: true,
    payment: fakePayment(),
  });
  assert.equal(campFake.statusCode, 402, "camp fake token should return controlled payment failure");
  assert.match(campFake.body.error || "", /Payment failed/i);

  const campMissingPayment = await invoke(registerCamp, {
    camp: "summer-s1-jun08",
    campName: "Session 1 Morning",
    campDates: "June 8-12",
    parentEmail: "camp-missing-token@example.com",
    parentFirst: "Audit",
    parentLast: "Parent",
    parentPhone: "8505550100",
    parentZip: "32548",
    childFirst: "Camp",
    childLast: "MissingToken",
    childDob: "2016-06-15",
    childGrade: "4",
    shirtSize: "YL",
    emergencyName: "Audit Emergency",
    emergencyPhone: "8505550199",
    photoConsent: true,
    waiverAccepted: true,
  });
  assert.equal(campMissingPayment.statusCode, 400, "camp missing token should return 400");
  assert.match(campMissingPayment.body.error || "", /Payment token missing/i);

  const leaguePayload = {
    session: "mid-summer-2026",
    sessionName: "Saturday Summer League — Session 2",
    parentEmail: "league-fake-token@example.com",
    parentFirst: "Audit",
    parentLast: "Parent",
    parentPhone: "8505550100",
    parentZip: "32548",
    childFirst: "League",
    childLast: "Audit",
    childDob: "2016-01-15",
    division: "youth",
    divisionName: "Youth",
    emergencyName: "Audit Emergency",
    emergencyPhone: "8505550199",
    jerseySize: "YM",
    photoConsent: true,
    parentPledge: true,
  };

  const leagueFake = await invoke(registerLeague, {
    ...leaguePayload,
    payment: fakePayment(),
  });
  assert.equal(leagueFake.statusCode, 402, "league fake token should return controlled payment failure");
  assert.match(leagueFake.body.error || "", /Payment failed/i);

  const leagueMissingPayment = await invoke(registerLeague, leaguePayload);
  assert.equal(leagueMissingPayment.statusCode, 400, "league missing token should return 400");
  assert.match(leagueMissingPayment.body.error || "", /Payment token missing/i);

  const leagueMissingDescriptor = await invoke(registerLeague, {
    ...leaguePayload,
    payment: { dataValue: "checkout-smoke-fake-token" },
  });
  assert.equal(leagueMissingDescriptor.statusCode, 400, "league missing descriptor should return 400");
  assert.match(leagueMissingDescriptor.body.error || "", /Payment token missing/i);
}

async function main() {
  const browser = await chromium.launch();
  try {
    await genericCheckoutSmoke(browser, "skills-training", 149);
    await genericCheckoutSmoke(browser, "private-lesson", 50);
    await genericCheckoutSmoke(browser, "homeschool-pe", 99);
    await campCheckoutSmoke(browser);
    await leagueCheckoutSmoke(browser);
  } finally {
    await browser.close();
  }

  await functionSmokeChecks();
  console.log("Checkout smoke tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
