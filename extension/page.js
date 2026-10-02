// Injected into portal pages (isolated world) by background.js. Reads forms and carries out the answers the
// AutoJobs server decided. It never touches CAPTCHAs or verification codes: those are left to the user.
(() => {
  if (self.__aj) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Also drops invisible characters: JobStreet labels its buttons "Lanjut⁠" (word joiner).
  const norm = (s) => (s || '').replace(/[​-‍⁠﻿­]/g, '').replace(/\s+/g, ' ').trim();
  const re = (src) => new RegExp(src, 'i');
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const onScreen = (el) => {
    const r = el.getBoundingClientRect();
    return visible(el) && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };
  const text = (el) => norm(el && el.innerText);
  const bodyText = () => (document.body ? document.body.innerText : '');
  const byIds = (ids) => (ids || '').split(/\s+/).map((i) => text(document.getElementById(i))).filter(Boolean).join(' ');
  // Screen-reader announcements ("14 saran tersedia, gunakan panah…") are never a question.
  const isAnnouncement = (el) => el.matches('[aria-live], [role=status], [role=alert], [role=log]');
  // A choice whose <label> is empty, with its text next to it (LinkedIn: <div><input><label></label></div><p>I consent</p>).
  const nearText = (el) => {
    for (let p = el.parentElement, d = 0; p && d < 3; p = p.parentElement, d++) {
      if (p.querySelectorAll('input, select, textarea').length > 1) return '';
      const t = text(p);
      if (t) return t.slice(0, 200);
    }
    return '';
  };
  const ownLabel = (el) =>
    byIds(el.getAttribute('aria-labelledby')) || el.getAttribute('aria-label') || text(el.labels && el.labels[0]) || text(el.closest('label')) ||
    (el.type === 'checkbox' || el.type === 'radio' ? nearText(el) : '');
  // The portal flagged this field (LinkedIn: helper text "Input tidak valid" under it).
  const invalid = (el) =>
    el.getAttribute('aria-invalid') === 'true' ||
    /tidak valid|invalid|not valid|harus berupa angka|enter a (valid )?(whole |decimal )?number/i.test(byIds(el.getAttribute('aria-describedby')));
  // One choice's own text ("Yes"). Visible text first: LinkedIn puts the whole question in every radio's aria-label.
  const optionLabel = (el) =>
    text(el.labels && el.labels[0]) || text(el.closest('label')) || nearText(el) || byIds(el.getAttribute('aria-labelledby')) || el.getAttribute('aria-label') || el.value;
  const groupLabel = (el) => {
    const g = el.closest('fieldset, [role=radiogroup], [role=group]');
    const own = g && (text(g.querySelector('legend')) || byIds(g.getAttribute('aria-labelledby')) || g.getAttribute('aria-label'));
    if (own) return own;
    // No group label (Glints; LinkedIn's fieldset without legend): the question is the text just before the options,
    // e.g. <p>question</p><div>radios</div>.
    for (let p = g || el.parentElement, d = 0; p && d < 4; p = p.parentElement, d++) {
      const prev = p.previousElementSibling;
      if (prev && !isAnnouncement(prev) && !prev.querySelector('input, select, textarea') && text(prev)) return text(prev).slice(0, 600); // long consent texts end in the required "*"
    }
    return '';
  };
  // An open apply dialog (Glints role=dialog, LinkedIn <dialog open>) holds the form: controls on the page behind it
  // (job-alert switches, language pickers) are not part of the application.
  // spec.form: the portal's form is only ever in this container (LinkedIn: dialog[open]); until it opens there is no form.
  const EMPTY = document.createElement('div');
  const formRoot = (spec) => {
    const dialogs = [...document.querySelectorAll((spec && spec.form) || 'dialog[open], [role=dialog], [aria-modal=true]')]
      .filter((d) => visible(d) && d.querySelector('input, select, textarea, button'));
    return dialogs.pop() || (spec && spec.form ? EMPTY : document);
  };

  // Last visible, enabled button (optionally also links) whose text matches, within `root`. A stable selector from the
  // server (e.g. data-testid) wins over the text. Form steps pass formRoot(spec): LinkedIn's carousels behind the apply
  // dialog have "Berikutnya" arrows too.
  const findButton = (src, withLinks, selector, root = document) => {
    if (selector) {
      const el = [...root.querySelectorAll(selector)].filter((b) => visible(b) && !b.disabled).pop();
      if (el) return el;
    }
    if (!src) return null;
    const r = re(src);
    const sel = withLinks ? 'button, [role=button], input[type=submit], a' : 'button, [role=button], input[type=submit]';
    const hits = [...root.querySelectorAll(sel)].filter(
      (b) => visible(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && r.test(norm(b.innerText || b.value || b.getAttribute('aria-label'))),
    );
    return hits[hits.length - 1] || null;
  };

  const isChallenge = (ch) => re(ch.title).test(document.title) || re(ch.text).test(bodyText().slice(0, 5000));

  // Setting .value directly doesn't reach React-controlled inputs; the native setter + input event does.
  const setValue = (el, value) => {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const formErrors = (spec) =>
    [...new Set([...formRoot(spec).querySelectorAll('[role=alert], [aria-invalid=true] ~ *, .error, [class*="error" i]')]
      .filter(visible).map((e) => norm(e.innerText)).filter((t) => t && t.length < 200))].slice(0, 3).join(' · ');

  // Fields are marked with an attribute whose name is random per page load, so the page can't plant marks of its own
  // and steer an answer into a different field.
  const ATTR = `data-aj-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
  let n = 0;
  const tag = (el) => {
    let id = el.getAttribute(ATTR);
    if (!id) { id = 'f' + Date.now().toString(36) + n++; el.setAttribute(ATTR, id); }
    return id;
  };

  self.__aj = {
    isChallenge,
    html: () => document.documentElement.outerHTML,

    inspect({ spec, challenge }) {
      const body = bodyText();
      const confirmation = re(spec.confirmation).exec(body);
      const appliedRe = re(spec.alreadyApplied);
      return {
        url: location.href,
        // Client-side apps (JobStreet's apply page) show a spinner before the form exists. Only spinners on screen
        // count: Glints keeps one spinning below the fold of every job page. Not role=progressbar: JobStreet's step
        // indicator uses it permanently.
        loading: [...document.querySelectorAll('[aria-label="Loading" i], [aria-busy="true"]')].some(onScreen),
        hidden: document.visibilityState === 'hidden',
        nextVisible: !!findButton(spec.next, false, spec.nextSelector, formRoot(spec)),
        applyVisible: !!((spec.applySelector && visible(document.querySelector(spec.applySelector))) || (spec.applyButton && findButton(spec.applyButton, true))),
        fieldCount: [...formRoot(spec).querySelectorAll('input:not([type=hidden]), textarea, select')].filter(visible).length,
        challenge: isChallenge(challenge),
        login: re(spec.loginUrl).test(location.href) || [...document.querySelectorAll('input[type=password]')].some(visible),
        otp: /kode verifikasi|verification code|one-time (pass)?code|\bOTP\b/i.test(body) &&
          [...document.querySelectorAll('input[autocomplete="one-time-code"], input[inputmode="numeric"]')].some(visible),
        closed: re(spec.closed).test(body),
        applied: [...document.querySelectorAll('body *')].some((el) => el.children.length === 0 && appliedRe.test(norm(el.innerText)) && visible(el)),
        confirmation: confirmation ? norm(body.slice(Math.max(0, confirmation.index - 80), confirmation.index + 200)).slice(0, 500) : null,
        submitVisible: !!findButton(spec.submit, false, spec.submitSelector, formRoot(spec)),
        // "Did the step change?": the form's own labels and buttons, not the page chrome around it.
        signature: location.href + '|' + [...formRoot(spec).querySelectorAll('label, legend, button, p')].map((e) => e.innerText).join('|').slice(0, 20000),
        errors: formErrors(spec),
      };
    },

    clickApply({ spec }) {
      let el = spec.applySelector ? document.querySelector(spec.applySelector) : null;
      if (!visible(el)) el = findButton(spec.applyButton, true);
      if (!el) return spec.externalButton && findButton(spec.externalButton, true) ? { found: true, external: true } : { found: false };
      const href = el.tagName === 'A' ? el.href : '';
      if (href && new URL(href).hostname !== location.hostname) return { found: true, external: true };
      if (href) location.assign(href); // stay in this tab even when the link would open a new one
      else el.click();
      return { found: true, external: false };
    },

    // Portal-specific radios, e.g. JobStreet "Unggah resume" / "Jangan sertakan surat lamaran".
    prepare({ spec, hasCoverLetter }) {
      for (const p of spec.prepare || []) {
        if ((p.when === 'coverLetter' && !hasCoverLetter) || (p.when === 'noCoverLetter' && hasCoverLetter)) continue;
        const r = re(p.radio);
        const radio = [...document.querySelectorAll('input[type=radio]')].find(
          (i) => r.test(ownLabel(i)) && (visible(i) || visible(i.closest('label') || i.parentElement)),
        );
        if (radio && !radio.checked) radio.click();
      }
      if (spec.uncheck) {
        const r = re(spec.uncheck);
        for (const cb of document.querySelectorAll('input[type=checkbox]')) if (cb.checked && r.test(ownLabel(cb))) cb.click();
      }
      return true;
    },

    // The CV chosen for this campaign. Portals that keep uploaded resumes (JobStreet lists them as radios named by
    // file) get the existing one selected; only when it isn't there yet is it uploaded, so the account isn't
    // filled with copies. fromPortal ("CV di portal" in Profil): the resume the portal already lists is kept, the
    // selected one or else the first; the AutoJobs CV (cv, may be null) is uploaded only when the portal lists none.
    attachCv({ cv, fromPortal }) {
      if (fromPortal) {
        const saved = [...document.querySelectorAll('input[type=radio]')].filter((i) => /\.(pdf|docx?)$/i.test(norm(ownLabel(i))));
        if (saved.length) {
          if (!saved.some((i) => i.checked)) saved[0].click();
          return { attached: 'portal' };
        }
        if (!cv) return { attached: false };
      }
      // "CV_Nama (1).pdf" and "cv_nama.pdf" are the same file to us.
      const key = (name) => norm(name).toLowerCase().replace(/\s*\(\d+\)(?=\.\w+$|$)/, '').replace(/\.(pdf|docx?)$/, '');
      const existing = [...document.querySelectorAll('input[type=radio]')].find((i) => key(ownLabel(i)) === key(cv.name));
      if (existing) {
        if (!existing.checked) existing.click();
        return { attached: 'selected' };
      }
      const inputs = [...document.querySelectorAll('input[type=file]')];
      for (const input of inputs) {
        if (input.files && input.files.length) continue;
        let ctx = '';
        for (let p = input.parentElement, d = 0; p && d < 6 && ctx.length < 300; p = p.parentElement, d++) ctx = (p.innerText || '').toLowerCase();
        const resume = /resume|\bcv\b|riwayat hidup/.test(ctx);
        // Never a photo upload (JobStreet's "Perbarui profil" step has one for the profile picture), and only a field that
        // is clearly for the CV: named so nearby, or accepting PDF/Word files.
        const accept = (input.accept || '').toLowerCase();
        if (/image|\.jpe?g|\.png/.test(accept) && !/pdf|doc/.test(accept)) continue;
        if (/foto|photo|avatar|gambar|picture|profile picture/.test(ctx) && !resume) continue;
        if (/surat lamaran|cover letter/.test(ctx) && !resume) continue;
        if (!resume && !/pdf|doc/.test(accept)) continue;
        const bytes = Uint8Array.from(atob(cv.base64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], cv.name, { type: cv.mime }));
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { attached: true };
      }
      return { attached: false };
    },

    // Visible, enabled, empty-or-not form controls with their question labels (sent to the server to decide answers).
    // spec.requiredName marks fields the portal requires without saying so (JobStreet's employer questions).
    collectFields({ spec } = {}) {
      const requiredName = spec && spec.requiredName ? re(spec.requiredName) : null;
      const out = [];
      const groups = new Map();
      for (const el of formRoot(spec).querySelectorAll('input, textarea, select, [role=combobox]')) {
        const type = (el.type || '').toLowerCase();
        if (el.tagName === 'INPUT' && ['hidden', 'submit', 'button', 'file', 'password', 'search', 'image', 'reset'].includes(type)) continue;
        if (el.disabled || el.readOnly) continue;
        const choice = type === 'radio' || type === 'checkbox';
        // Styled radios/checkboxes often hide the native input; the label is what's visible.
        if (!visible(el) && !(choice && visible(el.closest('label') || el.parentElement))) continue;
        const required = !!el.required || el.getAttribute('aria-required') === 'true' || !!(requiredName && el.name && requiredName.test(el.name));
        if (choice) {
          const key = (el.name || groupLabel(el) || tag(el)) + ':' + type;
          let f = groups.get(key);
          if (!f) {
            f = { id: tag(el), kind: type, inputType: type, label: groupLabel(el), required, filled: false, options: [] };
            groups.set(key, f);
            out.push(f);
          }
          f.options.push({ id: tag(el), label: optionLabel(el) });
          f.filled = f.filled || el.checked;
          f.required = f.required || required;
          continue;
        }
        const label = ownLabel(el) || groupLabel(el) || el.placeholder || el.name || '';
        if (el.tagName === 'SELECT') {
          const options = [...el.options].filter((o) => o.value !== '' && !o.disabled).map((o) => ({ id: o.value, label: o.text.trim() }));
          out.push({ id: tag(el), kind: 'select', inputType: 'select', label, required, filled: el.selectedIndex > 0 && el.value !== '', options, invalid: invalid(el) });
          continue;
        }
        const kind = el.getAttribute('role') === 'combobox' ? 'combobox' : el.tagName === 'TEXTAREA' ? 'textarea' : 'text';
        out.push({ id: tag(el), kind, inputType: type || 'text', label, required, filled: (el.value || '').trim() !== '', options: [],
          value: (el.value || '').slice(0, 200), invalid: invalid(el) });
      }
      for (const f of out) if (f.kind === 'checkbox' && !f.label && f.options.length === 1) f.label = f.options[0].label;
      return out;
    },

    async applyActions({ actions }) {
      for (const a of actions) {
        const el = document.querySelector(`[${ATTR}="${CSS.escape(String(a.id))}"]`);
        if (!el) return { needsAction: 'Formulir berubah saat sedang diisi' };
        if (a.do === 'check') {
          if (!el.checked) el.click();
        } else if (a.do === 'select') {
          setValue(el, a.value);
        } else {
          el.focus();
          setValue(el, a.value);
          el.blur();
          if (a.combobox) {
            await sleep(800);
            const opt = [...document.querySelectorAll('[role=option]')].find((o) => visible(o) && norm(o.innerText).toLowerCase() === a.value.toLowerCase());
            if (!opt) return { needsAction: `Pilihan "${a.value}" tidak tersedia di formulir` };
            opt.click();
          }
        }
        await sleep(150);
      }
      return { ok: true };
    },

    clickNext({ spec }) {
      const b = findButton(spec.next, false, spec.nextSelector, formRoot(spec));
      if (b) b.click();
      return !!b;
    },

    clickSubmit({ spec }) {
      const b = findButton(spec.submit, false, spec.submitSelector, formRoot(spec));
      if (b) b.click();
      return !!b;
    },
  };
})();
