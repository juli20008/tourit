#!/usr/bin/env python3
"""
Delete expired XHS video files from Cloudflare R2 (daily GitHub Actions job).

  1. xhs_videos rows past expires_at → delete the R2 object, then the row.
  2. xhs_video_jobs older than 7 days → delete their cover / temp intro /
     temp cover-background objects and clear those columns.
  3. Highlight clips (historical_live_tours) of listings that have been
     inactive for 7+ days → delete the clip file and row.

Safety: steps 1–2 only delete keys under DELETABLE_PREFIXES and never
anything still referenced by a highlight clip; step 3 only deletes the
exact file of a clip whose listing is inactive.

Env: DATABASE_URL, R2_ENDPOINT, S3_KEY, S3_SECRET, S3_BUCKET, R2_PUBLIC_URL
     DRY_RUN=1 → only print what would be deleted.
"""
import os
import re
import sys

import boto3
import psycopg2
from botocore.config import Config

DELETABLE_PREFIXES = ("xhs-videos/", "xhs-covers/", "tmp-intros/", "tmp-cover-bg/")
JOB_RETENTION_DAYS = 7
INACTIVE_GRACE_DAYS = 7
HIGHLIGHT_UPLOAD_RE = re.compile(r"^[0-9a-f]{32}\.(mp4|mov|webm|m4v)$")
DRY_RUN = os.environ.get("DRY_RUN", "").strip() in ("1", "true", "yes")


def key_from_url(url):
    """Public R2 URL → object key ('' if it isn't one of ours)."""
    if not url:
        return ""
    base = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    if base and url.startswith(base + "/"):
        return url[len(base) + 1:].split("?")[0]
    return ""


def main():
    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["S3_KEY"],
        aws_secret_access_key=os.environ["S3_SECRET"],
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )
    bucket = os.environ.get("S3_BUCKET", "tourit")
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    # Files still shown on listing pages must never be deleted.
    cur.execute("SELECT video_url FROM historical_live_tours")
    protected = {key_from_url(u) for (u,) in cur.fetchall()} - {""}

    def delete_key(key):
        if not key or not key.startswith(DELETABLE_PREFIXES) or key in protected:
            print(f"  skip (protected/unknown): {key!r}")
            return False
        if DRY_RUN:
            print(f"  [dry-run] would delete {key}")
            return True
        try:
            s3.delete_object(Bucket=bucket, Key=key)   # no error if already gone
            print(f"  deleted {key}")
            return True
        except Exception as e:
            print(f"  delete failed {key}: {e}", file=sys.stderr)
            return False

    # 1. Expired videos
    cur.execute("SELECT id, storage_path, video_url FROM xhs_videos WHERE expires_at < now()")
    rows = cur.fetchall()
    print(f"{len(rows)} expired video(s)")
    removed = 0
    for vid_id, storage_path, video_url in rows:
        key = storage_path or key_from_url(video_url)
        if delete_key(key) and not DRY_RUN:
            cur.execute("DELETE FROM xhs_videos WHERE id = %s", (vid_id,))
            removed += 1

    # 2. Old job artifacts (covers, temp uploads)
    cur.execute(
        """SELECT job_id, cover_url, intro_r2_key, cover_bg_r2_key FROM xhs_video_jobs
           WHERE created_at < now() - make_interval(days => %s)
             AND (cover_url IS NOT NULL OR intro_r2_key IS NOT NULL OR cover_bg_r2_key IS NOT NULL)""",
        (JOB_RETENTION_DAYS,),
    )
    jobs = cur.fetchall()
    print(f"{len(jobs)} old job(s) with leftover files")
    for job_id, cover_url, intro_key, bg_key in jobs:
        cover_key = key_from_url(cover_url)
        if cover_url and not cover_key:
            print(f"  job {job_id}: cover URL not under R2_PUBLIC_URL, leaving it: {cover_url[:80]}")
            continue
        ok = all(delete_key(k) for k in (cover_key, intro_key, bg_key) if k)
        if ok and not DRY_RUN:
            cur.execute(
                "UPDATE xhs_video_jobs SET cover_url = NULL, intro_r2_key = NULL, cover_bg_r2_key = NULL WHERE job_id = %s",
                (job_id,),
            )

    # 3. Highlight clips (精彩片段) of listings inactive for 7+ days.
    #    updated_at is bumped when the status check marks a listing inactive,
    #    so the grace period protects against a wrong status read.
    cur.execute(
        """SELECT t.id, t.video_url, t.mls_number
             FROM historical_live_tours t
             JOIN mls_listings l ON l.mls_number = t.mls_number
            WHERE l.standard_status IN ('Inactive','Sold','Expired','Cancelled','Withdrawn')
              AND l.updated_at < (now() AT TIME ZONE 'utc') - make_interval(days => %s)""",
        (INACTIVE_GRACE_DAYS,),
    )
    clips = cur.fetchall()
    print(f"{len(clips)} highlight clip(s) on listings inactive {INACTIVE_GRACE_DAYS}+ days")
    for tour_id, video_url, mls in clips:
        key = key_from_url(video_url)
        # highlights/… (generated) or <32-hex>.<ext> at the root (manual uploads)
        if not (key.startswith("highlights/") or HIGHLIGHT_UPLOAD_RE.match(key)):
            print(f"  skip clip {tour_id} ({mls}): unexpected key {key!r}")
            continue
        if DRY_RUN:
            print(f"  [dry-run] would delete clip {tour_id} ({mls}) and {key}")
            continue
        try:
            s3.delete_object(Bucket=bucket, Key=key)
            cur.execute("DELETE FROM historical_live_tours WHERE id = %s", (tour_id,))
            print(f"  deleted clip {tour_id} ({mls}) and {key}")
        except Exception as e:
            print(f"  clip delete failed {key}: {e}", file=sys.stderr)

    if DRY_RUN:
        conn.rollback()
        print("Dry run — nothing deleted.")
    else:
        conn.commit()
        print(f"Done: {removed} video row(s) removed, {len(jobs)} job(s) cleaned.")
    conn.close()


if __name__ == "__main__":
    main()
