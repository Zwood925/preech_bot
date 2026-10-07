#!/usr/bin/env python3
"""Vercel serverless function: GET /api/sermons
Proxies to the local Flask backend, returns all sermons with truncated preview.
"""
import os, json
import urllib.request

BACKEND = os.environ.get("FLASK_BACKEND_URL", "http://127.0.0.1:5000")

def handler(request):
    try:
        with urllib.request.urlopen(f"{BACKEND}/api/sermons", timeout=10) as r:
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
                "body": r.read().decode("utf-8"),
            }
    except Exception as e:
        return {
            "statusCode": 502,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "backend_unreachable", "detail": str(e)}),
        }
