#!/usr/bin/env python3
"""Pull Search Console data for gmt-optimizer.com and snapshot it to seo-data/.

Why snapshot at all: Search Console only retains 16 months, and its UI is poor at
showing *change*. Keeping our own daily JSON gives an agent a real history to diff
week over week, which is where the actual insight lives.

Setup (one-time, needs you):
  1. console.cloud.google.com -> new project -> enable "Google Search Console API"
  2. IAM -> Service Accounts -> create one -> Keys -> add key (JSON) -> download
  3. Save it as ~/.config/gsc/service-account.json  (chmod 600)
  4. In Search Console -> Settings -> Users and permissions -> Add user
     -> paste the service account's client_email -> Full (or Restricted) access
  5. pip install google-auth requests

Usage:
  python3 scripts/gsc-snapshot.py              # snapshot the trailing window
  python3 scripts/gsc-snapshot.py --days 90    # wider pull (first run / backfill)
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import sys

try:
    import requests
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request as GoogleRequest
except ImportError:
    sys.exit("missing deps — run: pip install google-auth requests")

SITE = os.environ.get("GSC_SITE", "https://gmt-optimizer.com/")
KEYFILE = pathlib.Path(os.environ.get(
    "GSC_KEYFILE", pathlib.Path.home() / ".config" / "gsc" / "service-account.json"))
OUTDIR = pathlib.Path(__file__).resolve().parent.parent / "seo-data"
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
API = "https://searchconsole.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query"

# Search Console data lags ~2-3 days; ending the window today would sample a
# partial final day and make every "yesterday vs today" diff look like a drop.
LAG_DAYS = 3


def token():
    if not KEYFILE.exists():
        sys.exit(f"no service-account key at {KEYFILE}\nsee the setup steps in this file's docstring")
    creds = service_account.Credentials.from_service_account_file(str(KEYFILE), scopes=SCOPES)
    creds.refresh(GoogleRequest())
    return creds.token


def query(tok, start, end, dimensions, limit=1000):
    """One searchAnalytics call. Returns rows with keys + metrics flattened."""
    body = {
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "dimensions": dimensions,
        "rowLimit": limit,
        "dataState": "final",
    }
    r = requests.post(
        API.format(site=requests.utils.quote(SITE, safe="")),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
        json=body, timeout=60)
    if r.status_code != 200:
        sys.exit(f"GSC API {r.status_code}: {r.text[:400]}")
    rows = []
    for row in r.json().get("rows", []):
        # A dimensionless query (site totals) returns rows with no "keys" field.
        rec = dict(zip(dimensions, row.get("keys", [])))
        rec.update({
            "clicks": row.get("clicks", 0),
            "impressions": row.get("impressions", 0),
            "ctr": round(row.get("ctr", 0), 5),
            "position": round(row.get("position", 0), 2),
        })
        rows.append(rec)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=28, help="window length in days (default 28)")
    args = ap.parse_args()

    end = dt.date.today() - dt.timedelta(days=LAG_DAYS)
    start = end - dt.timedelta(days=args.days - 1)
    tok = token()

    snapshot = {
        "site": SITE,
        "pulled_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "window": {"start": start.isoformat(), "end": end.isoformat(), "days": args.days},
        "totals": query(tok, start, end, []),
        "by_query": query(tok, start, end, ["query"]),
        "by_page": query(tok, start, end, ["page"]),
        "by_page_query": query(tok, start, end, ["page", "query"]),
        "by_date": query(tok, start, end, ["date"]),
    }

    OUTDIR.mkdir(exist_ok=True)
    stamp = end.isoformat()
    (OUTDIR / f"gsc-{stamp}.json").write_text(json.dumps(snapshot, indent=1))
    (OUTDIR / "latest.json").write_text(json.dumps(snapshot, indent=1))

    t = snapshot["totals"][0] if snapshot["totals"] else {}
    print(f"snapshot {stamp}  window {start}..{end} ({args.days}d)")
    print(f"  {t.get('clicks', 0)} clicks / {t.get('impressions', 0)} impressions "
          f"/ pos {t.get('position', 0)}")
    print(f"  {len(snapshot['by_query'])} queries, {len(snapshot['by_page'])} pages")
    print(f"  wrote {OUTDIR / f'gsc-{stamp}.json'}")


if __name__ == "__main__":
    main()
