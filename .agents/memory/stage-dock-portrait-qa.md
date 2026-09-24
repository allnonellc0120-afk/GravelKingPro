---
name: Stage dock portrait QA
description: Mobile hit-area and geometry constraints for the shared fullscreen performance stage dock
---

The shared fullscreen performance stage dock must be validated by rendered bounding rectangles at 375x667, 390x844, and 430x932. Native range inputs need an explicit minimum height because their visual track height does not provide a 44px touch target; compact utility controls also need explicit minimum dimensions.

**Why:** Browser layout tests exposed that visually small native controls and utility buttons can fail touch-target requirements even when their surrounding flex layout appears correct.

**How to apply:** Keep the portrait DOM/CSS audit focused on the exact launchstag purge selector, named dock-control non-overlap, every visible interactive element’s rendered size, and content clearance above the dock’s reserved bottom padding.