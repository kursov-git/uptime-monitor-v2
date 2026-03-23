# Umami Synthetic Analytics Notes

This document captures the current operational guidance for using `uptime-monitor-v2` with Umami-backed analytics endpoints without polluting real traffic reports.

## Core Rule

Synthetic checks only pollute Umami statistics when they send traffic directly to the Umami ingestion endpoint such as `POST /api/send`, or when a real browser-based monitor loads a page and executes the tracker JavaScript.

Ordinary `uptime-monitor-v2` HTTP checks do not execute browser JavaScript. They use server-side HTTP requests only, including:
- plain `GET` requests
- authenticated flows using cookies or form login
- response body text matching
- JSON response assertions

Because of that, a normal page check against `https://service.example.com` does not generate an Umami pageview by itself.

## What Does And Does Not Reach Umami

Does not reach Umami by default:
- `GET /`
- `GET /healthz`
- login flow checks that fetch HTML and look for expected text
- authenticated page checks that only inspect response bodies

Does reach Umami:
- synthetic monitors that intentionally call `POST https://stat.example.com/api/send`
- external browser-based monitors that load a page and execute the Umami tracker

## Excluding Synthetic Events From Real Stats

For Umami, the reliable boundary is the `website` id. If a synthetic monitor uses the same `website` id as a real site, the event is counted in that site's analytics.

Fields such as `tag`, `name`, or `data` are useful for filtering and diagnostics, but they do not remove the event from the main totals of that `website`.

Recommended approach:
1. Create a dedicated Umami website for synthetic checks.
2. Point all synthetic `/api/send` monitors to that synthetic website id.
3. Keep the original `hostname` and `url` in the payload so the synthetic site still shows which production host was checked.

This allows one shared synthetic site for all monitored services while keeping real sites clean.

## Recommended Shared Synthetic Site

For a single shared bucket of synthetic traffic:
- `Name`: `Synthetic checks`
- `Domain`: `stat.alutech24.com`

The `Domain` field is secondary here because this site is not used for real frontend tracking. The important part is that all synthetic events use this site's `website` UUID.

## Where To Find The Synthetic Website UUID

After creating the Umami website, get its id from either source:
- the Umami UI `Edit` page, where the tracking snippet contains `data-website-id="..."`
- the Umami API, for example `GET /api/websites`

## Safe Payload Strategy

If an existing `/api/send` monitor is already working, change it in two stages.

Stage 1: keep the existing `website` id and add only labels or headers if needed.

Stage 2: once the synthetic Umami website exists, replace `payload.website` with the synthetic website UUID.

This avoids breaking a working monitor while introducing a new analytics bucket.

## Recommended Synthetic Request Shape

Example headers:

```json
{
  "Content-Type": "application/json",
  "User-Agent": "UptimeMonitor/1.0 synthetic",
  "X-Synthetic-Check": "1"
}
```

Example payload after the synthetic Umami website is created:

```json
{
  "type": "event",
  "payload": {
    "website": "SYNTHETIC_WEBSITE_ID",
    "screen": "1280x720",
    "language": "en-US",
    "title": "alutech24",
    "hostname": "auth.alutech24.com",
    "url": "https://auth.alutech24.com/en/login",
    "referrer": "",
    "tag": "synthetic-uptime"
  }
}
```

Notes:
- keep the payload minimal unless Umami requires more fields
- `tag` is useful for filtering inside the synthetic site
- `User-Agent` and `X-Synthetic-Check` help identify synthetic traffic in logs and edge controls

## Operator Guidance For Existing Monitors

When deciding whether a monitor needs Umami isolation, use this rule:
- if the monitor only checks an application page or API route, it does not need Umami-specific handling
- if the monitor posts directly to `/api/send`, move it to the synthetic Umami website
- if a third-party browser monitor opens tracked pages, filter or block that monitor separately at the tracker or edge layer

## Current Conclusion

For the current `auth.alutech24.com` synthetic analytics check:
- the monitor should remain a `POST` request to `stat.alutech24.com/api/send`
- the monitor can use synthetic headers such as `User-Agent` and `X-Synthetic-Check`
- the event should use a dedicated synthetic Umami `website` UUID
- ordinary authenticated page checks in `uptime-monitor-v2` do not pollute Umami statistics unless they explicitly hit the analytics ingestion endpoint
