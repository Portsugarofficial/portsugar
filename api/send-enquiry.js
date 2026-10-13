const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Recipient: set CONTACT_TO_EMAIL in Vercel to change it; otherwise the public PortSugar address already used across the site is used.
const DEFAULT_RECIPIENT = 'info@portsugar.com';
const MAX = 4000;
const UNITS = ['Pieces', 'Cartons', 'Kilograms', 'Tonnes', 'Litres', 'Other'];
const WINDOW_MS = 10 * 60 * 1000;      // rate-limit and duplicate window
const MAX_PER_WINDOW = 5;              // enquiries per IP per window
// Best-effort protection kept in memory (per warm serverless instance). Use Vercel Firewall/WAF rate limiting for a hard guarantee.
const hits = new Map();                // ip -> [timestamps]
const sent = new Map();                // duplicate key -> timestamp (only after the provider accepted the email)
const inflight = new Set();            // duplicate keys currently being sent
const prune = () => {
  const now = Date.now();
  for (const [k, v] of hits) { const keep = v.filter((t) => now - t < WINDOW_MS); keep.length ? hits.set(k, keep) : hits.delete(k); }
  for (const [k, t] of sent) if (now - t > WINDOW_MS) sent.delete(k);
};
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean = (value, max = 300) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

function page(res, status, title, message, req) {
  if (req && /application\/json/.test(String(req.headers && req.headers.accept || ''))) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).json({ ok: status < 400, message: status < 400 ? message : title + '. ' + message });
  }
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | PortSugar</title><link rel="stylesheet" href="/assets/styles.css"></head><body><main class="wrap" style="max-width:760px;margin:10vh auto;padding:36px;background:#fff;border-radius:18px;box-shadow:0 12px 40px rgba(8,38,92,.12)"><p style="font-weight:700;color:#0b4b91">PORTSUGAR · ${status < 400 ? 'REQUEST RECEIVED' : 'UNABLE TO SUBMIT'}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a class="btn btn-primary" href="/contact.html">Return to Contact</a></p><p>If you need help, email <a href="mailto:info@portsugar.com">info@portsugar.com</a>.</p></main></body></html>`);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return page(res, 405, 'Method not allowed', 'Please submit the enquiry using the contact form.', req);
  }
  // Same-origin check: the form is only ever posted from this site.
  const origin = String(req.headers.origin || '');
  if (origin) {
    let originHost = '';
    try { originHost = new URL(origin).host; } catch (e) { /* invalid origin header */ }
    if (originHost !== String(req.headers.host || '')) {
      return page(res, 403, 'Request not allowed', 'This form can only be submitted from the PortSugar website.', req);
    }
  }
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  // Honeypot field: reject bots without sending an email.
  if (clean(body.website, 200)) return page(res, 200, 'Thank you', 'Your request has been received.', req);

  const fields = {
    product: clean(body.product, 200), specs: clean(body.specs, MAX), quantity: clean(body.quantity, 200),
    unit: clean(body.unit, 60), date: clean(body.date, 30), name: clean(body.name, 150),
    email: clean(body.email, 254), price: clean(body.price, 200), country: clean(body.country, 200),
    details: clean(body.details, MAX), company: clean(body.company, 200), phone: clean(body.phone, 100)
  };
  if (!fields.product || !fields.specs || !fields.quantity || !fields.unit || !fields.date || !fields.name || !fields.email) {
    return page(res, 400, 'Please complete the required fields', 'Go back to the contact form and fill in every field marked as required.', req);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) || /[\r\n]/.test(fields.email) || /[\r\n]/.test(fields.name)) {
    return page(res, 400, 'Please check your details', 'The email address or name entered does not appear to be valid. Please return to the form and correct it.', req);
  }
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(fields.date) && !Number.isNaN(Date.parse(fields.date + 'T00:00:00Z'));
  if (!UNITS.includes(fields.unit) || !dateOk) {
    return page(res, 400, 'Please check your details', 'The unit of measurement or required-by date is not valid. Please return to the form and correct it.', req);
  }
  // Basic spam signals: links in identity fields, or an excessive number of links overall.
  const linkCount = (Object.values(fields).join(' ').match(/https?:\/\/|www\./gi) || []).length;
  if (/https?:\/\/|www\./i.test(fields.name + ' ' + fields.company) || linkCount > 5) {
    return page(res, 400, 'Your request could not be accepted', 'Please remove web links from your name or company, and keep links in your notes to a minimum, then try again.', req);
  }
  // Best-effort per-IP rate limit.
  prune();
  const ip = String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
  const recent = hits.get(ip) || [];
  if (recent.length >= MAX_PER_WINDOW) {
    return page(res, 429, 'Too many requests', 'Several enquiries were sent from your connection recently. Please wait a few minutes or email info@portsugar.com directly.', req);
  }
  // Duplicate protection: the page sends a per-submission key; identical content is also treated as a duplicate.
  const clientKey = clean(req.headers['idempotency-key'], 80).replace(/[^\w-]/g, '');
  const dupKey = clientKey || crypto.createHash('sha256').update([fields.email, fields.product, fields.specs, fields.quantity, fields.unit, fields.date].join('|')).digest('hex');
  if (sent.has(dupKey)) {
    return page(res, 200, 'Thank you for your enquiry', 'Your supplier search request has already been sent to the PortSugar team. There is no need to submit it again.', req);
  }
  if (inflight.has(dupKey)) {
    return page(res, 409, 'Your request is already being sent', 'Please wait a moment; your enquiry is still being processed.', req);
  }
  const requiredEnv = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error('PortSugar mail configuration missing:', missing.join(', '));
    return page(res, 503, 'Enquiries are not configured yet', 'The form is installed, but email delivery has not been configured. Please email info@portsugar.com directly for now.', req);
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 6000, greetingTimeout: 6000, socketTimeout: 8000
  });
  const recipient = process.env.CONTACT_TO_EMAIL || DEFAULT_RECIPIENT;
  const subject = `PortSugar supplier enquiry: ${fields.product.replace(/[\r\n]+/g, ' ')}`;
  const text = `A new supplier search enquiry was submitted through portsugar.com.\n\nCONTACT DETAILS\nName: ${fields.name}\nBusiness email: ${fields.email}\nCompany: ${fields.company || 'Not provided'}\nPhone: ${fields.phone || 'Not provided'}\n\nPRODUCT REQUIREMENTS\nProduct: ${fields.product}\nSpecifications: ${fields.specs}\nQuantity: ${fields.quantity} ${fields.unit}\nTarget price per unit: ${fields.price || 'Not provided'}\nPreferred country of origin: ${fields.country || 'Not provided'}\nNeeded by: ${fields.date}\nAdditional notes: ${fields.details || 'Not provided'}\n\nSubmitted: ${new Date().toISOString()}\n`;
  inflight.add(dupKey);
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: recipient,
      replyTo: fields.email,
      subject,
      text
    });
    // Only report success once the mail provider has actually accepted the message for the recipient.
    if (!info || !Array.isArray(info.accepted) || info.accepted.length === 0 || (info.rejected && info.rejected.length)) {
      throw new Error('Mail provider did not accept the message');
    }
    sent.set(dupKey, Date.now());
    recent.push(Date.now()); hits.set(ip, recent);
    return page(res, 200, 'Thank you for your enquiry', 'Your supplier search request has been sent to the PortSugar team. We will review your requirements and contact you using the details you provided.', req);
  } catch (err) {
    console.error('PortSugar SMTP delivery failed:', err && err.message ? err.message : 'Unknown error');
    return page(res, 502, 'Your request could not be sent yet', 'The website could not send your enquiry email. Please email info@portsugar.com directly or try again later.', req);
  } finally {
    inflight.delete(dupKey);
  }
};
