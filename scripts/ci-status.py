#!/usr/bin/env python3
"""Poll a GitHub Actions run and print failed steps. Usage: ci-status.py <run-id> [minutes]"""
import json
import sys
import time
import urllib.request

repo = "GtihubCodespaces/Synt"
run = sys.argv[1]
wait = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0


def get(url):
    req = urllib.request.Request(
        url, headers={"Accept": "application/vnd.github+json", "User-Agent": "synt-ci"}
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


deadline = time.time() + wait * 60
while True:
    data = get(f"https://api.github.com/repos/{repo}/actions/runs/{run}")
    if "status" not in data:
        print(time.strftime("%H:%M:%S"), "api:", data.get("message"), flush=True)
    else:
        print(time.strftime("%H:%M:%S"), "run:", data["status"], data.get("conclusion") or "-", flush=True)
        if data["status"] == "completed":
            break
    if time.time() > deadline:
        print("still running, poll again")
        break
    time.sleep(20)

jobs = get(f"https://api.github.com/repos/{repo}/actions/runs/{run}/jobs")
for job in jobs.get("jobs", []):
    print(f'{job["name"]}: {job["status"]} {job.get("conclusion") or "-"}')
    for step in job.get("steps", []):
        if step.get("conclusion") not in (None, "success", "skipped"):
            print("   step:", step["name"], "->", step.get("conclusion"))
