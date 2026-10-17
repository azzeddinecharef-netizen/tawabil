# Tracking reference

The Meta Pixel (`2240942626481684`) loads from the `<head>` of
`public/index.html`, so `PageView` counts visitors who leave before the page
finishes loading. Everything else goes through one place, `emit()` in
`public/journey.js`:

- Standard events via `fbq('track', …)`, everything else via
  `fbq('trackCustom', …)`.
- Every call carries its own `eventID`. Lead and Purchase reuse the order's
  `eventId`, which `course-api` also sends through the Conversions API, so
  Meta counts each order once.

`admin.html` never loads the pixel, so staff working on orders don't end up in
the ad audiences.

Add `?analytics_debug=1` to the page URL to see every event in the browser console.

## Context on every event

`page_path`, `locale`, `seconds_on_page`, `engaged_seconds` (tab visible **and**
visitor active), `scroll_depth`, `sections_seen`, `interactions`, `utm_source`,
`utm_medium`, `utm_campaign`, `referrer`.

## The funnel

| Step | Meta | Fires when |
| --- | --- | --- |
| 1. Land | `PageView` | Page load (pixel snippet) |
| 2. Read | `ViewContent` | Ingredients section reached, or 50 % scrolled (once) |
| 3. Want it | `AddToCart` | First "اطلب" button click, offer change, or form start (once) |
| 4. See the form | `FormView` | Order section scrolls into view |
| 5. Start the form | `InitiateCheckout` | First focus or autofill on any field, or first submit (once) |
| 6. Convert | `Lead` + `Purchase` | Server accepted the order |

ViewContent, AddToCart, InitiateCheckout, Lead and Purchase carry the selected
offer: `content_ids` (`pack5` / `bag1`), `content_name`, `contents`, `value`
(15000 / 3000) and `currency: DZD`. Lead and Purchase also carry the wilaya,
time to convert and form attempts/errors.

## Session & page

| Meta | Notes |
| --- | --- |
| `SessionStart` | Device, viewport, connection type, landing path, campaign, whether `fbclid` was present |
| `PageRestored` | Back/forward cache restore |
| `FirstInteraction` | First scroll/click/key |

## Scroll & reading

| Meta | Notes |
| --- | --- |
| `ScrollDepth10/25/50/75/90/100` | What is visible on load doesn't count |
| `FirstScroll` | With direction |
| `ScrollBack` | Scrolled ≥ 25 % back up after reading half, usually re-reading |
| `ViewSection` | Per `[data-section]`: name, order, seconds to reach |
| `SectionDwell` | Seconds spent in a section (≥ 2 s) |
| `TimeOnPage5s/15s/30s/60s/120s/180s/300s` | Reading milestones |
| `UserIdle` | Visible but untouched for 45 s |

Sections: `hero`, `stats`, `media`, `uses`, `dose`, `ingredients`, `pack`,
`faq`, `final`, `order`, `footer`. Adding `data-section="…"` to new markup is
all it takes to track it.

## Clicks

`ClickCTA` fires for every element carrying `data-track`, with `cta_id`,
`cta_type`, `cta_label`, `section`, `link_url`, `position` and the click's
order in the visit. Typed CTAs also fire a second, sharper event:

| `data-track-type` / target | Extra event |
| --- | --- |
| `contact` | `Contact` |
| `schedule` | `Schedule` |
| `download` | `DownloadBrochure` |
| `nav` | `ClickNav` |
| any `href="#elb-order"` | `OrderIntent` (+ `AddToCart` the first time) |

Currently tagged: `hero_primary`, `final_cta`, `sticky_cta`, `footer_facebook`,
`footer_facebook_2`. Adding `data-track="…" data-track-type="…"
data-track-section="…"` to a new element is all that's needed.

Untagged links are still classified (download / `tel:` / `mailto:` / outbound /
in-page anchor). Other UI reports `UiClick`, `FAQOpen` (with the question),
`SelectOffer`, `VideoPlay` / `AudioPlay` (media section).

## The form, field by field

| Meta | Notes |
| --- | --- |
| `FormFieldFocus` | Field name + order of entry |
| `FormFieldComplete` | Field left with a value; running fill count and time |
| `FormFieldSkipped` | Field focused then left empty, the drop-off signal |
| `FormValidationError` | Which field blocked the submit, and the message |
| `FormSubmit` | Attempt number, fields filled, seconds to submit |
| `FormFailed` | Server rejected it |
| `FormAbandon` | Left after starting: last field, touched/filled counts, errors, time in form |

## Leaving

Fired on `visibilitychange → hidden` (the only signal that survives a mobile
app switch) and on `pagehide`.

| Meta | Notes |
| --- | --- |
| `PageLeave` | `funnel_stage`, `deepest_section`, `sections_list`, `max_scroll`, clicks, tab hides, `converted`, `bounced` |
| `Abandonment` | Left without ordering, the audience to retarget |
| `Bounce` | No interaction, < 25 % scrolled, < 10 s engaged |
| `ExitIntent` | Pointer left through the top of the window (desktop) |
| `TabHidden` / `TabReturn` | With seconds away |

`funnel_stage` is one of: `landed`, `interacted`, `scrolled`, `read_full`,
`cta_clicked`, `form_started`, `submitted`, `converted`.

## Friction & diagnostics

`RageClick`, `DeadClick` (capped at 5/visit), `CopyText`, `PrintPage`,
`ClientError` (capped at 3/visit), `UiClick`.

Every event above reaches the Meta Pixel. For a quieter Events Manager, pass
`meta: false` to `emit()` for the diagnostics; that's the single switch per event.

## Attribution

First-touch UTM parameters plus `fbclid` / `gclid` / `ttclid` and the referrer
are parsed from the first URL of the session and kept in `sessionStorage`. A
visit that arrives with only `fbclid` is recorded as `facebook / paid_social`
rather than "direct".

## Privacy

No name, phone or address is ever sent as an event parameter. Text inside the
order card (where the thank-you note repeats the phone) is never used as a click
label or copy snippet. Name and phone reach Meta only through the Conversions
API, SHA-256 hashed on the server, after the visitor ticks the consent box.

## Suggested Meta setup

- Optimise for `Purchase` (value-based) or `Lead`.
- Custom conversions: `InitiateCheckout` (form start), `ViewContent` (read the offer).
- Retargeting audiences: `Abandonment`, `FormAbandon`, `ScrollDepth75`, `AddToCart`, `ExitIntent`.
- Exclusion audience: `Purchase`.
