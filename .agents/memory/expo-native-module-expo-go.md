---
name: Expo native modules absent in Expo Go
description: Third-party Expo native view/components crash with "Unimplemented component" in Expo Go; guard with requireOptionalNativeModule
---

Third-party Expo packages that ship a native **view** (via `requireNativeViewManager`) are NOT bundled in Expo Go. Rendering them there shows React Native's red "Unimplemented component: <ViewManagerAdapter_XXX>" placeholder instead of the view. This is NOT a JS throw, so error boundaries do not catch it — you must detect availability before rendering.

**Why:** `expo-drag-drop-content-view`'s `DragDropContentView` rendered raw "Unimplemented component" on iPad in the mobile Studio because the native module only exists in custom dev/standalone builds, not Expo Go. Importing the package is safe (the view manager lookup is lazy); only *rendering* the native view triggers the placeholder.

**How to apply:**
- Detect with `requireOptionalNativeModule("<ModuleName>") != null` (import from `expo` — re-exported; `expo-modules-core` is usually not a direct dep so TS can't resolve it). Treat `Platform.OS === "web"` as available when the package ships a `.web.js` DOM implementation (most do).
- Wrap the native component in a small component that renders a plain `View` fallback when unavailable, keeping sibling controls (pickers, buttons) working.
- The Expo module name == the string passed to `requireNativeViewManager` (e.g. `ExpoDragDropContentView`); the legacy adapter registers it as `ViewManagerAdapter_<name>`.
