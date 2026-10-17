// Visit tracking for the landing page (event list in TRACKING.md).
// Every event goes through emit() and reaches the Meta Pixel: standard events via
// fbq('track'), everything else via fbq('trackCustom'), each with its own eventID.
// Names, phones and addresses never travel as event parameters.
// Add ?analytics_debug=1 to the page URL to see every event in the console.
(() => {
  const META_STANDARD = new Set(['AddPaymentInfo', 'AddToCart', 'AddToWishlist', 'CompleteRegistration', 'Contact', 'CustomizeProduct', 'Donate', 'FindLocation', 'InitiateCheckout', 'Lead', 'PageView', 'Purchase', 'Schedule', 'Search', 'StartTrial', 'SubmitApplication', 'Subscribe', 'ViewContent']);
  const SCROLL_MARKS = [10, 25, 50, 75, 90, 100];
  const TIME_MARKS = [5, 15, 30, 60, 120, 180, 300];
  const IDLE_MS = 45000; // visible but untouched for this long counts as idle
  const ENGAGED_WINDOW_MS = 30000; // activity older than this stops the engaged-time clock
  const FORM_ID = 'order-form';
  const ORDER_HASH = '#elb-order';
  const DEBUG = new URLSearchParams(location.search).get('analytics_debug') === '1';
  const now = () => performance.now();

  const session = { startedAt: now(), maxScroll: 0, scrollMarks: new Set(), sections: [], deepestSection: '', interactions: 0, clicks: 0, ctaClicks: 0, firstInteractionAt: null, activeMs: 0, lastActivityAt: now(), hiddenCount: 0, lead: false, leaveSent: false, form: null, once: new Set() };
  const secondsOnPage = () => Math.round((now() - session.startedAt) / 100) / 10;
  const engagedSeconds = () => Math.round(session.activeMs / 100) / 10;
  function once(key, run) {
    if (session.once.has(key)) return;
    session.once.add(key);
    run();
  }

  /* ---------- attribution: first touch of the session, kept across reloads ---------- */

  let attribution = null;
  function getAttribution() {
    if (attribution) return attribution;
    try { const stored = sessionStorage.getItem('elb_attribution'); if (stored) return (attribution = JSON.parse(stored)); } catch {}
    const query = new URLSearchParams(location.search);
    const q = key => query.get(key) || undefined;
    let referrer = 'direct';
    try { if (document.referrer) referrer = new URL(document.referrer).hostname; } catch {}
    const parsed = { utm_source: q('utm_source'), utm_medium: q('utm_medium'), utm_campaign: q('utm_campaign'), utm_content: q('utm_content'), utm_term: q('utm_term'), fbclid: q('fbclid'), gclid: q('gclid'), ttclid: q('ttclid'), referrer, landing_path: location.pathname };
    // Meta ads that land without UTMs still carry fbclid, so paid traffic never shows up as "direct".
    if (!parsed.utm_source && parsed.fbclid) { parsed.utm_source = 'facebook'; parsed.utm_medium = parsed.utm_medium || 'paid_social'; }
    if (!parsed.utm_source && parsed.gclid) { parsed.utm_source = 'google'; parsed.utm_medium = parsed.utm_medium || 'cpc'; }
    attribution = parsed;
    try { sessionStorage.setItem('elb_attribution', JSON.stringify(parsed)); } catch {}
    return parsed;
  }

  /* ---------- dispatch ---------- */

  function deviceContext() {
    const width = innerWidth;
    return { device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'pointer', viewport: width < 640 ? 'sm' : width < 1024 ? 'md' : 'lg', viewport_w: width, viewport_h: innerHeight, connection: navigator.connection?.effectiveType };
  }
  // Empty values are dropped and long strings cut: Meta tolerates them but they're noise.
  function clean(params) {
    const out = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      out[key] = typeof value === 'string' ? value.slice(0, 100) : typeof value === 'number' ? Math.round(value * 100) / 100 : value;
    }
    return out;
  }
  let eventSeq = 0;
  const makeEventId = name => `${name}.${Math.round(Date.now() / 1000)}.${++eventSeq}.${Math.random().toString(36).slice(2, 8)}`;
  const toPascal = name => name.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  // Context stamped onto every event.
  function baseParams() {
    const a = getAttribution();
    return { page_path: location.pathname, locale: 'ar', seconds_on_page: secondsOnPage(), engaged_seconds: engagedSeconds(), scroll_depth: session.maxScroll, sections_seen: session.sections.length, interactions: session.interactions, utm_source: a.utm_source, utm_medium: a.utm_medium, utm_campaign: a.utm_campaign, referrer: a.referrer };
  }
  // `name` is the snake_case event name. The pixel gets `meta`, or the PascalCase name; `meta: false` keeps it off the pixel.
  function emit(name, { meta, params, withDevice, eventId } = {}) {
    const payload = clean({ ...baseParams(), ...(withDevice ? deviceContext() : {}), ...params });
    const metaName = meta ?? toPascal(name);
    if (DEBUG) console.info(`[analytics] ${name}`, { meta: metaName, ...payload });
    if (typeof window.fbq !== 'function' || metaName === false) return;
    try { window.fbq(META_STANDARD.has(metaName) ? 'track' : 'trackCustom', metaName, payload, { eventID: eventId || makeEventId(name) }); } catch {}
  }

  /* ---------- the commerce funnel ---------- */

  function offerData() {
    const offer = document.querySelector('#elb-form input[name="offers"]:checked');
    return offer ? { content_ids: [offer.value], content_name: offer.dataset.label, content_type: 'product', contents: [{ id: offer.value, quantity: 1 }], value: Number(offer.dataset.price), currency: 'DZD' } : {};
  }
  // Several triggers can claim it (product section reached, half the page read); only the first reports.
  function trackViewContent(trigger) {
    once('view_content', () => emit('view_content', { meta: 'ViewContent', params: { ...offerData(), content_category: 'spices', trigger_section: trigger } }));
  }
  function trackAddToCart(trigger) {
    once('add_to_cart', () => emit('add_to_cart', { meta: 'AddToCart', params: { ...offerData(), trigger } }));
  }
  function startForm() {
    if (session.form) return;
    session.form = { startedAt: now(), touched: [], filled: [], lastField: '', errors: 0, attempts: 0, submitted: false };
    // Starting the form means an offer is in hand, so AddToCart always precedes InitiateCheckout.
    trackAddToCart('form_start');
    emit('form_start', { meta: 'InitiateCheckout', params: { ...offerData(), form_id: FORM_ID, content_category: 'order_form' } });
  }
  function trackFieldFocus(field) {
    const form = session.form;
    if (!form) return;
    form.lastField = field;
    if (form.touched.includes(field)) return;
    form.touched.push(field);
    emit('form_field_focus', { params: { form_id: FORM_ID, field_name: field, field_order: form.touched.length } });
  }
  function trackFieldComplete(field, filled) {
    const form = session.form;
    if (!form) return;
    // Focused, then left empty: the drop-off signal.
    if (!filled) { emit('form_field_skipped', { params: { form_id: FORM_ID, field_name: field } }); return; }
    if (form.filled.includes(field)) return;
    form.filled.push(field);
    emit('form_field_complete', { params: { form_id: FORM_ID, field_name: field, fields_filled: form.filled.length, seconds_since_start: Math.round((now() - form.startedAt) / 1000) } });
  }
  function trackFormValidationError(field, message) {
    if (session.form) session.form.errors += 1;
    emit('form_error', { meta: 'FormValidationError', params: { form_id: FORM_ID, field_name: field, error_message: message, error_count: session.form?.errors } });
  }
  // Fired before validation so attempts vs. errors is measurable.
  function trackFormSubmitAttempt() {
    startForm();
    const form = session.form;
    form.attempts += 1;
    emit('form_submit', { meta: 'FormSubmit', params: { form_id: FORM_ID, attempt: form.attempts, fields_filled: form.filled.length, seconds_to_submit: Math.round((now() - form.startedAt) / 1000) } });
  }
  function trackFormFailure(reason) {
    emit('form_submit_failed', { meta: 'FormFailed', params: { form_id: FORM_ID, error_message: reason } });
  }
  // Lead and Purchase carry the order's eventId, which the server also sends through the Conversions API.
  function trackOrderConversion({ eventId, wilaya }) {
    session.lead = true;
    if (session.form) session.form.submitted = true;
    const form = session.form;
    const params = { ...offerData(), form_id: FORM_ID, content_category: 'order', wilaya, seconds_to_convert: secondsOnPage(), fields_filled: form?.filled.length, form_attempts: form?.attempts, form_errors: form?.errors };
    emit('generate_lead', { meta: 'Lead', params, eventId });
    emit('purchase', { meta: 'Purchase', params, eventId });
  }
  function trackFormAbandon(reason) {
    const form = session.form;
    if (!form || form.submitted) return;
    once('form_abandon', () => emit('form_abandon', { params: { form_id: FORM_ID, reason, last_field: form.lastField, fields_touched: form.touched.length, fields_filled: form.filled.length, form_errors: form.errors, form_attempts: form.attempts, seconds_in_form: Math.round((now() - form.startedAt) / 1000) } }));
  }

  /* ---------- leaving ---------- */

  function funnelStage() {
    if (session.lead) return 'converted';
    if (session.form?.submitted) return 'submitted';
    if (session.form) return 'form_started';
    if (session.ctaClicks > 0) return 'cta_clicked';
    if (session.maxScroll >= 75) return 'read_full';
    if (session.maxScroll >= 25) return 'scrolled';
    if (session.interactions > 0) return 'interacted';
    return 'landed';
  }
  // Fired on the first visibilitychange → hidden (the only signal that survives a mobile app switch) and on pagehide.
  function trackPageLeave(reason) {
    if (session.leaveSent) return;
    session.leaveSent = true;
    const stage = funnelStage();
    const bounced = !session.lead && session.interactions === 0 && session.maxScroll < 25 && engagedSeconds() < 10;
    emit('page_leave', { params: { leave_reason: reason, leave_index: session.hiddenCount, funnel_stage: stage, deepest_section: session.deepestSection, sections_list: session.sections.join('>').slice(0, 100), max_scroll: session.maxScroll, total_clicks: session.clicks, cta_clicks: session.ctaClicks, tab_hides: session.hiddenCount, converted: session.lead, bounced } });
    // The retargeting audience: read the offer and left without ordering. Once per page view.
    if (!session.lead) once('abandonment', () => emit('abandonment', { params: { funnel_stage: stage, max_scroll: session.maxScroll, form_started: Boolean(session.form), fields_filled: session.form?.filled.length ?? 0, engaged_seconds: engagedSeconds() } }));
    if (bounced) once('bounce', () => emit('bounce', { params: { max_scroll: session.maxScroll } }));
    trackFormAbandon(reason);
  }

  /* ---------- interactions ---------- */

  function markInteraction(kind) {
    const at = now();
    // A scroll gesture fires dozens of events; only one a second counts as an interaction.
    if (session.firstInteractionAt === null || at - session.lastActivityAt > 1000) session.interactions += 1;
    session.lastActivityAt = at;
    if (session.firstInteractionAt !== null) return;
    session.firstInteractionAt = at;
    emit('first_interaction', { params: { interaction_type: kind } });
  }
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(type => addEventListener(type, () => markInteraction('input'), { passive: true }));

  // Scroll depth and direction. Whatever is visible on load seeds the baseline without reporting a milestone.
  let scrollTicking = false, scrolled = false, lastY = scrollY, scrollBackReported = false;
  function measureScroll(silent) {
    scrollTicking = false;
    const depth = Math.max(0, Math.min(100, Math.round((scrollY + innerHeight) / Math.max(document.documentElement.scrollHeight, 1) * 100)));
    if (depth > session.maxScroll) {
      session.maxScroll = depth;
      for (const mark of SCROLL_MARKS) {
        if (depth < mark || session.scrollMarks.has(mark)) continue;
        session.scrollMarks.add(mark);
        if (silent) continue;
        emit('scroll', { meta: `ScrollDepth${mark}`, params: { percent_scrolled: mark, depth_label: `${mark}%` } });
        if (mark === 50) trackViewContent('scroll_50');
      }
    } else if (!scrollBackReported && session.maxScroll - depth >= 25 && session.maxScroll >= 50) {
      // Scrolled a long way back up after reading half: usually re-reading before deciding.
      scrollBackReported = true;
      emit('scroll_back', { params: { from_depth: session.maxScroll, to_depth: depth } });
    }
  }
  measureScroll(true);
  addEventListener('scroll', () => {
    markInteraction('scroll');
    if (!scrolled) { scrolled = true; emit('first_scroll', { params: { direction: scrollY >= lastY ? 'down' : 'up' } }); }
    lastY = scrollY;
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => measureScroll(false));
  }, { passive: true });

  // Engaged time, reading milestones and idle detection.
  const timeMarks = new Set();
  let idleReported = false;
  setInterval(() => {
    const visible = document.visibilityState === 'visible';
    const sinceActivity = now() - session.lastActivityAt;
    if (visible && sinceActivity < ENGAGED_WINDOW_MS) { session.activeMs += 1000; idleReported = false; }
    else if (visible && sinceActivity >= IDLE_MS && !idleReported) { idleReported = true; emit('user_idle', { params: { idle_seconds: Math.round(sinceActivity / 1000), funnel_stage: funnelStage() } }); }
    const elapsed = secondsOnPage();
    for (const mark of TIME_MARKS) {
      if (elapsed < mark || timeMarks.has(mark)) continue;
      timeMarks.add(mark);
      emit('time_on_page', { meta: `TimeOnPage${mark}s`, params: { milestone_seconds: mark } });
    }
  }, 1000);

  /* ---------- clicks: declared (data-track), inferred (links) and friction ---------- */

  // Text inside the order card can echo what the visitor typed (the thank-you note repeats the phone), so it is never used as a label.
  function labelOf(el) {
    if (el.closest('.elb-form-card')) return el.id || el.tagName.toLowerCase();
    return el.getAttribute('data-track-label') || el.getAttribute('aria-label') || el.textContent.trim().replace(/\s+/g, ' ').slice(0, 80) || el.tagName.toLowerCase();
  }
  function positionOf(el) {
    const ratio = (el.getBoundingClientRect().top + scrollY) / (document.documentElement.scrollHeight || 1);
    return ratio < 0.2 ? 'top' : ratio < 0.7 ? 'middle' : 'bottom';
  }
  const trackDownload = (file, fileLocale) => emit('file_download', { meta: 'DownloadBrochure', params: { file_name: file, file_locale: fileLocale, link_url: file } });
  const trackContact = (channel, position) => emit('contact', { meta: 'Contact', params: { contact_channel: channel, position } });
  const trackNavClick = (target, label) => emit('nav_click', { meta: 'ClickNav', params: { nav_target: target, nav_label: label } });
  // Any click that takes the visitor to the order form.
  function trackOrderIntent(id, label, section) {
    emit('order_intent', { params: { cta_id: id, cta_label: label, section } });
    trackAddToCart('cta');
  }

  let lastClickAt = 0, lastX = 0, lastClickY = 0, streak = 0, rageReportedAt = 0, deadClicks = 0;
  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    session.clicks += 1;

    const near = Math.abs(event.clientX - lastX) < 40 && Math.abs(event.clientY - lastClickY) < 40;
    streak = event.timeStamp - lastClickAt < 800 && near ? streak + 1 : 1;
    lastClickAt = event.timeStamp; lastX = event.clientX; lastClickY = event.clientY;
    if (streak >= 3 && event.timeStamp - rageReportedAt > 5000) {
      rageReportedAt = event.timeStamp;
      emit('rage_click', { params: { target_label: labelOf(target), click_count: streak } });
    }

    const tracked = target.closest('[data-track]');
    if (tracked) {
      const { track: id = 'unknown', trackType: type = 'cta', trackSection: section } = tracked.dataset;
      const href = tracked.getAttribute('href') || undefined;
      const label = labelOf(tracked);
      session.ctaClicks += 1;
      emit('cta_click', { meta: 'ClickCTA', params: { cta_id: id, cta_type: type, cta_label: label, section, link_url: href, position: positionOf(tracked), cta_order: session.ctaClicks } });
      if (type === 'download' && href) trackDownload(href, tracked.dataset.trackLocale || 'unknown');
      if (type === 'contact') trackContact(id, positionOf(tracked));
      if (type === 'schedule') emit('schedule_click', { meta: 'Schedule', params: { cta_id: id } });
      if (type === 'nav') trackNavClick(href || id, label);
      if (href?.startsWith(ORDER_HASH)) trackOrderIntent(id, label, section);
      return;
    }

    const link = target.closest('a[href]');
    if (link) {
      const href = link.getAttribute('href');
      const label = labelOf(link);
      if (link.hasAttribute('download') || href.endsWith('.pdf')) trackDownload(href, 'unknown');
      else if (href.startsWith('tel:')) trackContact('phone');
      else if (href.startsWith('mailto:')) trackContact('email');
      else if (href.startsWith('#')) { trackNavClick(href, label); if (href.startsWith(ORDER_HASH)) trackOrderIntent('link', label); }
      else if (link.hostname && link.hostname !== location.hostname) emit('outbound_click', { params: { link_url: href, link_label: label } });
      else trackNavClick(href, label);
      return;
    }

    // Form controls report through the form funnel; a raw click would only duplicate it.
    if (target.closest('input, select, textarea, label')) return;
    const button = target.closest('button, [role="button"], summary');
    if (button) { emit('ui_click', { params: { element: button.tagName.toLowerCase(), element_label: labelOf(button) } }); return; }
    // A click on nothing interactive, capped so a visitor drumming on the page can't flood the pixel.
    if (deadClicks++ < 5) emit('dead_click', { params: { target_label: labelOf(target) } });
  }, { capture: true });

  // FAQ answers opened. `toggle` doesn't bubble, so it's caught on the way down.
  document.addEventListener('toggle', event => {
    const item = event.target;
    if (!(item instanceof HTMLDetailsElement) || !item.open) return;
    const items = [...document.querySelectorAll('.elb-faq details')];
    emit('faq_open', { meta: 'FAQOpen', params: { group: 'faq', item_index: items.indexOf(item) + 1, item_label: item.querySelector('summary')?.textContent.trim() } });
  }, true);

  // Media: native players report `play`; embedded players are cross-origin iframes, where focus moving into one is the click that starts it.
  function trackMediaPlay(el) {
    const card = el.closest('.elb-media-card');
    if (!card) return;
    const kind = el.tagName === 'AUDIO' || el.closest('.elb-media-frame.audio') ? 'audio' : 'video';
    once(`media_play_${el.src}`, () => emit(`${kind}_play`, { params: { section: 'media', content_name: el.title || el.getAttribute('aria-label'), media_index: [...document.querySelectorAll('.elb-media-card')].indexOf(card) + 1 } }));
  }
  document.addEventListener('play', event => trackMediaPlay(event.target), true);
  addEventListener('blur', () => { if (document.activeElement?.tagName === 'IFRAME') trackMediaPlay(document.activeElement); });

  // Exit intent: the pointer leaves through the top of the window (desktop only).
  if (!matchMedia('(pointer: coarse)').matches) {
    let exitFired = false;
    document.addEventListener('mouseout', event => {
      if (exitFired || event.relatedTarget || event.clientY > 8) return;
      exitFired = true;
      emit('exit_intent', { params: { deepest_section: session.deepestSection, form_started: Boolean(session.form), has_lead: session.lead } });
    });
  }

  // Leaving: tab switch, close, navigation away, back/forward cache restore.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      session.hiddenCount += 1;
      emit('tab_hidden', { params: { hidden_count: session.hiddenCount } });
      trackPageLeave('hidden');
    } else {
      emit('tab_return', { params: { away_seconds: hiddenAt ? Math.round((Date.now() - hiddenAt) / 1000) : 0, return_count: session.hiddenCount } });
      // Allow a final leave event if the visitor really goes away later.
      session.leaveSent = false;
    }
  });
  addEventListener('pagehide', () => trackPageLeave('pagehide'));
  addEventListener('pageshow', event => {
    if (!event.persisted) return;
    session.leaveSent = false;
    emit('page_restored');
  });

  // Copy, print and client-side errors.
  document.addEventListener('copy', () => {
    const selection = getSelection();
    const text = selection?.toString() || '';
    if (!text) return;
    // A copy from the order card can hold the visitor's own phone number.
    const fromOrder = selection.anchorNode?.parentElement?.closest('.elb-form-card');
    emit('copy_text', { params: { copied_length: text.length, copied_snippet: fromOrder ? undefined : text.slice(0, 60) } });
  });
  addEventListener('beforeprint', () => emit('print_page'));
  let clientErrors = 0;
  addEventListener('error', event => { if (clientErrors++ < 3) emit('client_error', { params: { error_message: event.message, error_source: event.filename || 'window' } }); });
  addEventListener('unhandledrejection', event => { if (clientErrors++ < 3) emit('client_error', { params: { error_message: String(event.reason).slice(0, 100), error_source: 'promise' } }); });

  /* ---------- sections: reach, order and dwell for every [data-section] ---------- */

  const sectionNodes = [...document.querySelectorAll('[data-section]')];
  const enteredAt = new Map();
  const reportDwell = (name, start) => { const dwell = Math.round((Date.now() - start) / 1000); if (dwell >= 2) emit('section_dwell', { params: { section_name: name, dwell_seconds: dwell } }); };
  if (sectionNodes.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const name = entry.target.dataset.section;
        // Tall sections never reach a high ratio, so filling a good part of the viewport counts as seen too.
        const seen = entry.isIntersecting && (entry.intersectionRatio >= 0.3 || entry.intersectionRect.height >= innerHeight * 0.4);
        if (seen) {
          if (!enteredAt.has(name)) enteredAt.set(name, Date.now());
          if (session.sections.includes(name)) continue;
          session.sections.push(name);
          session.deepestSection = name;
          emit('section_view', { meta: 'ViewSection', params: { section_name: name, section_index: sectionNodes.indexOf(entry.target) + 1, seconds_to_view: secondsOnPage() } });
          // The product composition is the strongest ViewContent trigger.
          if (name === 'ingredients') trackViewContent('ingredients');
          if (name === 'order') emit('form_view', { params: { form_id: FORM_ID, seconds_to_view: secondsOnPage() } });
          continue;
        }
        const start = enteredAt.get(name);
        if (start) { enteredAt.delete(name); reportDwell(name, start); }
      }
    }, { threshold: [0, 0.3, 0.6] });
    sectionNodes.forEach(node => observer.observe(node));
    addEventListener('pagehide', () => { enteredAt.forEach((start, name) => reportDwell(name, start)); enteredAt.clear(); });
  }

  /* ---------- the order form, field by field ---------- */

  const orderForm = document.getElementById('elb-form');
  if (orderForm) {
    const fieldOf = el => el.closest?.('.elb-field') && el.name;
    orderForm.addEventListener('focusin', event => { const field = fieldOf(event.target); if (!field) return; startForm(); trackFieldFocus(field); });
    // Autofill can fill fields without focusing them.
    orderForm.addEventListener('input', event => { if (fieldOf(event.target)) startForm(); });
    orderForm.addEventListener('focusout', event => { const field = fieldOf(event.target); if (field) trackFieldComplete(field, event.target.type === 'checkbox' ? event.target.checked : event.target.value.trim().length > 0); });
    orderForm.addEventListener('change', event => {
      const el = event.target;
      if (el.name === 'offers') { emit('select_offer', { params: offerData() }); trackAddToCart('offer_change'); return; }
      const field = fieldOf(el);
      if (!field) return;
      startForm();
      if (el.tagName === 'SELECT' && el.value) trackFieldComplete(field, true);
      if (el.type === 'checkbox' && el.checked) trackFieldComplete(field, true);
    });
  }

  /* ---------- session start ---------- */

  const firstTouch = getAttribution();
  emit('session_start', { withDevice: true, params: { landing_path: location.pathname, fbclid: firstTouch.fbclid ? 'yes' : 'no', utm_content: firstTouch.utm_content, utm_term: firstTouch.utm_term } });

  window.ELB_JOURNEY = { emit, trackFormSubmitAttempt, trackFormValidationError, trackFormFailure, trackOrderConversion };
})();
