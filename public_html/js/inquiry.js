/* ============================================================================
   Casa Nina Flamingo — availability enquiry form (book.html)

   Sends the form in the background to a form-to-email service (Web3Forms)
   and shows the result inline, so the guest never leaves the page or opens
   their mail app. The service emails the enquiry to the address the access
   key was issued for, with the guest's email as the reply-to.

   · The access key lives in data-access-key on the form. It is a public key
     by design (it can only send TO the villa's inbox), so it is safe in HTML.
   · No key yet, or JavaScript off: the form's own action (mailto:) still
     works, exactly as before.
   · A hidden "botcheck" field is a honeypot: bots fill it, people never see it.
   ============================================================================ */
(function () {
  'use strict';
  var form = document.getElementById('availabilityForm');
  if (!form) return;
  var key = form.getAttribute('data-access-key');
  var endpoint = form.getAttribute('data-endpoint') || 'https://api.web3forms.com/submit';
  if (!key) return;                                    // unconfigured: keep the mailto fallback

  var button = form.querySelector('button[type="submit"]');
  var status = document.createElement('p');
  status.className = 'form-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  button.parentNode.insertBefore(status, button.nextSibling);

  function show(kind, html) { status.className = 'form-status is-' + kind; status.innerHTML = html; }
  function val(id) { var el = form.querySelector('#' + id); return el ? el.value.trim() : ''; }
  function nice(iso) { if (!iso) return ''; var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (form.querySelector('[name="botcheck"]') && form.querySelector('[name="botcheck"]').checked) return;

    var option = form.querySelector('#option');
    var optionLabel = option ? option.options[option.selectedIndex].text : '';
    var dates = val('checkin') && val('checkout') ? nice(val('checkin')) + ' to ' + nice(val('checkout')) : 'dates not given';
    var payload = {
      access_key: key,
      subject: 'Availability request: ' + dates + ' (' + (val('option') === 'half' ? 'Half Casa' : 'Full Casa') + ')',
      from_name: 'Casa Nina Flamingo website',
      replyto: val('email'),
      'Check-in': val('checkin') || '—',
      'Check-out': val('checkout') || '—',
      'Guests': val('guests') || '—',
      'Option': optionLabel,
      'Name': val('name'),
      'Email': val('email'),
      'WhatsApp / phone': val('whatsapp') || '—',
      'Message': val('message') || '—',
      'Page': location.href.split('#')[0]
    };

    button.disabled = true; var label = button.textContent; button.textContent = 'Sending…';
    show('sending', 'Sending your request…');

    fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok && d && d.success, data: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.data && res.data.message) || 'send failed');
        form.reset();
        /* Replace the form with a thank-you panel where it stood, and bring it into view. */
        var thanks = document.createElement('div');
        thanks.className = 'form-thanks'; thanks.setAttribute('role', 'status'); thanks.setAttribute('tabindex', '-1');
        thanks.innerHTML =
          '<p class="xp-eyebrow xp-eyebrow--center">Request received</p>' +
          '<h3 class="form-thanks__title">Thank you. Your request is on its way.</h3>' +
          '<p class="form-thanks__text">We reply personally, usually the same day and always within 24 hours. If your plans are moving quickly, you can also reach us on ' +
          '<a href="https://wa.me/16473284929" target="_blank" rel="noopener">WhatsApp</a>.</p>';
        form.parentNode.insertBefore(thanks, form);
        form.hidden = true;
        thanks.scrollIntoView({ behavior: 'smooth', block: 'center' });
        thanks.focus({ preventScroll: true });
      })
      .catch(function () {
        var mailto = form.getAttribute('action') || 'mailto:info@casaninaflamingo.com';
        show('error', 'Sorry, that did not send. Please try again, or <a href="' + mailto + '">email us directly</a> and we will reply personally.');
      })
      .then(function () { button.disabled = false; button.textContent = label; });
  });
})();
