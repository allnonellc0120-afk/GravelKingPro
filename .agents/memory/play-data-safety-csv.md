---
name: Google Play Data Safety CSV
description: The Play dataSafety API validates against the complete current export template, including account creation and deletion rows.
---

The Google Play Developer API accepts the Data Safety CSV only when it contains every row from the current Play Console export template, even when most response values are blank. A compact CSV containing only selected answers fails with “Response missing” errors.

**Why:** Play’s template evolves and the API validates required question IDs independently of whether the app selects those data types.

**How to apply:** Start from the latest exported/template CSV, overlay the app’s selected answers, include the OAuth account-creation row and account/data deletion URLs when applicable, then POST the complete CSV as `safetyLabels`.