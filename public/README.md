# Public Assets

This directory needs the following files:

## OpenCV.js
Download from: https://docs.opencv.org/4.x/opencv.js
- File: `opencv.js` (full build with wasm)
- Place at: `/public/opencv.js`

## PDF.js Worker
From `pdfjs-dist` npm package after install:
- File: `node_modules/pdfjs-dist/build/pdf.worker.min.mjs`
- Copy to: `/public/pdf.worker.min.mjs`

After running `npm install`, you can copy the worker:
```bash
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/
```

For OpenCV.js, download the latest 4.x build from the official OpenCV.js docs.
