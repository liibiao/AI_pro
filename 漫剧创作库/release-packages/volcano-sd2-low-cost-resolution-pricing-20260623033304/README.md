# Volcano SD2 Low Cost Resolution Pricing

This package updates the admin model configuration for `lingdong-sd-2-vip` / `sd-2-vip`.

- Exposes canvas resolutions as `720p` and `1080p`.
- Keeps upstream request size mapping as `720p -> small`, `1080p -> large`.
- Stores separate per-generation `resolutionTiers` for admin billing.
- Preserves existing tier prices when they already exist in the admin database.
