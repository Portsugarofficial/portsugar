# PortSugar — Vercel Preview Deployment

This package is a multi-page HTML/CSS website with a Vercel Node.js serverless endpoint for supplier enquiries. It is intended for a preview deployment; it does not replace the live Hostinger WordPress site.

## Files
- `index.html` — Home
- `about.html` — About
- `contact.html` — Contact and supplier enquiry form (the only page with a form)
- `privacy-policy.html`, `terms-of-use.html` — legal pages (footer + form links only, not in main nav)
- `assets/` — shared styles and images
- `api/send-enquiry.js` — server-side form endpoint (Node.js on Vercel)
- `package.json` — Nodemailer dependency
- `vercel.json` — Vercel configuration

## Deploy
1. Extract the ZIP to a folder on your computer.
2. Go to https://vercel.com/new and create a project. If deploying through GitHub, upload the extracted files to a repository (the ZIP alone is not the source structure Vercel needs).
3. Set Framework Preset to **Other** if asked. Leave the build command blank; the site is static HTML plus a serverless function. Vercel should install the dependency from `package.json`.
4. Deploy a preview project first, e.g. `portsugar-preview`. Do not change the client's Hostinger/WordPress site during demo review.
5. Before testing email, open Project Settings → Environment Variables and add the variables below for Preview (and Production only when approved).

## Required email environment variables
The endpoint sends enquiries to `info@portsugar.com` using authenticated SMTP. In Vercel Project Settings → Environment Variables, add:
- `SMTP_HOST` — the SMTP hostname supplied by the email provider for `info@portsugar.com`
- `SMTP_PORT` — typically `465` for implicit TLS or `587` for STARTTLS; use the provider's documented value
- `SMTP_USER` — normally `info@portsugar.com`
- `SMTP_PASS` — mailbox/app password from the email provider; never commit it into GitHub or put it in HTML
- `MAIL_FROM` — an authorised sender such as `PortSugar Website <info@portsugar.com>`
- `CONTACT_TO_EMAIL` — *(optional)* recipient inbox for enquiries. If not set, enquiries go to `info@portsugar.com`. Confirm with the client that this is the inbox they want.

Save variables and redeploy after adding/changing them. Do not guess SMTP host/password. If the mailbox is hosted by Hostinger, copy the exact outgoing SMTP details from Hostinger Email setup for this domain. Confirm SPF/DKIM records as recommended by the email provider.

## Form behaviour and test
The form POSTs to `/api/send-enquiry`. The server validates required fields, includes a honeypot field, and emails the submitted details to `info@portsugar.com`. The customer's email is set as Reply-To. If SMTP is not configured, the endpoint intentionally reports that email delivery is not configured rather than pretending the enquiry was sent.

After deployment and SMTP setup, submit a test enquiry using your own email address. Verify that it arrives at `info@portsugar.com` and check spam. A successful page alone is not proof of inbox delivery. Do not use real customer data during testing.

## Important
- The PHP `send-enquiry.php` file used for Hostinger is intentionally not included: Vercel does not run PHP handlers directly.
- This package does not save leads to a database or dashboard; it emails enquiries.
- Protect SMTP credentials as Vercel environment variables only.
- The design reference images are included in `reference-images/` for reference only and are not used as page backgrounds.

## Revision notes
- The form now submits via fetch (JSON response) with inline validation, duplicate-submit protection, and success/error messages; without JavaScript it falls back to the original full-page POST response.
- Confirmed locally against a mock SMTP server only. A real delivery test to info@portsugar.com still requires the SMTP variables above.

## Round 2 notes
- Home content order is hero, Import Support From Start to Finish, process steps, and final CTA (four main sections).
- About heading label uses the requested wording: “Why Businesses Choose PortSugar”.
- Decorative emoji/text glyphs were removed from site controls and footer contact links; the mobile menu icon is rendered with CSS bars.
- The About pallet image is displayed at its natural aspect ratio without a masking crop.
- Logo replaced with the client's original logo file (`assets/portsugar-logo.png`).
- About Us hero image: `assets/about-hero.jpg`; pallet image: `assets/pallet.jpg`; the five process pictures are the full 4:3 originals in `assets/icons/step-1..5.jpg`.
- Desktop content now expands responsively up to 2000px on very wide screens, with proportional side margins; verify at 1440px, 1920px and 2560px in the target browser before production.

## Contact form final fix notes
- Success is shown only after the mail provider accepts the message for the recipient; any SMTP/configuration failure returns a clear error (HTTP 502/503) and the form shows it.
- Server-side checks: required fields, email format, unit list, date format, length limits, header-injection guard, same-origin check, hidden honeypot field, link-spam check.
- Duplicate protection: the button is disabled while sending, each page load sends a unique `Idempotency-Key`, and an identical enquiry is not emailed twice within 10 minutes.
- Per-IP rate limit (5 per 10 minutes) and duplicate memory are kept in the serverless instance's memory, so they are best-effort. For a hard guarantee, add Vercel Firewall rate limiting or a CAPTCHA (e.g. Cloudflare Turnstile) with the client's own keys.
- Not yet verified: a real email delivered to the client's inbox. This needs the SMTP variables above in a Vercel **Preview** deployment and one test submission; check the inbox and spam folder before promoting to Production.
