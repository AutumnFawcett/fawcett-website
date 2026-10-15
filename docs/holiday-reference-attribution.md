# Holiday reference provenance and attribution

`data/holiday-reference.json` contains generated public date facts, source metadata
and approximate Edmonton solar reference times. It contains no client, family or
private calendar data. It is reproducible from pinned **development-only** packages;
none of those calendar generators is imported into the application runtime.

- Hebcal contributors: [@hebcal/core](https://github.com/hebcal/hebcal-es6), 6.14.4,
  GPL-2.0-or-later development tool; Hebrew conversion and NOAA solar calculations.
  [Hebcal holiday reference](https://www.hebcal.com/holidays/).
- Holger/commenthol and contributors: [date-holidays](https://github.com/commenthol/date-holidays),
  3.37.0, selected CA/AB public and optional date data. Source is the pinned package's
  `data/countries/CA.yaml`, with upstream attribution/source comments retained there.
  Its LICENSE specifies **CC BY-SA 3.0 data / ISC code**, while its package SPDX field
  says CC-BY-3.0. Preserve the stricter upstream data notice; do not remove attribution.
- Holger/commenthol: [date-easter](https://github.com/commenthol/date-easter), 1.0.3,
  MIT, Gregorian Easter algorithm. Fixed Christmas dates and Easter-relative Western
  dates are reference facts, not a denominational observance mandate.
- [GeoNames Edmonton](https://www.geonames.org/5946768/edmonton.html) public city-centre
  coordinate reference, latitude 53.5461, longitude -113.4938. This is not a private
  family or studio geolocation. Solar calculations use sea-level convention.

The generated reference data file is provided under
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) with the above
attribution; this notice concerns the reference data, not the application's license.
It adapts public date/name/classification facts into the studio's category/interval
schema and adds calculated city-centre solar times. No third-party generator source
is copied into the runtime. Original upstream licenses are included in npm packages.

Owner-verification sources:

- [Alberta general holidays](https://www.alberta.ca/alberta-general-holidays)
- [US Naval Observatory — Easter](https://aa.usno.navy.mil/faq/easter)
- [Hebcal Jewish holidays](https://www.hebcal.com/holidays/)

The Alberta website was not retrievable through this environment's network policy;
no claim of a fresh legal review of that page is made. The pinned CA/AB package data
was inspected and generated offline. Classification, substitute-day treatment and
employment entitlement require owner review; no legal closure is inferred from a
public/optional reference label. The selected optional dates are not an exhaustive
list of every holiday an employer could choose to observe.
