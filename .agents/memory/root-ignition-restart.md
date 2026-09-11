---
name: Root ignition restart
description: The standalone Python ignition service must be restarted before port 8080 verification after main.py changes.
---

The root Python ignition process can keep serving an older imported copy of main.py after the file is edited. Restart the process before live endpoint verification.

**Why:** A first live request returned the legacy 202 response because an older process still owned port 8080, even though the source had already been updated.

**How to apply:** After changing main.py, stop the existing root ignition process, start it again, then verify the endpoint and response status.