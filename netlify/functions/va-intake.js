// va-intake — receives the /va-intake pre-meeting answers and files them into
// the HonorElevate sub-account as a contact + a note carrying every answer.
//
// Guarantee: this function only returns ok:true when the ANSWERS are stored.
// A contact without its note is a silent data loss, so that case returns an
// error and the page falls back to copy/mailto. Never report success on a
// partial write.
//
// Env (set in Netlify, never committed):
//   HE_PIT          Private Integration Token for the HonorElevate sub-account
//   HE_LOCATION_ID  HonorElevate sub-account locationId
//   HE_USER_ID      optional. Some GHL tenants require userId on note create.

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

const json = (status, obj) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

function headers(pit) {
  return {
    Authorization: `Bearer ${pit}`,
    Version: VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  if (parts.length < 2) return { firstName: parts[0] || 'Unknown', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function buildNote(d) {
  const lines = [];
  lines.push('VA PRE-MEETING ANSWERS');
  lines.push(`Submitted: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`${d.name}${d.role ? ', ' + d.role : ''}`);
  lines.push(d.email);
  if (d.phone) lines.push(d.phone);
  lines.push('');
  (d.answers || []).forEach((a, i) => {
    lines.push(`${i + 1}. ${a.label}`);
    lines.push(a.value ? a.value : '(no answer)');
    lines.push('');
  });
  return lines.join('\n');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method not allowed' });

  const pit = process.env.HE_PIT;
  const locationId = process.env.HE_LOCATION_ID;
  if (!pit || !locationId) {
    console.error('va-intake: missing HE_PIT or HE_LOCATION_ID');
    return json(500, { ok: false, error: 'not configured' });
  }

  let d;
  try {
    d = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'bad json' });
  }
  if (!d.name || !d.email) return json(400, { ok: false, error: 'name and email required' });

  const { firstName, lastName } = splitName(d.name);

  // 1. Upsert the contact so a resubmit updates rather than duplicates.
  let contactId;
  try {
    const res = await fetch(`${API}/contacts/upsert`, {
      method: 'POST',
      headers: headers(pit),
      body: JSON.stringify({
        locationId,
        firstName,
        lastName,
        email: d.email,
        ...(d.phone ? { phone: d.phone } : {}),
        source: 'VA pre-meeting intake',
        tags: ['va-intake', 'rate-com', 'lender'],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('va-intake: upsert failed', res.status, JSON.stringify(body));
      return json(502, { ok: false, error: 'contact upsert failed' });
    }
    contactId = (body.contact && body.contact.id) || body.id;
    if (!contactId) {
      console.error('va-intake: no contact id in upsert response', JSON.stringify(body));
      return json(502, { ok: false, error: 'no contact id' });
    }
  } catch (e) {
    console.error('va-intake: upsert threw', e && e.message);
    return json(502, { ok: false, error: 'contact upsert error' });
  }

  // 2. Attach the answers. This is the payload that matters.
  const noteBody = buildNote(d);
  const attempts = [{ body: noteBody }];
  if (process.env.HE_USER_ID) attempts.push({ body: noteBody, userId: process.env.HE_USER_ID });

  for (const payload of attempts) {
    try {
      const res = await fetch(`${API}/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: headers(pit),
        body: JSON.stringify(payload),
      });
      if (res.ok) return json(200, { ok: true, contactId });
      const errBody = await res.text().catch(() => '');
      console.error('va-intake: note failed', res.status, errBody);
    } catch (e) {
      console.error('va-intake: note threw', e && e.message);
    }
  }

  // Contact exists but the answers did not land. Say so, loudly, and let the
  // page show the copy/mailto fallback so nothing the user typed is lost.
  console.error('va-intake: ANSWERS NOT STORED for contact', contactId, '\n', noteBody);
  return json(502, { ok: false, error: 'answers not stored', contactId });
};
