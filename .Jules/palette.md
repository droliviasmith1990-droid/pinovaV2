## 2025-12-31 - Component Usage Enforces Accessibility
**Learning:** The `Header` component used raw `<button>` and `<a>` elements, leading to missing ARIA labels. The existing `IconButton` component (`src/components/ui/IconButton.tsx`) enforces a `label` prop.
**Action:** Prefer using `IconButton` over raw elements to ensure accessibility compliance by design.
