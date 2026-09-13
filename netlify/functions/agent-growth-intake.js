// Portal Spend Autopsy intake. Stores the contact and every answer in the
// HonorElevate location already configured for this Netlify site.
const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const headers = pit => ({
  Authorization: `Bearer ${pit}`,
  Version: VERSION,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

function clean(value, limit = 300) {
  return String(value || '').trim().slice(0, limit);
}

function buildNote(data) {
  return [
    'PORTAL SPEND AUTOPSY REQUEST',
    `Submitted: ${new Date().toISOString()}`,
    `Page: ${clean(data.pageUrl, 500)}`,
    '',
    `Name: ${clean(data.firstName)} ${clean(data.lastName)}`,
    `Email: ${clean(data.email)}`,
    `Phone: ${clean(data.phone)}`,
    `Brokerage or team: ${clean(data.company)}`,
    `Primary market: ${clean(data.market)}`,
    `Monthly growth spend: ${clean(data.spendBand)}`,
    `Active agents: ${clean(data.teamSize)}`,
    `Paid sources: ${(Array.isArray(data.sources) ? data.sources : []).map(x => clean(x, 80)).join(', ')}`,
    `Current CRM: ${clean(data.crm)}`,
    `One person owns first response: ${clean(data.responseOwner)}`,
    `Communication consent: ${data.consent ? 'Yes' : 'No'}`,
  ].join('\n');
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method not allowed' });

  const pit = process.env.HE_PIT;
  const locationId = process.env.HE_LOCATION_ID;
  if (!pit || !locationId) {
    console.error('agent-growth-intake: missing HE_PIT or HE_LOCATION_ID');
    return json(500, { ok: false, error: 'not configured' });
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'bad json' });
  }

  const required = ['firstName', 'lastName', 'email', 'phone', 'company', 'market', 'spendBand', 'teamSize', 'crm', 'responseOwner'];
  if (required.some(key => !clean(data[key])) || !data.consent || !Array.isArray(data.sources) || !data.sources.length) {
    return json(400, { ok: false, error: 'required fields missing' });
  }

  let contactId;
  try {
    const response = await fetch(`${API}/contacts/upsert`, {
      method: 'POST',
      headers: headers(pit),
      body: JSON.stringify({
        locationId,
        firstName: clean(data.firstName),
        lastName: clean(data.lastName),
        email: clean(data.email),
        phone: clean(data.phone),
        companyName: clean(data.company),
        source: 'Portal Spend Autopsy',
        tags: ['portal-spend-autopsy', 'agent-growth-os', 'website-intake'],
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('agent-growth-intake: contact upsert failed', response.status, JSON.stringify(body));
      return json(502, { ok: false, error: 'contact upsert failed' });
    }
    contactId = (body.contact && body.contact.id) || body.id;
    if (!contactId) return json(502, { ok: false, error: 'no contact id' });
  } catch (error) {
    console.error('agent-growth-intake: contact upsert threw', error && error.message);
    return json(502, { ok: false, error: 'contact upsert error' });
  }

  const note = buildNote(data);
  const attempts = [{ body: note }];
  if (process.env.HE_USER_ID) attempts.push({ body: note, userId: process.env.HE_USER_ID });

  for (const payload of attempts) {
    try {
      const response = await fetch(`${API}/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: headers(pit),
        body: JSON.stringify(payload),
      });
      if (response.ok) return json(200, { ok: true, contactId });
      console.error('agent-growth-intake: note failed', response.status, await response.text().catch(() => ''));
    } catch (error) {
      console.error('agent-growth-intake: note threw', error && error.message);
    }
  }

  console.error('agent-growth-intake: answers not stored for contact', contactId, note);
  return json(502, { ok: false, error: 'answers not stored', contactId });
};
