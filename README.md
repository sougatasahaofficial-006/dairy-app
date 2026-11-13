# Dairy 📖✨

A minimalist, zero-clutter analog tactile diary and notebook application built for Android and web. Designed with a focus on distraction-free handwriting, tactile page-flipping gestures, and a genuine physical notebook feel.

## 🚀 Features

* **Zero UI Clutter:** Full-screen immersive writing canvas with minimal, auto-hiding transparent controls.
* **Analog Page Navigation:** Turn pages naturally via 15% edge-tap touch zones or create new entries seamlessly.
* **Crisp Stylus Support:** High-DPI device pixel ratio (DPR) scaling for ultra-smooth, non-pixelated handwriting.
* **Dual Ink & Non-Destructive Eraser:** Switch instantly between Classic Blue Ink (`#1e3a8a`), Rich Black Ink (`#09090b`), and an Eraser tool that clears handwritten ink strokes while **preserving the background ruled paper lines**.
* **Topic Bookmarking & Index Modal:** Mark important pages with custom topic titles and jump directly to them using the built-in Index modal.
* **Customizable Cover:** Upload your own custom cover image or fall back to a clean minimalist title design.
* **Offline-First Architecture:** Automatically persists pages and states locally using `localStorage`.
* **Native Android Integration:** Locked to portrait orientation via Capacitor with custom adaptive launcher icons.

---

## 🛠️ Tech Stack

* **Frontend:** React, Vite, TypeScript, Tailwind CSS
* **Canvas API:** HTML5 2D Canvas with High-DPI scaling & `destination-out` compositing
* **Mobile Runtime:** Capacitor (`@capacitor/core`, `@capacitor/screen-orientation`)
* **Storage:** `localStorage` (Offline-first state management)
* **Icons:** Lucide React

---

## 📦 Getting Started & Local Development

### 1. Clone the Repository
\`\`\`bash
git clone https://github.com/sougatasahaofficial-006/dairy-app.git
cd dairy-app
\`\`\`

### 2. Install Dependencies
\`\`\`bash
npm install
\`\`\`

### 3. Run Locally (Web Preview)
\`\`\`bash
npm run dev
\`\`\`

### 4. Build and Sync with Android (Capacitor)
\`\`\`bash
npm run build
npx cap sync android
npx cap open android
\`\`\`
*(Once Android Studio opens, build and generate your debug APK via **Build > Build Bundle(s) / APK(s) > Build APK(s)**).*

---

## 📄 License
Open-source portfolio project. Feel free to use and adapt!