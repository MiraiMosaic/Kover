// State management
let musicFiles = [];
let coverImage = null;

// Image transform state for drag & zoom viewport
let imgElement = null;
let zoom = 1.0;
let posX = 0;
let posY = 0;
let baseScale = 1.0;
const VIEW_SIZE = 86; // Size of the square preview viewport in pixels

// DOM Elements
const musicDropZone = document.getElementById('music-drop-zone');
const musicPrompt = document.getElementById('music-prompt');
const musicLoadedContainer = document.getElementById('music-loaded-container');
const musicFileName = document.getElementById('music-file-name');
const fileNameContainer = document.getElementById('file-name-container');
const musicFileMore = document.getElementById('music-file-more');
const clearMusicBtn = document.getElementById('clear-music-btn');
const musicBgPreview = document.getElementById('music-bg-preview');
const musicBgImage = document.getElementById('music-bg-image');
const removeArtBtn = document.getElementById('remove-art-btn');

const imageDropZone = document.getElementById('image-drop-zone');
const imagePrompt = document.getElementById('image-prompt');
const previewContainer = document.getElementById('preview-container');
const imagePreview = document.getElementById('image-preview');
const previewViewport = document.querySelector('.preview-viewport');
const clearImageBtn = document.getElementById('clear-image-btn');

const koverBtn = document.getElementById('kover-btn');
const statusOverlay = document.getElementById('status-overlay');
const statusTitle = document.getElementById('status-title');
const statusDetail = document.getElementById('status-detail');
const progressBarFill = document.getElementById('progress-bar-fill');
const cropCanvas = document.getElementById('crop-canvas');

// Helper to format bytes (kept for console/logging reference if needed)
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = 2;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Check if we can enable the Kover button
function updateKoverButtonState() {
  koverBtn.disabled = !(musicFiles.length > 0 && coverImage !== null);
}

// -------------------------------------------------------------
// MUSIC ZONE LOGIC
// -------------------------------------------------------------

async function addMusicFileByPath(filePath) {
  if (!filePath) return;
  if (!filePath.toLowerCase().endsWith('.mp3')) return;
  if (musicFiles.some(f => f.path === filePath)) return; // Avoid duplicates

  const info = await window.api.getFileInfo(filePath);
  if (info.valid) {
    musicFiles.push({
      path: info.path,
      name: info.name,
      size: info.size,
      status: 'ready',
      existingCoverBase64: info.existingCoverBase64 || null
    });
    renderMusicState();
    updateKoverButtonState();
  }
}

async function handleMusicDrop(files) {
  for (const file of Array.from(files)) {
    const path = window.api.getPathForFile(file) || file.path;
    await addMusicFileByPath(path);
  }
}

async function selectMusicDialog() {
  const filePaths = await window.api.selectMusicFiles();
  if (filePaths && filePaths.length > 0) {
    for (const path of filePaths) {
      await addMusicFileByPath(path);
    }
  }
}

function renderMusicState() {
  if (musicFiles.length === 0) {
    musicPrompt.classList.remove('hidden');
    musicLoadedContainer.classList.add('hidden');
    musicDropZone.classList.remove('loaded');
    clearMusicBtn.classList.add('hidden'); // Hide close button
    if (fileNameContainer) fileNameContainer.classList.remove('marquee');
    
    // Hide cover preview state
    if (musicBgPreview) musicBgPreview.classList.add('hidden');
    if (musicBgImage) musicBgImage.src = '';
    if (removeArtBtn) {
      removeArtBtn.classList.add('hidden');
      removeArtBtn.classList.remove('success');
      removeArtBtn.textContent = 'Remove Album Art';
      removeArtBtn.disabled = false;
    }
    musicDropZone.classList.remove('has-art');
    return;
  }

  musicPrompt.classList.add('hidden');
  musicLoadedContainer.classList.remove('hidden');
  musicDropZone.classList.add('loaded');
  clearMusicBtn.classList.remove('hidden'); // Show close button

  // Display first file name
  const firstFile = musicFiles[0];
  const fName = firstFile.name;
  musicFileName.textContent = fName;

  // Toggle marquee ticker animation if name is too long for the box
  if (fName.length > 9) {
    fileNameContainer.classList.add('marquee');
  } else {
    fileNameContainer.classList.remove('marquee');
  }

  // Display count of remaining files
  if (musicFiles.length > 1) {
    musicFileMore.textContent = `+${musicFiles.length - 1} more`;
    musicFileMore.classList.remove('hidden');
  } else {
    musicFileMore.textContent = '';
    musicFileMore.classList.add('hidden');
  }

  // If there's existing cover art, show it slightly dimmed inside the music drop zone
  if (firstFile.existingCoverBase64) {
    musicBgImage.src = firstFile.existingCoverBase64;
    musicBgPreview.classList.remove('hidden');
    musicDropZone.classList.add('has-art');
    
    // Completely reset button state for the newly loaded file
    removeArtBtn.classList.remove('success');
    removeArtBtn.textContent = 'Remove Album Art';
    removeArtBtn.disabled = false;
    removeArtBtn.classList.remove('hidden');
  } else {
    musicBgImage.src = '';
    musicBgPreview.classList.add('hidden');
    musicDropZone.classList.remove('has-art');
    removeArtBtn.classList.add('hidden');
  }
}

function clearMusic() {
  musicFiles = [];
  renderMusicState();
  updateKoverButtonState();
}

// -------------------------------------------------------------
// IMAGE ZONE LOGIC, DRAG & ZOOM VIEWPORT
// -------------------------------------------------------------

async function handleImageFileByPath(filePath) {
  if (!filePath) return;
  
  const info = await window.api.getFileInfo(filePath);
  if (!info.valid) return;

  const ext = info.name.split('.').pop().toLowerCase();
  if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
    alert('Please select a valid image file (JPG or PNG).');
    return;
  }

  const response = await window.api.readFileBase64(filePath);
  if (response.success) {
    const dataUrl = `data:${response.mime};base64,${response.base64}`;
    const img = new Image();
    img.onload = function() {
      // 1. Save reference and calculate initial aspect-fit scale
      imgElement = img;
      
      const scaleX = VIEW_SIZE / img.width;
      const scaleY = VIEW_SIZE / img.height;
      baseScale = Math.max(scaleX, scaleY); // Cover viewport (no blank borders)
      
      zoom = 1.0; // Reset zoom
      
      // Center initial offset
      posX = (VIEW_SIZE - img.width * baseScale) / 2;
      posY = (VIEW_SIZE - img.height * baseScale) / 2;

      // Update state object
      coverImage = {
        path: filePath,
        name: info.name
      };

      // 2. Update UI Preview
      imagePreview.src = dataUrl;
      updateImageTransform();

      imagePrompt.classList.add('hidden');
      previewContainer.classList.remove('hidden');
      imageDropZone.classList.add('loaded');
      clearImageBtn.classList.remove('hidden'); // Show close button
      updateKoverButtonState();
    };
    img.src = dataUrl;
  } else {
    console.error('Error loading image base64:', response.error);
    alert('Could not read image file.');
  }
}

async function selectImageDialog() {
  const filePath = await window.api.selectImageFile();
  if (filePath) {
    await handleImageFileByPath(filePath);
  }
}

function clearImage() {
  coverImage = null;
  imgElement = null;
  imagePreview.src = '';
  imagePreview.style.transform = '';
  previewContainer.classList.add('hidden');
  imagePrompt.classList.remove('hidden');
  imageDropZone.classList.remove('loaded');
  clearImageBtn.classList.add('hidden'); // Hide close button
  updateKoverButtonState();
}

// Transform renderer and bounds constraint logic
function updateImageTransform() {
  if (!imgElement) return;
  imagePreview.style.transform = `translate(${posX}px, ${posY}px) scale(${zoom * baseScale})`;
  imagePreview.style.transformOrigin = 'top left';
}

function constrainPosition() {
  if (!imgElement) return;
  const w = imgElement.width * baseScale * zoom;
  const h = imgElement.height * baseScale * zoom;
  
  // Constrain top-left offsets (posX, posY <= 0, and offsets must cover viewport)
  posX = Math.min(0, Math.max(VIEW_SIZE - w, posX));
  posY = Math.min(0, Math.max(VIEW_SIZE - h, posY));
}

// -------------------------------------------------------------
// PREVIEW VIEWPORT INTERACTIONS (DRAG & MOUSEWHEEL ZOOM)
// -------------------------------------------------------------

let isDragging = false;
let startDragX = 0;
let startDragY = 0;

previewViewport.addEventListener('mousedown', (e) => {
  if (!imgElement) return;
  isDragging = true;
  startDragX = e.clientX - posX;
  startDragY = e.clientY - posY;
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging || !imgElement) return;
  posX = e.clientX - startDragX;
  posY = e.clientY - startDragY;
  constrainPosition();
  updateImageTransform();
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

// Scrollwheel zooming (Centered viewport math zoom)
previewViewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!imgElement) return;
  
  const delta = e.deltaY * -0.005; // Smooth scroll zoom delta
  const oldZoom = zoom;
  zoom = Math.min(5.0, Math.max(1.0, zoom + delta)); // Clamp zoom between 1.0x and 5.0x
  
  if (zoom !== oldZoom) {
    const cx = VIEW_SIZE / 2;
    const cy = VIEW_SIZE / 2;
    
    // Position transform mapping centering
    const newX = cx - (cx - posX) * (zoom / oldZoom);
    const newY = cy - (cy - posY) * (zoom / oldZoom);
    
    posX = newX;
    posY = newY;
    constrainPosition();
    updateImageTransform();
  }
});

// -------------------------------------------------------------
// DRAG & DROP EVENTS SETUP (WITH OS FORCE COPY RESTORATION)
// -------------------------------------------------------------

// Music Drop Zone Events
musicDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy'; // Forces OS to register copy intent
  musicDropZone.classList.add('drag-over');
});

musicDropZone.addEventListener('dragleave', () => {
  musicDropZone.classList.remove('drag-over');
});

musicDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  musicDropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) {
    handleMusicDrop(e.dataTransfer.files);
  }
});

// Image Drop Zone Events
imageDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy'; // Forces OS to register copy intent
  imageDropZone.classList.add('drag-over');
});

imageDropZone.addEventListener('dragleave', () => {
  imageDropZone.classList.remove('drag-over');
});

imageDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  imageDropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) {
    const path = window.api.getPathForFile(e.dataTransfer.files[0]) || e.dataTransfer.files[0].path;
    handleImageFileByPath(path);
  }
});

// Click-to-choose handlers (Native dialog window)
musicDropZone.addEventListener('click', async (e) => {
  if (e.target.closest('#clear-music-btn')) return;
  if (musicFiles.length > 0) return; // Do not open dialog if music files are already loaded
  await selectMusicDialog();
});

imageDropZone.addEventListener('click', async (e) => {
  if (e.target.closest('#clear-image-btn')) return;
  if (coverImage !== null) return; // Do not open dialog if image is already loaded
  await selectImageDialog();
});

// Clear button events
clearMusicBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  clearMusic();
});

clearImageBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  clearImage();
});

// -------------------------------------------------------------
// KOVER OPERATION (DYNAMIC CANVAS EXPORT)
// -------------------------------------------------------------

function generateCroppedBase64() {
  if (!imgElement) return null;
  
  const canvasSize = 800; // Output dimension for high-quality cover art
  cropCanvas.width = canvasSize;
  cropCanvas.height = canvasSize;
  const ctx = cropCanvas.getContext('2d');
  
  // Clear canvas black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  
  // Calculate relative scale from viewport VIEW_SIZE to output canvasSize
  const scaleFactor = canvasSize / VIEW_SIZE;
  const drawX = posX * scaleFactor;
  const drawY = posY * scaleFactor;
  const drawWidth = imgElement.width * baseScale * zoom * scaleFactor;
  const drawHeight = imgElement.height * baseScale * zoom * scaleFactor;
  
  ctx.drawImage(imgElement, drawX, drawY, drawWidth, drawHeight);
  
  const jpegDataUrl = cropCanvas.toDataURL('image/jpeg', 0.90); // 90% quality JPEG
  return jpegDataUrl.split(',')[1];
}

async function processTagging() {
  if (musicFiles.length === 0 || !coverImage || !imgElement) return;

  // Set button to loading text
  koverBtn.disabled = true;
  koverBtn.querySelector('span').textContent = 'kovering...';

  // Generate the cropped image based on exact user zoom & dragging offsets
  const base64Data = generateCroppedBase64();
  if (!base64Data) {
    koverBtn.querySelector('span').textContent = 'error!';
    setTimeout(() => {
      koverBtn.querySelector('span').textContent = 'kover!';
      updateKoverButtonState();
    }, 2000);
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < musicFiles.length; i++) {
    const file = musicFiles[i];
    const validation = await window.api.validateFile(file.path);
    if (!validation.valid) {
      failCount++;
    } else {
      const response = await window.api.writeCoverArt(file.path, base64Data);
      if (response.success) {
        successCount++;
      } else {
        console.error(`Error tagging ${file.name}:`, response.error);
        failCount++;
      }
    }
  }

  // Trigger the wipe animation and Success! text
  const appContainer = document.querySelector('.app-container');
  appContainer.classList.add('wiped');
  koverBtn.querySelector('span').textContent = 'SUCCESS!';

  // Set 1.5-second timeout to reverse and reset
  setTimeout(() => {
    // Reverse tunnel motion (collapses circle back to button)
    appContainer.classList.remove('wiped');
    
    // Reset button text
    koverBtn.querySelector('span').textContent = 'kover!';
    
    // Clear files to reset the app state
    clearMusic();
    clearImage();
  }, 1500);
}

koverBtn.addEventListener('click', processTagging);

// Remove Album Art button handler
if (removeArtBtn) {
  removeArtBtn.addEventListener('click', async (e) => {
    e.stopPropagation(); // Avoid triggering drop zone click file dialog
    if (musicFiles.length === 0) return;
    
    removeArtBtn.disabled = true;
    removeArtBtn.textContent = 'Removing...';
    
    let successCount = 0;
    for (const file of musicFiles) {
      const response = await window.api.removeCoverArt(file.path);
      if (response.success) {
        successCount++;
        file.existingCoverBase64 = null;
      }
    }
    
    if (successCount > 0) {
      removeArtBtn.classList.add('success');
      removeArtBtn.textContent = '✓ Done!';
      
      // Let success feedback stand for 1.5s, then clear music files completely
      setTimeout(() => {
        clearMusic();
      }, 1500);
    } else {
      removeArtBtn.disabled = false;
      removeArtBtn.textContent = 'Error!';
      setTimeout(() => {
        removeArtBtn.textContent = 'Remove Album Art';
      }, 2000);
    }
  });
}
