(function () {
  var form = document.getElementById('autopsy-form');
  var button = document.getElementById('submit-button');
  var message = document.getElementById('form-message');
  if (!form || !button || !message) return;

  function show(type, text) {
    message.className = 'form-message ' + type;
    message.textContent = text;
  }

  function collect() {
    var data = new FormData(form);
    return {
      firstName: String(data.get('firstName') || '').trim(),
      lastName: String(data.get('lastName') || '').trim(),
      email: String(data.get('email') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      company: String(data.get('company') || '').trim(),
      market: String(data.get('market') || '').trim(),
      spendBand: String(data.get('spendBand') || '').trim(),
      teamSize: String(data.get('teamSize') || '').trim(),
      sources: data.getAll('sources').map(String),
      crm: String(data.get('crm') || '').trim(),
      responseOwner: String(data.get('responseOwner') || '').trim(),
      consent: data.get('consent') === 'on',
      pageUrl: window.location.href
    };
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var payload = collect();
    if (!payload.sources.length) {
      show('err', 'Choose at least one current lead source so the Autopsy has a place to start.');
      return;
    }
    button.disabled = true;
    button.textContent = 'Sending...';
    message.className = 'form-message';

    fetch('/.netlify/functions/agent-growth-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().then(function (body) { return { ok: response.ok, body: body }; });
    }).then(function (result) {
      if (!result.ok || !result.body.ok) throw new Error('submission failed');
      form.reset();
      show('ok', 'Received. Connor will review your numbers and contact you to schedule the 20-minute working session.');
      button.textContent = 'Autopsy Request Received';
    }).catch(function () {
      button.disabled = false;
      button.textContent = 'Get My Autopsy';
      show('err', 'That did not go through. Nothing was charged. Email connor@honorelevate.com and write Portal Spend Autopsy in the subject line.');
    });
  });
})();
