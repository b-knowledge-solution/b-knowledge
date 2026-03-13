# Aisearch Page Overrides

> **PROJECT:** AI-Native UI
> **Generated:** 2026-03-13 21:19:38
> **Page Type:** Product Detail

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px (standard)
- **Layout:** Full-width sections, centered content
- **Sections:** 1. Hero (Search focused), 2. Categories, 3. Featured Listings, 4. Trust/Safety, 5. CTA (Become a host/seller)

### Spacing Overrides

- No overrides — use Master spacing

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Search: High contrast. Categories: Visual icons. Trust: Blue/Green.

### Component Overrides

- Avoid: Blank screen or '0 results'
- Avoid: Require full type and enter
- Avoid: Desktop-first causing mobile issues

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: z-index stacking, box-shadow elevation (4 levels), transform: translateZ(), backdrop-filter, parallax
- Search: Show 'No results' with suggestions
- Search: Show predictions as user types
- Responsive: Start with mobile styles then add breakpoints
- CTA Placement: Hero Search Bar + Navbar 'List your item'
