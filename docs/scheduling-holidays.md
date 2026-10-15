# Scheduling policy and holiday awareness

Review-only follow-up to #44. No deployment, real Firebase access, production
configuration or payment/email activation is authorized. All tests use fixed
`demo-fawcett-dev` emulators. Public holiday reference data is separate from all
private scheduling/client records; no Apple/family calendar is connected or imported.

## Confirmed policy

New, unsaved policy proposals use owner-confirmed America/Edmonton and studio hours
Sunday–Friday 11:00–20:00; Saturday closed. Appointment-only, no walk-ins and no public
self-booking remain the operating model. One chair is still shared by Ben and Autumn.
Artist availability, buffers and transition completeness are not invented: artist
hours remain empty, enabled stays false, and business-calendar transition review is
still required. Existing stored policies are preserved exactly. Apply the confirmed
hours/timezone button and explicitly review/save to update an existing policy.

## Reference calendar, categories and boundaries

162 selected offline references cover 2026–2031, in three distinct categories:
Jewish/Hebrew, Western Christian and Alberta. Overlapping categories (for example
Good Friday) retain separate labeled markers. The next three upcoming holidays are
visible above the calendar; expand the holiday panel for the next year plus the
currently displayed date range, category filters and occurrence controls.

The pinned generator produces selected Diaspora Jewish holidays, including the full
eight-day Passover period, using Hebcal Hebrew dates. Each reference begins at
calculated sunset on the preceding Edmonton date, not at midnight of the printed
holiday date. It ends at calculated 8.5-degree nightfall on the final observed day.
Multi-day periods include intermediate days as references, not automatic closures.
Chanukah's candle-lighting eve is not incorrectly treated as another full holiday
day. The generator excludes Erev records from day grouping and retains the preceding
evening through the actual final day.

Solar times are approximate city-centre, sea-level references. They are not actual
site horizon observations or a religious ruling. Owners must decide location/solar
convention, preparation/candle-lighting lead time, Diaspora versus another practice,
which intermediate days they observe and when to reopen. These decisions can be
expressed as exact reviewed intervals; the system does not invent a studio closure.

Western references use Gregorian Easter (Good Friday, Easter Sunday/Monday) and
Christmas Eve/Day. Alberta references use the pinned CA/AB public/optional dataset;
public/statutory labels do not automatically imply closure or resolve employment
entitlements/substitute days. See [source versions and attribution](holiday-reference-attribution.md).

`npm run holidays:generate` regenerates the committed data; review the diff manually.
`npm run holidays:check` and the environment tests verify byte-for-byte reproducibility
from pinned dev tools. There are no runtime calendar-service calls or scheduled
updates. Do not regenerate/approve holidays automatically during production startup.
Changed dates/conventions invalidate non-reminder controls through exact source
fingerprints. Plan dataset extensions and owner re-review before coverage ends.
Dates outside coverage show an explicit warning, not a fabricated empty holiday
calendar. Reference gaps do not automatically close the studio; staff must check an
authoritative source manually before confirming such a booking.

## Three per-occurrence states

- **Reminder only (default):** marker/UI reminder, no booking rejection, no closure,
  email, notification queue entry or scheduled reminder job.
- **Review before booking:** owner selects resource and exact interval, optionally
  including preparation time. An intersecting appointment INCLUDING buffers requires
  a specific acknowledgement token bound to the current interval/resources, scheduling
  policy revision and holiday-control revisions. Changed times or controls require
  renewed acknowledgement; checking the generic appointment box is insufficient.
- **Explicitly approved closure:** owner selects exact start/end/resource and checks
  the closure approval. Partial days and multi-day holiday periods are supported.
  New overlapping bookings fail; an acknowledgement cannot override a closure.

All controls apply to one occurrence, not every future year. Default intervals shown
in the editor come from reference boundaries (start rounded down/end up to minutes);
review or change them before saving. Preparation intervals may extend at most 24 hours
beyond either reference boundary. Use ordinary availability blocks for other dates or
more complex split intervals. One holiday control has one resource/interval; use
existing availability blocks for additional independently reviewed exceptions.

Calendar markers show exact closure/review times and resources. A reference on a
different day of a multi-day holiday does not mean that day is closed if the owner
approved only a partial interval. Booking preview and server checks use absolute
instants interpreted in Edmonton; afternoon/evening overlaps on the preceding date
are included. Separate artist/chair reservation checks remain authoritative.

## Authorization, conflicts and history

Controls are private `schedulingHolidayPolicies/{referenceId}` records with source
hash, revision, reviewed actor/time and private audit. They are default-denied to
browser SDK callers, including signed-in admins; all supported application mutations
use the existing active-admin API, maintenance fence, idempotency receipts and coordination lock. No Firestore
rules change is needed. Privileged Admin SDK/IAM writers bypass rules and must follow
the separately documented shutdown and reconciliation controls. A closure approval checks current active reservations and
rejects with conflict IDs rather than canceling/moving appointments. Unknown legacy
appointments prevent closure approval. Concurrent closure/booking transactions cannot
both commit a conflict. Changing timezone away from Edmonton while active holiday
controls exist is rejected instead of reinterpreting them.

Reminder reset explicitly withdraws a control interval and is audited. Missing or
changed source data for a non-reminder control fails closed pending review; do not
silently delete controls to bypass a source-change error. Invalid inventory also
fails closed. Safe terminal status-only appointment changes remain possible without
reinterpreting old holiday review evidence, and preserve the scheduling audit.

Appointment holiday acknowledgements contain only public reference IDs/hash/version;
no holiday, family, internal-note or payment details are automatically copied into
portal projections. Original appointment IDs, history, private notes, account linking,
financial evidence, portal review and direct-write denials remain unchanged.

## Owner decisions and rollout

Before any separately approved production configuration, choose:

1. Which specific Jewish holidays/intermediate days to observe, especially Passover;
   no observance selection or closure is inferred from category membership.
2. Reminder versus mandatory review versus closure, per occurrence/year.
3. Exact prep/sundown/nightfall/reopening intervals and any artist-only exceptions.
4. Which Western/Alberta dates (and any additional optional/substitute days) matter.
5. Actual artist availability/buffers and when to finish the Apple business-calendar
   reconciliation; confirmed studio hours do not establish those facts.
6. Who reviews annual source updates and future dates beyond 2031.

Keep the coordinated production rollout gates, backups, write-fence procedures and
production migration hard-disable intact. No Production environment variables, rules,
Vercel settings, real data or existing stored policies were changed by this PR.

## Validation (2026-10-15)

- `npm test`: all 446 tests passed, zero failures, across all 11 active suites.
  Scheduling includes 47 tests: 14 new holiday/control cases and 33 existing
  scheduling regressions. Four additional environment tests verify reference dates,
  category separation, coverage warnings and reproducibility.
- Negative cases include anonymous/non-admin access, direct browser reads/writes
  even from admins, forged approval/source hashes, stale review tokens/revisions,
  invalid DST times, changed reference data and maintenance denial.
- `npm run holidays:check`: all 162 offline references reproduce exactly.
- `npm run lint`: passed with the three existing homepage image warnings.
- `npm run build`: optimized production build passed using isolated demo settings.
- `git diff --check`: passed. No production access, rules deployment, real email,
  provider payment calls or family-calendar access was used.
