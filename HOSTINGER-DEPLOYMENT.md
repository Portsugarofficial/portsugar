# PortSugar Hostinger Migration — Audit & Deployment Notes

**Status: PREPARATION ONLY — NOT DEPLOYED**

This document belongs to the isolated `migration/hostinger-audit-2026-10-13` branch. The production domain, DNS, email DNS, and approved frontend must remain untouched.

## Repository findings

- Approved site source is the repository root: `index.html`, `about.html`, `contact.html`, `privacy-policy.html`, `terms-of-use.html`, `assets/`, and `favicon.ico`.
- Do not deploy the duplicate `clients all problme fixed/` folder.
- The Contact Us form posts to `/api/send-enquiry` with `application/x-www-form-urlencoded`, sends an `Idempotency-Key`, and expects JSON with `ok` and `message`.
- The existing `api/send-enquiry.js` is a Vercel Node.js serverless function using `nodemailer`. It requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`; `CONTACT_TO_EMAIL` is optional and defaults to `info@portsugar.com`.
- The current endpoint sends email only; it does not store enquiries in Google Sheets.
- The root `package.json` lists `nodemailer`; `vercel.json` configures the Vercel function. Neither proves that Node serverless functions are supported on the client's Hostinger plan.
- `robots.txt`, `sitemap.xml`, and `.htaccess` were not found at the repository root. This does not prove they are absent from the live domain.
- The live demo could not be fetched by the available inspection tool during this audit, so live visual/behavior comparison remains unverified.

## Frontend freeze

Do not edit, reformat, regenerate, or overwrite these files:
- `index.html`
- `about.html`
- `contact.html`
- `privacy-policy.html`
- `terms-of-use.html`
- `assets/styles.css`
- `favicon.ico`
- Every existing asset under `assets/`

Before making backend changes, create a SHA-256 baseline locally from the approved checkout and verify it again after changes. Git blob IDs are not SHA-256 file hashes. Do not treat them as equivalent.

## Hostinger requirements — blocked pending confirmation

Before creating or deploying the replacement endpoint, confirm in the Hostinger account:
1. Exact hosting product/plan and domain's hosting destination.
2. Whether PHP is enabled and the PHP version.
3. Whether Apache `.htaccess` rewrite rules are supported for this domain (or identify the actual web server/routing method).
4. Whether Composer is available if a mail library is needed, or whether the account's supported mail method should be used.
5. How to store secrets outside the public web root or in Hostinger's supported environment configuration.

Until these facts are verified, do not add a PHP endpoint or routing rule on the assumption that it will run.

## Email integration

The Vercel implementation currently uses SMTP environment variables. Configure the Hostinger replacement only after the client/hosting owner confirms valid SMTP host, port, username, password, sender identity, and recipient. Keep secrets out of Git, public files, screenshots, and chat. Do not change email DNS records as part of this migration.

## Google Sheets / Google Form

**Pending client input from Srideep.** No spreadsheet ID, Apps Script URL, Google Form endpoint, or authorization details are available in this repository audit. Do not fabricate them. Once provided and authorized, map every existing field and verify a real test submission appears in the destination before reporting success.

## Analytics

GA4 is not confirmed active from the repository files inspected. Tracking cannot be declared active without a real property ID and a verified event/page-view test. The current instruction prohibits changing protected HTML, so do not inject a tracking snippet into those files. A non-frontend solution must be confirmed with the hosting setup; otherwise request explicit approval for a narrowly scoped HTML change.

## Staging acceptance checklist

- [ ] Hostinger plan/runtime/routing verified.
- [ ] SHA-256 baseline recorded before backend work.
- [ ] Protected frontend hashes match after backend work.
- [ ] All approved pages/assets copied unchanged to an isolated staging target.
- [ ] Existing `/api/send-enquiry` path reaches the verified backend without changing `contact.html`.
- [ ] Valid request, missing fields, invalid email/date/unit, honeypot, malformed/oversized body, and unsupported method tested.
- [ ] JSON response always includes `ok` and `message` as expected by the existing frontend.
- [ ] A valid enquiry is confirmed at the configured destination.
- [ ] Google Sheets test is verified after client authorization.
- [ ] SEO/canonical/redirect/robots/sitemap state checked on staging and against the live site.
- [ ] Rollback package is retained.
- [ ] No production, DNS, or email-DNS change made without explicit approval.

## Rollback

Keep the existing Vercel deployment and `api/send-enquiry.js` unchanged. The Hostinger package should be staged separately. If any staging test fails, do not switch DNS; remove/revert only the staging package changes and retain the current Vercel deployment.

## Current blockers

- Hostinger plan/runtime and routing capabilities have not been verified from the account.
- Valid SMTP configuration/authorization must be available in the hosting account.
- Srideep's Google destination configuration is pending.
- GA4 property and tracking method are not confirmed.
- Live-site SEO files and visual comparison could not be verified in this audit.
