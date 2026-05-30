#!/usr/bin/env python3
"""
Delete XHS videos that have passed their 7-day expiry.
Runs as a daily GitHub Actions job.
Uses only stdlib (urllib) — no pip install needed.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone


def sb_url(path):
    return os.environ["SUPABASE_URL"].rstrip("/") + path


def sb_headers(extra=None):
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def fetch(method, url, headers, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"Cleanup run at {now}")

    # 1. Fetch expired rows
    params = urllib.parse.urlencode({
        "expires_at": f"lt.{now}",
        "select": "id,storage_path,mls_number,agent_id",
    })
    status, body = fetch("GET", sb_url(f"/rest/v1/xhs_videos?{params}"), sb_headers())
    if status != 200:
        print(f"Failed to fetch expired videos: {status} {body[:200]}", file=sys.stderr)
        sys.exit(1)

    rows = json.loads(body)
    if not rows:
        print("No expired videos found.")
        return

    print(f"Found {len(rows)} expired video(s) to delete.")

    deleted = 0
    for row in rows:
        vid_id = row["id"]
        storage_path = row.get("storage_path", "")

        # 2. Delete file from Supabase Storage
        if storage_path:
            s_status, s_body = fetch(
                "DELETE",
                sb_url(f"/storage/v1/object/xhs-videos/{storage_path}"),
                {"Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}"},
            )
            if s_status in (200, 204, 404):
                print(f"  Storage deleted: {storage_path}")
            else:
                print(f"  Storage delete failed ({s_status}): {storage_path} — {s_body[:100]}")

        # 3. Delete DB row
        d_params = urllib.parse.urlencode({"id": f"eq.{vid_id}"})
        d_status, _ = fetch(
            "DELETE",
            sb_url(f"/rest/v1/xhs_videos?{d_params}"),
            sb_headers({"Prefer": "return=minimal"}),
        )
        if d_status in (200, 204):
            deleted += 1
        else:
            print(f"  DB row delete failed for id={vid_id}")

    print(f"Done. Deleted {deleted}/{len(rows)} expired XHS videos.")


if __name__ == "__main__":
    for var in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if not os.environ.get(var):
            print(f"Missing env var: {var}", file=sys.stderr)
            sys.exit(1)
    main()
