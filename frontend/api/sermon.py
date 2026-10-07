#!/usr/bin/env python3
"""Vercel serverless function: GET /api/sermon/<id>
Proxies to the local Flask backend, returns single sermon (full text)."""
import os, json, urllib.request, re

BACKEND = os.environ.get("FLASK_BACKEND_URL", "http://127.0.0.1:5000")

# Extract numeric ID from path pattern captured by Vercel (same as dest pattern)
ID_RE = re.compile(r"^/api/sermon/(\\d+)$")

def handler(request):
    # Vercel passes request.path, but safe to read env if needed
    path = request.get("path", "")
    m = ID_RE.match(path)
    if not m:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "bad_request", "detail": "invalid ID"}),
        }
    sermon_id = int(m.group(1))
    try:
        with urllib.request.urlopen(f"{BACKEND}/api/sermon/{sermon_id}", timeout=10) as r:
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
                "body": r.read().decode("utf-8"),
            }
    except urllib.error.HTTPError as e:
        return {
            "statusCode": e.code,
            "headers": {"Content-Type": "application/json"},
            "body": e.read().decode("utf-8") if e.fp else json.dumps({"error": "not_found", "id": sermon_id}),
        }
    except Exception as e:
        return {
            "statusCode": 502,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "backend_unreachable", "detail": str(e)}),
        }
