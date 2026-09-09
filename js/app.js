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

document.addEventListener('DOMContentLoaded', () => {
  let engine = null;
  let currentBlueprintId = null;
  let currentBlueprintName = '';

  // DOM Elements
  const viewMainMenu = document.getElementById('view-main-menu');
  const viewBlueprintCanvas = document.getElementById('view-blueprint-canvas');
  const settingsModal = document.getElementById('settings-modal');
  const dirtyDot = document.getElementById('save-dirty-dot');

  // Load existing credentials
  const config = getGitHubConfig();
  if (config) {
    loadData();
  } else {
    settingsModal.style.display = 'flex';
  }

  // --- MAIN MENU FUNCTIONS ---
  async function loadData() {
    await renderBlueprints();
    await renderRecordings();
  }

  async function renderBlueprints() {
    const blueprintsList = document.getElementById('blueprints-list');
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

      // Actions
      document.querySelectorAll('.btn-edit-bp').forEach(btn => {
        btn.addEventListener('click', (e) => openBlueprintCanvas(e.target.dataset.path));
      });

      document.querySelectorAll('.btn-delete-bp').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          if (confirm('Delete this blueprint?')) {
            await deleteFileFromRepository(e.target.dataset.path);
            renderBlueprints();
          }
        });
      });

    } catch (err) {
      blueprintsList.innerHTML = `<li class="empty-message" style="color: #FF6B6B;">Error: ${err.message}</li>`;
    }
  }

  async function renderRecordings() {
    const recordingsList = document.getElementById('recordings-list');
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
    } catch (err) {
      recordingsList.innerHTML = `<li class="empty-message" style="color: #FF6B6B;">Error: ${err.message}</li>`;
    }
  }

  // --- CANVAS INITIALIZATION ---
  async function openBlueprintCanvas(filePath = null) {
    viewMainMenu.style.display = 'none';
    viewBlueprintCanvas.style.display = 'flex';

    if (!engine) {
      engine = new BlueprintEngine('konva-holder');
      engine.init();
      engine.onDirtyChangeCallback = (isDirty) => {
        dirtyDot.style.display = isDirty ? 'inline' : 'none';
      };
      bindCanvasToolEvents();
    }

    if (filePath) {
      const fileData = await fetchFileContent(filePath);
      currentBlueprintId = fileData.content.id;
      currentBlueprintName = fileData.content.name;
      engine.loadJSON(fileData.content);
    } else {
      currentBlueprintId = `bp_${Date.now()}`;
      currentBlueprintName = prompt('Enter Blueprint Name:', 'New Stage Blueprint') || 'New Stage Blueprint';
      engine.loadJSON({ floors: [{ level: 1, layerData: null }] });
    }

    renderFloorButtons();
  }

  function renderFloorButtons() {
    const floorsList = document.getElementById('floors-list');
    floorsList.innerHTML = '';
    
    Object.keys(engine.floorsData).forEach(floorNum => {
      const num = parseInt(floorNum);
      const btn = document.createElement('button');
      btn.className = `btn-floor ${num === engine.activeFloor ? 'active' : ''}`;
      btn.textContent = `Level ${num}`;
      btn.addEventListener('click', () => {
        engine.switchFloor(num);
        renderFloorButtons();
      });
      floorsList.appendChild(btn);
    });
  }

  function bindCanvasToolEvents() {
    // Main Menu Button
    document.getElementById('btn-bp-main-menu').addEventListener('click', async () => {
      if (engine.isDirty) {
        if (confirm('You have unsaved changes. Would you like to save before leaving?')) {
          await saveBlueprintData();
        }
      }
      viewBlueprintCanvas.style.display = 'none';
      viewMainMenu.style.display = 'block';
      loadData();
    });

    // Save Button
    document.getElementById('btn-bp-save').addEventListener('click', saveBlueprintData);

    // Undo / Redo
    document.getElementById('btn-bp-undo').addEventListener('click', () => engine.undo());
    document.getElementById('btn-bp-redo').addEventListener('click', () => engine.redo());

    // Tools
    const tools = ['freehand', 'line', 'box', 'circle'];
    tools.forEach(tool => {
      document.getElementById(`tool-${tool}`).addEventListener('click', (e) => {
        tools.forEach(t => document.getElementById(`tool-${t}`).classList.remove('active'));
        e.target.classList.add('active');
        engine.setTool(tool);
      });
    });

    // Add Floor
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
      alert('Blueprint saved successfully!');
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    }
  }

  // Bind New Blueprint button
  document.getElementById('btn-create-blueprint').addEventListener('click', () => openBlueprintCanvas());
});