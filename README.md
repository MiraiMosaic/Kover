# Kover

A beautiful, super-compact desktop application for embedding cover art into music files. Just drag, drop, and kover!

---

## ✨ Features

- **⚡ Minimalist & Space-saving UI**: A compact design with clean, smooth transitions.
- **🎵 Multi-format Audio Support**: Embed or replace cover art for `MP3`, `FLAC`, `M4A`, `WAV`, and `OGG` files.
- **🖼️ Smart Cover Cropping**: Drag and drop any `JPG`, `PNG`, or `WebP` image, and the app automatically center-crops it for a perfect square cover.
- **🧹 Remove Artwork**: Easily strip existing album art with a single click.
- **💻 Cross-Platform Ready**: Tailored layouts and borderless frames for both macOS and Windows.

---

## 🚀 How to Run Locally

To run Kover on your machine, you'll need [Node.js](https://nodejs.org/) installed.

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/kover.git
cd kover
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start the application (Development Mode)
```bash
npm start
```

### 4. Package the application (Production Build)
To compile a standalone application executable:
- **For macOS:**
  ```bash
  npm run dist
  ```
- **For Windows (Cross-compilation):**
  ```bash
  npm run dist:win
  ```

---

## 🛠️ Tech Stack & Dependencies

- **Framework**: Electron
- **Audio Tag Engine**: `music-tag-native` (native Node.js bindings for fast, binary-level metadata updates)
- **Styling**: Modern CSS with custom scrollbars, animations, and radial transitions.

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
