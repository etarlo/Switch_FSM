// Cloudflare Pages Function: receives quote form submissions and emails them via Resend.
// Requires the RESEND_API_KEY environment variable to be set in the Pages project settings.

const RECIPIENT = 'eric@tarlogroup.com';
const FROM = 'SwitchFSM Quote Form <onboarding@resend.dev>';

const PLATFORM_LABELS = {
  servicetitan: 'ServiceTitan',
  workiz: 'Workiz',
  jobber: 'Jobber',
  housecallpro: 'Housecall Pro',
  fieldedge: 'FieldEdge',
  fieldpulse: 'FieldPulse',
  undecided: 'Still deciding',
  other: 'Other',
};

const RECORD_LABELS = {
  'under-5k': 'Under 5,000',
  '5k-25k': '5,000 - 25,000',
  '25k-100k': '25,000 - 100,000',
  'over-100k': 'Over 100,000',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY) {
    return json({ ok: false, error: 'Email service is not configured.' }, 500);
  }

  let data;
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await request.json();
    } else {
      const form = await request.formData();
      data = Object.fromEntries(form);
    }
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  const name = (data.name || '').trim();
  const email = (data.email || '').trim();
  const phone = (data.phone || '').trim();
  const platform = (data.platform || '').trim();
  const destination = (data.destination || '').trim();
  const records = (data.records || '').trim();

  if (!name || !email || !platform || !destination) {
    return json({ ok: false, error: 'Missing required fields.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'Invalid email address.' }, 400);
  }

  const platformLabel = PLATFORM_LABELS[platform] || platform;
  const destinationLabel = PLATFORM_LABELS[destination] || destination;
  const recordsLabel = RECORD_LABELS[records] || records || 'Not provided';

  const html = `
    <h2 style="font-family:system-ui,sans-serif;">New SwitchFSM quote request</h2>
    <table style="font-family:system-ui,sans-serif;border-collapse:collapse;">
      <tr><td style="padding:4px 12px 4px 0;"><strong>Name</strong></td><td style="padding:4px 0;">${escapeHtml(name)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><strong>Email</strong></td><td style="padding:4px 0;">${escapeHtml(email)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><strong>Phone</strong></td><td style="padding:4px 0;">${escapeHtml(phone) || '<em>Not provided</em>'}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><strong>Current platform</strong></td><td style="padding:4px 0;">${escapeHtml(platformLabel)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><strong>Destination platform</strong></td><td style="padding:4px 0;">${escapeHtml(destinationLabel)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><strong>Records</strong></td><td style="padding:4px 0;">${escapeHtml(recordsLabel)}</td></tr>
    </table>
  `;

  const text = [
    'New SwitchFSM quote request',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || 'Not provided'}`,
    `Current platform: ${platformLabel}`,
    `Destination platform: ${destinationLabel}`,
    `Records: ${recordsLabel}`,
  ].join('\n');

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [RECIPIENT],
      reply_to: email,
      subject: `New quote request: ${name} (${platformLabel} → ${destinationLabel})`,
      html,
      text,
    }),
  });

  if (!resendResp.ok) {
    const detail = await resendResp.text().catch(() => '');
    console.error('Resend error', resendResp.status, detail);
    return json({ ok: false, error: 'Could not send email. Please try again later.' }, 502);
  }

  return json({ ok: true });
}
