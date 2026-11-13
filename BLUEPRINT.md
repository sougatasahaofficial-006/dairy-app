# Dairy App — Technical Architecture & Design Blueprint

## 1. System Overview & Design Philosophy
**Dairy** bridges the gap between physical analog journaling and digital convenience. The architectural goals prioritize:
* **Zero Cognitive Load:** Absolute immersion with zero visible headers or status bars during writing.
* **Tactile Fidelity:** High-frequency pointer event tracking optimized for capacitive styluses and touchscreens.
* **Lightweight Offline-First Persistence:** Zero external database overhead by leveraging HTML5 Canvas data URLs and browser storage.

---

## 2. Core Architectural Components

### A. High-DPI Canvas Rendering Engine (`canvasRef`)
Standard HTML canvases often appear jagged on high-density mobile displays (Retina, AMOLED panels). The rendering pipeline corrects this by explicitly querying the device pixel ratio (`window.devicePixelRatio`):
1. Scaling internal canvas buffer dimensions by `dpr`.
2. Scaling down CSS layout width/height to match physical viewport dimensions.
3. Applying `ctx.scale(dpr, dpr)` to ensure vector paths, curves, and strokes render at native hardware resolution.

### B. Non-Destructive Eraser Implementation
Traditional canvas erasing methods wipe out background patterns (such as ruled notebook lines). Dairy solves this by utilizing HTML5 Canvas composite operations:
* **Writing Mode:** `ctx.globalCompositeOperation = 'source-over'` renders ink pixels directly onto the buffer.
* **Eraser Mode:** `ctx.globalCompositeOperation = 'destination-out'` treats the stroke as an alpha transparency mask. It punches through the pixel data layer while completely bypassing the underlying CSS background gradient (`linear-gradient` ruled lines), keeping the paper template pristine.

### C. Edge-Tap Gesture Routing
Page navigation avoids heavy swipe listener abstractions by utilizing coordinate-based bounding boxes:
* Left 15% viewport boundary triggers previous page transition (or closes the book if on page 1).
* Right 15% viewport boundary triggers next page transition (or appends a new blank page dynamically).
* Center 70% viewport boundary is entirely dedicated to touch/stylus drawing input.

### D. State Management & Persistence
* Pages are structured as an array of objects (`PageData[]`), storing metadata (`id`, `isBookmarked`, `title`) alongside serialized base64 image strings (`dataUrl`) representing each canvas snapshot.
* State changes automatically trigger serialization and sync to `localStorage` on pointer up and modal interactions.

---

## 3. Mobile Packaging & Native Layer
* **Orientation Lock:** Enforced programmatically at runtime via `@capacitor/screen-orientation` and statically declared in `AndroidManifest.xml` (`android:screenOrientation="portrait"`).
* **Adaptive Launcher Icons:** Generated across all Android density buckets (`mipmap-mdpi` through `mipmap-xxxhdpi`) with dedicated foreground vectors and background color resources (`ic_launcher_background.xml`).