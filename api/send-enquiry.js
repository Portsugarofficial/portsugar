const crypto = require('crypto');

const MAX = 4000;
const UNITS = ['Pieces', 'Cartons', 'Kilograms', 'Tonnes', 'Litres', 'Other'];
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

const hits = new Map();
const sent = new Map();
const inflight = new Set();

const GOOGLE_FORM_ACTION =
  'https://docs.google.com/forms/d/e/1FAIpQLScd7M7csNrwQBe8bQ1U7eL8qHD6bHXhXRC0WPL_ZuvX-yMK2Q/formResponse';

const GOOGLE_FORM_ENTRIES = {
  'entry.1330326193': 'product',
  'entry.1073181296': 'specs',
  'entry.181253729': 'quantity',
  'entry.1566461101': 'unit',
  'entry.18437335': 'price',
  'entry.294365151': 'country',
  'entry.1948551825': 'date',
  'entry.1928161126': 'details',
  'entry.1425214339': 'name',
  'entry.876584376': 'email',
  'entry.1617873002': 'company',
  'entry.1913804794': 'phone'
};

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);

const clean = (value, max = 300) =>
  String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);

function prune() {
  const now = Date.now();

  for (const [key, values] of hits) {
    const keep = values.filter((time) => now - time < WINDOW_MS);
    if (keep.length) hits.set(key, keep);
    else hits.delete(key);
  }

  for (const [key, time] of sent) {
    if (now - time > WINDOW_MS) sent.delete(key);
  }
}

function page(res, status, title, message, req) {
  res.setHeader('Cache-Control', 'no-store');

  if (/application\/json/i.test(String(req?.headers?.accept || ''))) {
    return res.status(status).json({
      ok: status < 400,
      message: status < 400 ? message : `${title}. ${message}`
    });
  }

  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  return res.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | PortSugar</title>
<link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
<main class="wrap" style="max-width:760px;margin:10vh auto;padding:36px;background:#fff;border-radius:18px;box-shadow:0 12px 40px rgba(8,38,92,.12)">
<p style="font-weight:700;color:#0b4b91">PORTSUGAR · ${status < 400 ? 'REQUEST RECEIVED' : 'UNABLE TO SUBMIT'}</p>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
<p><a class="btn btn-primary" href="/contact.html">Return to Contact</a></p>
<p>If you need help, email <a href="mailto:info@portsugar.com">info@portsugar.com</a>.</p>
</main>
</body>
</html>`);
}

async function submitGoogleForm(fields) {
  const payload = new URLSearchParams();

  for (const [entry, field] of Object.entries(GOOGLE_FORM_ENTRIES)) {
    payload.set(entry, fields[field] || '');
  }

  const response = await fetch(GOOGLE_FORM_ACTION, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: payload.toString(),
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });

  const html = await response.text();

  if (!response.ok) {
    throw new Error(`Google Forms returned HTTP ${response.status}`);
  }

  if (
    !/your response has been recorded|response has been recorded/i.test(html)
  ) {
    throw new Error(
      'Google Forms did not return the expected confirmation'
    );
  }
}

module.exports = async function handler(req, res) {
  const allowedOrigins = new Set([
    'https://oveshmalpuracyberlab-lab.github.io',
    'https://portsugar.com',
    'https://www.portsugar.com'
  ]);
  const origin = String(req.headers.origin || '');

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Idempotency-Key');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    if (!origin || !allowedOrigins.has(origin)) {
      return res.status(403).json({ ok: false, message: 'This origin is not allowed to submit the form.' });
    }
    return res.status(204).end();
  }

  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ ok: false, message: 'This origin is not allowed to submit the form.' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return page(
      res,
      405,
      'Method not allowed',
      'Please submit the enquiry using the contact form.',
      req
    );
  }

  const body =
    req.body && typeof req.body === 'object' ? req.body : {};

  // Reject honeypot submissions
  if (clean(body.website, 200)) {
    return page(
      res,
      200,
      'Thank you',
      'Your request has been received.',
      req
    );
  }

  const fields = {
    product: clean(body.product, 200),
    specs: clean(body.specs, MAX),
    quantity: clean(body.quantity, 200),
    unit: clean(body.unit, 60),
    date: clean(body.date, 30),
    name: clean(body.name, 150),
    email: clean(body.email, 254),
    price: clean(body.price, 200),
    country: clean(body.country, 200),
    details: clean(body.details, MAX),
    company: clean(body.company, 200),
    phone: clean(body.phone, 100)
  };

  // Required fields
  if (
    !fields.product ||
    !fields.specs ||
    !fields.quantity ||
    !fields.unit ||
    !fields.date ||
    !fields.name ||
    !fields.email
  ) {
    return page(
      res,
      400,
      'Please complete the required fields',
      'Go back to the contact form and fill in every field marked as required.',
      req
    );
  }

  // Email and name validation
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) ||
    /[\r\n]/.test(fields.email) ||
    /[\r\n]/.test(fields.name)
  ) {
    return page(
      res,
      400,
      'Please check your details',
      'The email address or name entered does not appear to be valid. Please return to the form and correct it.',
      req
    );
  }

  // Validate date format and unit
  const dateOk =
    /^\d{4}-\d{2}-\d{2}$/.test(fields.date) &&
    !Number.isNaN(Date.parse(fields.date + 'T00:00:00Z'));

  if (!UNITS.includes(fields.unit) || !dateOk) {
    return page(
      res,
      400,
      'Please check your details',
      'The unit of measurement or required-by date is not valid. Please return to the form and correct it.',
      req
    );
  }

  // Spam protection
  const linkCount =
    (Object.values(fields).join(' ').match(/https?:\/\/|www\./gi) || []).length;

  if (
    /https?:\/\/|www\./i.test(fields.name + ' ' + fields.company) ||
    linkCount > 5
  ) {
    return page(
      res,
      400,
      'Your request could not be accepted',
      'Please remove web links from your name or company, and keep links in your notes to a minimum, then try again.',
      req
    );
  }

  // Best-effort rate limit
  prune();

  const ip = String(
    req.headers['x-real-ip'] ||
    String(req.headers['x-forwarded-for'] || '').split(',')[0] ||
    'unknown'
  ).trim();

  const recent = hits.get(ip) || [];

  if (recent.length >= MAX_PER_WINDOW) {
    return page(
      res,
      429,
      'Too many requests',
      'Several enquiries were sent from your connection recently. Please wait a few minutes or email info@portsugar.com directly.',
      req
    );
  }

  // Duplicate protection
  const clientKey = clean(req.headers['idempotency-key'], 80)
    .replace(/[^\w-]/g, '');

  const dupKey =
    clientKey ||
    crypto.createHash('sha256')
      .update([
        fields.email,
        fields.product,
        fields.specs,
        fields.quantity,
        fields.unit,
        fields.date
      ].join('|'))
      .digest('hex');

  if (sent.has(dupKey)) {
    return page(
      res,
      200,
      'Thank you for your enquiry',
      'Your supplier search request has already been recorded. There is no need to submit it again.',
      req
    );
  }

  if (inflight.has(dupKey)) {
    return page(
      res,
      409,
      'Your request is already being sent',
      'Please wait a moment; your enquiry is still being processed.',
      req
    );
  }

  inflight.add(dupKey);

  try {
    // Submit directly to Google Forms; no SMTP settings required.
    await submitGoogleForm(fields);

    sent.set(dupKey, Date.now());
    recent.push(Date.now());
    hits.set(ip, recent);

    return page(
      res,
      200,
      'Thank you for your enquiry',
      'Your supplier search request has been submitted. We will review your requirements and contact you using the details you provided.',
      req
    );
  } catch (error) {
    console.error(
      'PortSugar Google Forms submission failed:',
      error?.message || 'Unknown error'
    );

    return page(
      res,
      502,
      'Your request could not be submitted yet',
      'The website could not confirm your Google Forms submission. Please try again later or email info@portsugar.com directly.',
      req
    );
  } finally {
    inflight.delete(dupKey);
  }
};