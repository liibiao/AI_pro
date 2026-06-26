# midjourney-canvas-selectable-20260608090209

One-time production database fix for server 124:

- set Midjourney provider `midjourney_imagine` to `ACTIVE`;
- keep Midjourney model `midjourney-imagine` as `ACTIVE`;
- refuse to enable if the Base URL still points to `45.77.211.38`;
- print before/after status for verification.

This makes `/api/models?type=IMAGE` eligible to return Midjourney to the canvas model picker.
