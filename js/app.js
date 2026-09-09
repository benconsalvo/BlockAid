// js/app.js

import { 
  saveGitHubConfig, 
  getGitHubConfig, 
  listRepositoryFiles, 
  fetchFileContent,
  saveFileToRepository,
  deleteFileFromRepository 
} from './githubService.js';

import { BlueprintEngine } from './canvasEngine.js';

// --- CUSTOM ASYNCHRONOUS DIALOG HELPER FUNCTIONS ---
function showCustomDialog({ title = 'Notice', message = '', showInput = false, defaultValue = '', showCancel = false, confirmText = 'OK', cancelText = 'Cancel' }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-dialog-modal');
    const titleEl = document.getElementById('dialog-title');
    const msgEl = document.getElementById('dialog-message');
    const inputEl = document.getElementById('dialog-input');
    const confirmBtn = document.getElementById('dialog-btn-confirm');
    const cancelBtn = document.getElementById('dialog-btn-cancel');

    titleEl.textContent = title;
    msgEl.textContent = message;

    if (showInput) {
      inputEl.style.display = 'block';
      inputEl.value = defaultValue;
    } else {
      inputEl.style.display = 'none';
    }

    if (showCancel) {
      cancelBtn.style.display = 'inline-block';
      cancelBtn.textContent = cancelText;
    } else {
      cancelBtn.style.display = 'none';
    }

    confirmBtn.textContent = confirmText;
    modal.style.display = 'flex';

    if (showInput) {
      setTimeout(() => inputEl.focus(), 50);
    }

    const cleanup = () => {
      modal.style.display = 'none';
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      inputEl.onkeydown = null;
    };

    confirmBtn.onclick = () => {
      const result = showInput ? inputEl.value : true;
      cleanup();
      resolve(result);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(showInput ? null : false);
    };

    if (showInput) {
      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') confirmBtn.click();
        if (e.key === 'Escape' && showCancel) cancelBtn.click();
      };
    }
  });
}

const customAlert = (msg, title = 'Notice') => showCustomDialog({ title, message: msg, showCancel: false });
const customConfirm = (msg, title = 'Confirm Action') => showCustomDialog({ title, message: msg, showCancel: true });
const customPrompt = (msg, defaultVal = '', title = 'Input Required') => showCustomDialog({ title, message: msg, showInput: true, defaultValue: defaultVal, showCancel: true });

// --- MAIN APPLICATION LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
  let engine = null;
  let currentBlueprintId = null;
  let currentBlueprintName = '';
  let draggedIndex = null;

  const viewMainMenu = document.getElementById('view-main-menu');
  const viewBlueprintCanvas = document.getElementById('view-blueprint-canvas');
  const settingsModal = document.getElementById('settings-modal');
  const dirtyDot = document.getElementById('save-dirty-dot');

  const ownerInput = document.getElementById('gh-owner');
  const repoInput = document.getElementById('gh-repo');
  const tokenInput = document.getElementById('gh-token');
  const statusMsg = document.getElementById('status-message');

  const blueprintsList = document.getElementById('blueprints-list');
  const recordingsList = document.getElementById('recordings-list');
  const createBlueprintBtn = document.getElementById('btn-create-blueprint');

  // Credentials Check
  const config = getGitHubConfig();
  if (config) {
    ownerInput.value = config.owner || '';
    repoInput.value = config.repo || '';
    tokenInput.value = config.token || '';
    loadData();
  } else {
    settingsModal.style.display = 'flex';
  }

  // Settings Handlers
  document.getElementById('btn-open-settings').addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });

  document.getElementById('btn-close-settings').addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const owner = ownerInput.value.trim();
    const repo = repoInput.value.trim();
    const token = tokenInput.value.trim();

    if (!owner || !repo || !token) {
      statusMsg.textContent = 'Please fill in all fields.';
      statusMsg.style.color = '#FF6B6B';
      return;
    }

    saveGitHubConfig(owner, repo, token);
    statusMsg.textContent = 'Testing connection...';
    statusMsg.style.color = '#D4AF37';

    try {
      await listRepositoryFiles('Blueprints');
      statusMsg.textContent = 'Connected successfully!';
      statusMsg.style.color = '#51CF66';
      setTimeout(() => {
        settingsModal.style.display = 'none';
        loadData();
      }, 800);
    } catch (err) {
      statusMsg.textContent = `Connection failed: ${err.message}`;
      statusMsg.style.color = '#FF6B6B';
    }
  });

  async function loadData() {
    await renderBlueprints();
    await renderRecordings();
  }

  async function renderBlueprints() {
    blueprintsList.innerHTML = '<li class="empty-message">Loading blueprints...</li>';
    try {
      const files = await listRepositoryFiles('Blueprints');
      if (files.length === 0) {
        blueprintsList.innerHTML = '<li class="empty-message">No saved blueprints found.</li>';
        return;
      }

      blueprintsList.innerHTML = '';
      files.forEach(file => {
        const displayName = file.name.replace('.json', '');
        const li = document.createElement('li');
        li.className = 'item-row';
        li.innerHTML = `
          <span class="item-name">${displayName}</span>
          <div class="item-actions">
            <button class="btn-secondary btn-edit-bp" data-path="${file.path}">Edit</button>
            <button class="btn-danger btn-delete-bp" data-path="${file.path}">Delete</button>
            <button class="btn-primary btn-create-blocking" data-path="${file.path}">Create New Blocking</button>
          </div>
        `;
        blueprintsList.appendChild(li);
      });

      document.querySelectorAll('.btn-edit-bp').forEach(btn => {
        btn.addEventListener('click', (e) => openBlueprintCanvas(e.target.dataset.path));
      });

      document.querySelectorAll('.btn-delete-bp').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const path = e.target.dataset.path;
          const confirmed = await customConfirm(`Are you sure you want to delete ${path.replace('Blueprints/', '')}?`, 'Delete Blueprint');
          if (confirmed) {
            await deleteFileFromRepository(path);
            renderBlueprints();
          }
        });
      });

    } catch (err) {
      blueprintsList.innerHTML = `<li class="empty-message" style="color: #FF6B6B;">Error: ${err.message}</li>`;
    }
  }

  async function renderRecordings() {
    recordingsList.innerHTML = '<li class="empty-message">Loading saved blockings...</li>';
    try {
      const files = await listRepositoryFiles('Recordings');
      if (files.length === 0) {
        recordingsList.innerHTML = '<li class="empty-message">No saved blockings found.</li>';
        return;
      }
      recordingsList.innerHTML = '';
      files.forEach(file => {
        const displayName = file.name.replace('.json', '');
        const li = document.createElement('li');
        li.className = 'item-row';
        li.innerHTML = `
          <span class="item-name">${displayName}</span>
          <div class="item-actions">
            <button class="btn-secondary btn-edit-rec" data-path="${file.path}">Edit</button>
            <button class="btn-danger btn-delete-rec" data-path="${file.path}">Delete</button>
          </div>
        `;
        recordingsList.appendChild(li);
      });

      document.querySelectorAll('.btn-delete-rec').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const path = e.target.dataset.path;
          const confirmed = await customConfirm(`Are you sure you want to delete ${path.replace('Recordings/', '')}?`, 'Delete Blocking');
          if (confirmed) {
            await deleteFileFromRepository(path);
            renderRecordings();
          }
        });
      });

    } catch (err) {
      recordingsList.innerHTML = `<li class="empty-message" style="color: #FF6B6B;">Error: ${err.message}</li>`;
    }
  }

  // --- CANVAS LAUNCH & BINDINGS ---
  async function openBlueprintCanvas(filePath = null) {
    if (filePath) {
      const fileData = await fetchFileContent(filePath);
      currentBlueprintId = fileData.content.id;
      currentBlueprintName = fileData.content.name;
    } else {
      const nameInput = await customPrompt('Enter Blueprint Name:', 'New Stage Blueprint', 'Create Blueprint');
      if (!nameInput) return; // User cancelled
      currentBlueprintId = `bp_${Date.now()}`;
      currentBlueprintName = nameInput.trim();
    }

    viewMainMenu.style.display = 'none';
    viewBlueprintCanvas.style.display = 'flex';

    if (!engine) {
      engine = new BlueprintEngine('konva-holder');
      engine.init();
      engine.onDirtyChangeCallback = (isDirty) => {
        dirtyDot.style.display = isDirty ? 'inline' : 'none';
      };
      engine.onZoomChangeCallback = (scale) => {
        document.getElementById('zoom-level-text').textContent = `${Math.round(scale * 100)}%`;
      };
      bindCanvasToolEvents();
    }

    if (filePath) {
      const fileData = await fetchFileContent(filePath);
      engine.loadJSON(fileData.content);
    } else {
      engine.loadJSON({ floors: [{ level: 1, layerData: null }] });
    }

    renderFloorButtons();
  }

  function renderFloorButtons() {
    const floorsList = document.getElementById('floors-list');
    floorsList.innerHTML = '';
    
    engine.floorOrder.forEach((floorNum, index) => {
      const num = parseInt(floorNum);
      const floorName = engine.floorNames[num] || `Level ${num}`;

      const row = document.createElement('div');
      row.className = 'floor-row';
      row.draggable = true;
      row.dataset.index = index;

      row.addEventListener('dragstart', (e) => {
        draggedIndex = index;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        document.querySelectorAll('.floor-row').forEach(r => r.classList.remove('drag-over'));
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        if (draggedIndex !== null && draggedIndex !== index) {
          const newOrder = [...engine.floorOrder];
          const [movedItem] = newOrder.splice(draggedIndex, 1);
          newOrder.splice(index, 0, movedItem);
          engine.reorderFloors(newOrder);
          renderFloorButtons();
        }
      });

      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.innerHTML = '⋮⋮';
      handle.title = 'Drag to reorder';

      const btn = document.createElement('button');
      btn.className = `btn-floor ${num === engine.activeFloor ? 'active' : ''}`;
      btn.textContent = floorName;
      btn.title = floorName;
      btn.addEventListener('click', () => {
        engine.switchFloor(num);
        renderFloorButtons();
      });

      const renameBtn = document.createElement('button');
      renameBtn.className = 'btn-floor-rename';
      renameBtn.innerHTML = '✏️';
      renameBtn.title = 'Rename Level';
      renameBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newName = await customPrompt('Rename Level:', floorName, 'Rename Level');
        if (newName && newName.trim()) {
          engine.renameFloor(num, newName.trim());
          renderFloorButtons();
        }
      });

      row.appendChild(handle);
      row.appendChild(btn);
      row.appendChild(renameBtn);
      floorsList.appendChild(row);
    });
  }

  function bindCanvasToolEvents() {
    document.getElementById('btn-bp-main-menu').addEventListener('click', async () => {
      if (engine.isDirty) {
        const shouldSave = await customConfirm('You have unsaved changes. Would you like to save before leaving?', 'Unsaved Changes');
        if (shouldSave) {
          await saveBlueprintData();
        }
      }
      viewBlueprintCanvas.style.display = 'none';
      viewMainMenu.style.display = 'block';
      loadData();
    });

    document.getElementById('btn-bp-save').addEventListener('click', saveBlueprintData);
    document.getElementById('btn-bp-undo').addEventListener('click', () => engine.undo());
    document.getElementById('btn-bp-redo').addEventListener('click', () => engine.redo());

    // --- CENTERED COLOR MODAL EVENT HANDLERS ---
    const colorBtn = document.getElementById('btn-color-picker');
    const colorModal = document.getElementById('color-modal');
    const closeColorBtn = document.getElementById('btn-close-color-modal');
    const previewDot = document.getElementById('color-preview-dot');
    const fullColorInput = document.getElementById('full-color-input');
    const modalHexInput = document.getElementById('modal-hex-color-input');
    const swatches = document.querySelectorAll('.color-swatch');

    const updateColor = (colorHex) => {
      engine.setColor(colorHex);
      previewDot.style.backgroundColor = colorHex;
      fullColorInput.value = colorHex;
      modalHexInput.value = colorHex.toUpperCase();

      swatches.forEach(s => {
        if (s.dataset.color.toUpperCase() === colorHex.toUpperCase()) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });
    };

    colorBtn.addEventListener('click', () => {
      colorModal.style.display = 'flex';
    });

    closeColorBtn.addEventListener('click', () => {
      colorModal.style.display = 'none';
    });

    colorModal.addEventListener('click', (e) => {
      if (e.target === colorModal) {
        colorModal.style.display = 'none';
      }
    });

    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        updateColor(swatch.dataset.color);
      });
    });

    fullColorInput.addEventListener('input', (e) => {
      updateColor(e.target.value);
    });

    modalHexInput.addEventListener('input', (e) => {
      let val = e.target.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-F]{6}$/i.test(val)) {
        updateColor(val);
      }
    });

    // --- GRID TOGGLE ---
    const gridBtn = document.getElementById('btn-toggle-grid');
    gridBtn.addEventListener('click', () => {
      const isGridOn = engine.toggleGrid();
      gridBtn.textContent = `📐 Grid: ${isGridOn ? 'ON' : 'OFF'}`;
      if (isGridOn) {
        gridBtn.classList.add('active');
      } else {
        gridBtn.classList.remove('active');
      }
    });

    // --- ZOOM CONTROLS ---
    document.getElementById('btn-zoom-in').addEventListener('click', () => engine.zoomIn());
    document.getElementById('btn-zoom-out').addEventListener('click', () => engine.zoomOut());
    document.getElementById('btn-zoom-reset').addEventListener('click', () => engine.resetZoom());

    // Keyboard Shortcuts for Undo (Ctrl+Z / Cmd+Z) and Redo (Ctrl+Y / Cmd+Y / Ctrl+Shift+Z)
    window.addEventListener('keydown', (e) => {
      if (viewBlueprintCanvas.style.display === 'none') return;

      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      if (isCmdOrCtrl) {
        if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
          e.preventDefault();
          engine.undo();
        } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
          e.preventDefault();
          engine.redo();
        }
      }
    });

    // Tools handling (Including Move Canvas & Eraser)
    const tools = ['cursor', 'freehand', 'line', 'box', 'circle', 'fill', 'eraser'];
    tools.forEach(tool => {
      document.getElementById(`tool-${tool}`).addEventListener('click', (e) => {
        tools.forEach(t => document.getElementById(`tool-${t}`).classList.remove('active'));
        e.target.classList.add('active');
        engine.setTool(tool);
      });
    });

    document.getElementById('btn-add-floor').addEventListener('click', () => {
      engine.addFloor();
      renderFloorButtons();
    });
  }

  async function saveBlueprintData() {
    const exportData = engine.exportJSON(currentBlueprintId, currentBlueprintName);
    const fileName = `${currentBlueprintName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    
    try {
      await saveFileToRepository('Blueprints', fileName, exportData, `Save blueprint ${currentBlueprintName}`);
      engine.setDirty(false);
      await customAlert('Blueprint saved successfully!', 'Success');
    } catch (err) {
      await customAlert(`Save failed: ${err.message}`, 'Error');
    }
  }

  createBlueprintBtn.addEventListener('click', () => openBlueprintCanvas());
});