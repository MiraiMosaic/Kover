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
const musicFileMore = document.getElementById('music-file-more');
const clearMusicBtn = document.getElementById('clear-music-btn');

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
      status: 'ready'
    });
    renderMusicState();
    updateKoverButtonState();
  }
}

async function handleMusicDrop(files) {
  for (const file of Array.from(files)) {
    await addMusicFileByPath(file.path);
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
    return;
  }

  musicPrompt.classList.add('hidden');
  musicLoadedContainer.classList.remove('hidden');
  musicDropZone.classList.add('loaded');
  clearMusicBtn.classList.remove('hidden'); // Show close button

  // Display first file name
  musicFileName.textContent = musicFiles[0].name;

  // Display count of remaining files
  if (musicFiles.length > 1) {
    musicFileMore.textContent = `+${musicFiles.length - 1} more`;
    musicFileMore.classList.remove('hidden');
  } else {
    musicFileMore.textContent = '';
    musicFileMore.classList.add('hidden');
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
    handleImageFileByPath(e.dataTransfer.files[0].path);
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

  // Show status modal
  statusTitle.textContent = "Kovering...";
  statusDetail.textContent = "Processing image...";
  progressBarFill.style.width = "0%";
  statusOverlay.classList.add('active');

  // Generate the cropped image based on exact user zoom & dragging offsets
  const base64Data = generateCroppedBase64();
  if (!base64Data) {
    statusOverlay.classList.remove('active');
    alert('Error cropping image. Please try again.');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < musicFiles.length; i++) {
    const file = musicFiles[i];
    file.status = 'processing';

    const percent = Math.round((i / musicFiles.length) * 100);
    progressBarFill.style.width = `${percent}%`;
    statusDetail.textContent = `Writing: ${file.name}`;

    const validation = await window.api.validateFile(file.path);
    if (!validation.valid) {
      file.status = 'error';
      failCount++;
    } else {
      const response = await window.api.writeCoverArt(file.path, base64Data);
      if (response.success) {
        file.status = 'success';
        successCount++;
      } else {
        file.status = 'error';
        console.error(`Error tagging ${file.name}:`, response.error);
        failCount++;
      }
    }
  }

  progressBarFill.style.width = "100%";
  statusTitle.textContent = "Kover Completed!";
  statusDetail.textContent = `Updated ${successCount} file(s). ${failCount > 0 ? `Failed ${failCount}.` : ''}`;

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'kover-btn';
  dismissBtn.style.marginTop = '16px';
  dismissBtn.style.height = '28px';
  dismissBtn.style.fontSize = '12px';
  dismissBtn.style.borderRadius = '14px';
  dismissBtn.innerHTML = '<span>Done</span><div class="btn-glow"></div>';
  
  const modal = statusOverlay.querySelector('.status-modal');
  modal.appendChild(dismissBtn);

  dismissBtn.addEventListener('click', () => {
    statusOverlay.classList.remove('active');
    dismissBtn.remove();
  });
}

koverBtn.addEventListener('click', processTagging);
