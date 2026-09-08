const ACTOR_COLORS = ['#ff3b30', '#30d158', '#0a84ff', '#ffd60a', '#bf5af2', '#ff9f0a'];

// State
const appState = {
  mode: 'BLOCKING',       // 'BLUEPRINT_EDIT', 'BLOCKING', 'PLAYBACK', 'WAITING_NOTE'
  activeTool: 'line',     // 'line', 'freehand', 'rect', 'circle', 'eraser'
  activeBlueprintId: null,
  activeFloorId: 'floor_1',
  blueprints: {},         // Storage map
  directoryHandle: null,  // Directory handle for saving files
  isDirty: false,         // Tracks unsaved edits
  
  undoStack: [],
  redoStack: [],
  actors: [],
  selectedActor: null,
  activeRecording: [],
  savedRecordings: {},
  recordingStartTime: 0,
  isRecording: false,
  
  playback: {
    recordingKeyframes: [],
    currentIndex: 0,
    startTime: 0,
    timerId: null,
    isPlaying: false
  },

  currentShape: null,
  isPointerDown: false,
  pointerCoords: { x: 0, y: 0 }
};

// DOM Elements
const launchScreen = document.getElementById('blueprint-modal');
const blueprintList = document.getElementById('blueprint-list');
const btnCreateBlueprint = document.getElementById('btn-create-blueprint');
const newBlueprintNameInput = document.getElementById('new-blueprint-name');
const workspace = document.getElementById('workspace');

const canvas = document.getElementById('stageCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvas-container');
const floorListContainer = document.getElementById('floor-list');
const btnAddFloor = document.getElementById('btn-add-floor');
const toolButtons = document.querySelectorAll('.tool-btn');
const btnAddPerson = document.getElementById('btn-add-person');
const btnRecord = document.getElementById('btn-record');
const btnPlay = document.getElementById('btn-play');
const btnPause = document.getElementById('btn-pause');
const btnAddNote = document.getElementById('btn-add-note');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnSaveTake = document.getElementById('btn-save-take');
const selectRecording = document.getElementById('select-recording');
const noteBanner = document.getElementById('note-banner');
const noteText = document.getElementById('note-text');

const groupBlueprintTools = document.getElementById('blueprint-tools');
const groupBlockingTools = document.getElementById('blocking-tools');

// Clean up legacy elements
['btn-mode-blueprint', 'btn-mode-blocking', 'btn-switch-blueprint'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.remove();
});

// Top-Left Main Menu Button
let btnMainMenu = document.getElementById('btn-main-menu');
if (!btnMainMenu) {
  btnMainMenu = document.createElement('button');
  btnMainMenu.id = 'btn-main-menu';
  btnMainMenu.className = 'btn-main-menu';
  btnMainMenu.textContent = '< Main Menu';
  const ribbonLeft = document.querySelector('#top-ribbon .ribbon-group');
  if (ribbonLeft) ribbonLeft.insertBefore(btnMainMenu, ribbonLeft.firstChild);
}

// Save Blueprint Button
let btnSaveBlueprint = document.getElementById('btn-save-blueprint');
if (!btnSaveBlueprint) {
  btnSaveBlueprint = document.createElement('button');
  btnSaveBlueprint.id = 'btn-save-blueprint';
  btnSaveBlueprint.className = 'btn-save-blueprint';
  btnSaveBlueprint.textContent = 'Save Blueprint';
  if (groupBlueprintTools) groupBlueprintTools.appendChild(btnSaveBlueprint);
}

// Folder Selection Button
let btnSelectFolder = document.getElementById('btn-select-folder');
if (!btnSelectFolder) {
  btnSelectFolder = document.createElement('button');
  btnSelectFolder.id = 'btn-select-folder';
  btnSelectFolder.className = 'btn-dir-select';
  btnSelectFolder.textContent = 'Select Blueprints Folder';
  const cardActions = document.querySelector('.card-actions');
  if (cardActions) cardActions.insertBefore(btnSelectFolder, cardActions.firstChild);
}

// IndexedDB Helper for Directory Handle Persistence
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BlueprintAppDB', 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('handles');
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function storeDirectoryHandle(handle) {
  const db = await openDB();
  const tx = db.transaction('handles', 'readwrite');
  tx.objectStore('handles').put(handle, 'blueprintsDir');
  return tx.complete;
}

async function getStoredDirectoryHandle() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get('blueprintsDir');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function resizeCanvas() {
  if (!container || workspace.classList.contains('hidden')) return;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  render();
}

function getCanvasCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function getActiveBlueprint() {
  return appState.blueprints[appState.activeBlueprintId];
}

function getActiveFloor() {
  const bp = getActiveBlueprint();
  return bp ? bp.floors.find(f => f.id === appState.activeFloorId) : null;
}

// File System & Blueprint Storage Workflow
async function initDirectoryHandle() {
  try {
    const handle = await getStoredDirectoryHandle();
    if (handle) {
      if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted' ||
          (await handle.requestPermission({ mode: 'readwrite' })) === 'granted') {
        appState.directoryHandle = handle;
        updateFolderButtonUI(true);
        await loadBlueprintsFromFolder();
      }
    }
  } catch (err) {
    console.warn("Could not restore directory handle:", err);
  }
}

function updateFolderButtonUI(isLinked) {
  if (isLinked) {
    btnSelectFolder.textContent = 'Blueprints Folder Linked';
    btnSelectFolder.style.backgroundColor = '#30d158';
  } else {
    btnSelectFolder.textContent = 'Select Blueprints Folder';
    btnSelectFolder.style.backgroundColor = '#545458';
  }
}

async function setBlueprintsDirectory() {
  try {
    const rootHandle = await window.showDirectoryPicker();
    appState.directoryHandle = await rootHandle.getDirectoryHandle('Blueprints', { create: true });
    await storeDirectoryHandle(appState.directoryHandle);
    updateFolderButtonUI(true);
    await loadBlueprintsFromFolder();
  } catch (err) {
    console.warn("Folder selection canceled or unsupported:", err);
  }
}

async function triggerBlueprintSave(explicitUserAction = false) {
  const bp = getActiveBlueprint();
  if (!bp) return false;

  if (explicitUserAction && (!bp.filename || bp.name.startsWith('Blueprint '))) {
    const chosenName = prompt("Enter a name for this Blueprint:", bp.name);
    if (!chosenName) return false;
    bp.name = chosenName.trim();
    bp.filename = `${bp.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
  }

  const fileName = bp.filename || `${bp.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
  bp.filename = fileName;
  const serializedData = JSON.stringify(bp, null, 2);

  if (appState.directoryHandle) {
    try {
      const fileHandle = await appState.directoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(serializedData);
      await writable.close();
      appState.isDirty = false;
      if (explicitUserAction) alert(`Blueprint "${bp.name}" saved successfully!`);
      return true;
    } catch (err) {
      console.error("Failed to write file to disk:", err);
      alert("Failed to save blueprint to folder.");
      return false;
    }
  } else {
    localStorage.setItem(`bp_${bp.id}`, serializedData);
    appState.isDirty = false;
    if (explicitUserAction) alert(`Blueprint "${bp.name}" saved locally. Link a folder to write directly to disk.`);
    return true;
  }
}

async function loadBlueprintsFromFolder() {
  if (!appState.directoryHandle) return;

  appState.blueprints = {};
  for await (const entry of appState.directoryHandle.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.json')) {
      try {
        const file = await entry.getFile();
        const content = await file.text();
        const bp = JSON.parse(content);
        if (bp.id && bp.name) {
          bp.filename = entry.name;
          appState.blueprints[bp.id] = bp;
        }
      } catch (err) {
        console.error("Invalid blueprint JSON file:", entry.name);
      }
    }
  }
  renderBlueprintList();
}

// Navigation & Navigation Guards
async function handleMainMenuClick() {
  if (appState.isDirty) {
    const confirmSave = confirm("You have unsaved changes. Would you like to save before leaving?");
    if (confirmSave) {
      const saved = await triggerBlueprintSave(true);
      if (!saved) return; // Stay on screen if user canceled save prompt
    }
  }
  showLaunchScreen();
}

function showLaunchScreen() {
  workspace.classList.add('hidden');
  launchScreen.classList.remove('hidden');
  launchScreen.className = ''; 
  launchScreen.id = 'launch-screen';
  appState.isDirty = false;
  if (appState.directoryHandle) {
    loadBlueprintsFromFolder();
  } else {
    renderBlueprintList();
  }
}

function renderBlueprintList() {
  blueprintList.className = 'blueprint-select-list';
  blueprintList.innerHTML = '';
  const bpKeys = Object.keys(appState.blueprints);
  
  if (bpKeys.length === 0) {
    blueprintList.innerHTML = '<p style="color: #8e8e93; text-align: center; padding: 12px;">No blueprints found.</p>';
    return;
  }

  bpKeys.forEach(id => {
    const item = document.createElement('div');
    item.className = 'blueprint-select-item';
    
    const label = document.createElement('span');
    label.textContent = appState.blueprints[id].name;

    const actionBox = document.createElement('div');
    actionBox.className = 'item-actions';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn-edit';
    btnEdit.textContent = 'Edit';
    btnEdit.addEventListener('click', () => openBlueprint(id, 'BLUEPRINT_EDIT'));

    const btnOpen = document.createElement('button');
    btnOpen.className = 'btn-open';
    btnOpen.textContent = 'Open';
    btnOpen.addEventListener('click', () => openBlueprint(id, 'BLOCKING'));

    actionBox.appendChild(btnEdit);
    actionBox.appendChild(btnOpen);
    item.appendChild(label);
    item.appendChild(actionBox);

    blueprintList.appendChild(item);
  });
}

function openBlueprint(id, targetMode) {
  appState.activeBlueprintId = id;
  appState.activeFloorId = appState.blueprints[id].floors[0].id;
  appState.isDirty = false;
  
  launchScreen.classList.add('hidden');
  workspace.classList.remove('hidden');

  setMode(targetMode);
  renderFloorSidebar();
  resizeCanvas();
}

function createNewBlueprint() {
  const defaultName = newBlueprintNameInput.value.trim() || `Blueprint ${Object.keys(appState.blueprints).length + 1}`;
  const id = `bp_${Date.now()}`;
  
  appState.blueprints[id] = {
    id: id,
    name: defaultName,
    filename: null,
    floors: [{ id: 'floor_1', name: 'Floor 1', shapes: [] }]
  };

  newBlueprintNameInput.value = '';
  openBlueprint(id, 'BLUEPRINT_EDIT');
  appState.isDirty = true;
}

function setMode(mode) {
  appState.mode = mode;
  if (mode === 'BLUEPRINT_EDIT') {
    groupBlueprintTools.classList.remove('hidden');
    groupBlockingTools.classList.add('hidden');
  } else if (mode === 'BLOCKING') {
    groupBlockingTools.classList.remove('hidden');
    groupBlueprintTools.classList.add('hidden');
  }
  render();
}

// Drawing & Canvas Operations
function eraseShapesAt(coords) {
  const activeFloor = getActiveFloor();
  if (!activeFloor) return;

  const eraserRadius = 15;
  const initialCount = activeFloor.shapes.length;

  activeFloor.shapes = activeFloor.shapes.filter(shape => {
    if (shape.type === 'line') {
      return !pointNearSegment(coords, {x: shape.x1, y: shape.y1}, {x: shape.x2, y: shape.y2}, eraserRadius);
    } else if (shape.type === 'freehand') {
      return !shape.points.some(pt => Math.hypot(pt.x - coords.x, pt.y - coords.y) <= eraserRadius);
    } else if (shape.type === 'rect') {
      return !(coords.x >= shape.x - eraserRadius && coords.x <= shape.x + shape.w + eraserRadius &&
               coords.y >= shape.y - eraserRadius && coords.y <= shape.y + shape.h + eraserRadius);
    } else if (shape.type === 'circle') {
      const dist = Math.hypot(coords.x - shape.cx, coords.y - shape.cy);
      return Math.abs(dist - shape.r) > eraserRadius;
    }
    return true;
  });

  if (activeFloor.shapes.length !== initialCount) {
    appState.isDirty = true;
    render();
  }
}

function pointNearSegment(p, p1, p2, threshold) {
  const l2 = (p2.x - p1.x)**2 + (p2.y - p1.y)**2;
  if (l2 === 0) return Math.hypot(p.x - p1.x, p.y - p1.y) <= threshold;
  let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
  return Math.hypot(p.x - proj.x, p.y - proj.y) <= threshold;
}

function saveStateForUndo() {
  const bp = getActiveBlueprint();
  if (!bp) return;
  const floorState = JSON.parse(JSON.stringify(bp.floors));
  appState.undoStack.push(floorState);
  appState.redoStack = [];
}

function undo() {
  if (appState.undoStack.length === 0) return;
  const bp = getActiveBlueprint();
  const currentState = JSON.parse(JSON.stringify(bp.floors));
  appState.redoStack.push(currentState);
  bp.floors = appState.undoStack.pop();
  appState.isDirty = true;
  renderFloorSidebar();
  render();
}

function redo() {
  if (appState.redoStack.length === 0) return;
  const bp = getActiveBlueprint();
  const currentState = JSON.parse(JSON.stringify(bp.floors));
  appState.undoStack.push(currentState);
  bp.floors = appState.redoStack.pop();
  appState.isDirty = true;
  renderFloorSidebar();
  render();
}

// Floor Sidebar Navigation
function renderFloorSidebar() {
  floorListContainer.innerHTML = '';
  const bp = getActiveBlueprint();
  if (!bp) return;

  bp.floors.forEach((floor) => {
    const button = document.createElement('button');
    button.className = `floor-btn ${floor.id === appState.activeFloorId ? 'active' : ''}`;
    button.textContent = floor.name;
    button.addEventListener('click', () => switchFloor(floor.id));
    floorListContainer.appendChild(button);
  });
}

function switchFloor(floorId) {
  appState.activeFloorId = floorId;
  renderFloorSidebar();
  render();
}

function addNewFloor() {
  const bp = getActiveBlueprint();
  if (!bp) return;
  saveStateForUndo();

  const floorCount = bp.floors.length + 1;
  const newFloorId = `floor_${Date.now()}`;
  bp.floors.push({
    id: newFloorId,
    name: `Floor ${floorCount}`,
    shapes: []
  });
  appState.isDirty = true;
  switchFloor(newFloorId);
}

// Actor Setup
function addPerson() {
  const color = ACTOR_COLORS[appState.actors.length % ACTOR_COLORS.length];
  const newActor = {
    id: `actor_${Date.now()}`,
    label: `P${appState.actors.length + 1}`,
    color: color,
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 18
  };
  appState.actors.push(newActor);
  render();
}

function hitTestActor(coords) {
  return appState.actors.find(actor => {
    const dx = coords.x - actor.x;
    const dy = coords.y - actor.y;
    return Math.sqrt(dx * dx + dy * dy) <= actor.radius + 5;
  });
}

// Recording & Playback
function toggleRecording() {
  if (!appState.isRecording) {
    if (appState.actors.length === 0) {
      alert("Please add at least one person before recording.");
      return;
    }
    appState.isRecording = true;
    appState.recordingStartTime = Date.now();
    appState.activeRecording = [];
    btnRecord.classList.add('recording');
    btnRecord.textContent = 'Stop';
  } else {
    appState.isRecording = false;
    btnRecord.classList.remove('recording');
    btnRecord.textContent = 'Record';
  }
}

function saveRecordingTake() {
  if (appState.activeRecording.length === 0) {
    alert("No active recording data to save.");
    return;
  }
  const takeName = prompt("Enter Take Name:", `Take ${Object.keys(appState.savedRecordings).length + 1}`);
  if (!takeName) return;

  appState.savedRecordings[takeName] = [...appState.activeRecording];
  
  const option = document.createElement('option');
  option.value = takeName;
  option.textContent = takeName;
  selectRecording.appendChild(option);
  selectRecording.value = takeName;
}

function addNotePrompt() {
  if (!appState.isRecording) {
    alert("You must be actively recording to attach a note.");
    return;
  }
  const text = prompt("Enter Blocking Note (e.g., 'Pick up prop'):");
  if (!text || appState.activeRecording.length === 0) return;

  const lastKeyframe = appState.activeRecording[appState.activeRecording.length - 1];
  lastKeyframe.noteText = text;
  alert("Note added at current timestamp.");
}

function startPlayback() {
  const selectedTake = selectRecording.value;
  let keyframes = appState.savedRecordings[selectedTake] || appState.activeRecording;

  if (!keyframes || keyframes.length === 0) {
    alert("Please select or record a take to play.");
    return;
  }

  appState.mode = 'PLAYBACK';
  appState.playback.recordingKeyframes = keyframes;
  appState.playback.currentIndex = 0;
  appState.playback.isPlaying = true;
  appState.playback.startTime = Date.now();

  runPlaybackLoop();
}

function pausePlayback() {
  appState.playback.isPlaying = false;
  if (appState.playback.timerId) {
    cancelAnimationFrame(appState.playback.timerId);
  }
  appState.mode = 'BLOCKING';
}

function runPlaybackLoop() {
  if (!appState.playback.isPlaying) return;

  const keyframes = appState.playback.recordingKeyframes;
  const idx = appState.playback.currentIndex;

  if (idx >= keyframes.length) {
    pausePlayback();
    return;
  }

  const currentFrame = keyframes[idx];

  if (currentFrame.floorId !== appState.activeFloorId) {
    switchFloor(currentFrame.floorId);
  }

  const actor = appState.actors.find(a => a.id === currentFrame.actorId);
  if (actor) {
    actor.x = currentFrame.x;
    actor.y = currentFrame.y;
  }

  if (currentFrame.noteText) {
    appState.playback.isPlaying = false;
    appState.mode = 'WAITING_NOTE';
    noteText.textContent = `NOTE: "${currentFrame.noteText}" (Tap anywhere to resume)`;
    noteBanner.classList.remove('hidden');
    appState.playback.currentIndex++;
    render();
    return;
  }

  appState.playback.currentIndex++;
  render();

  if (idx + 1 < keyframes.length) {
    const timeDelta = keyframes[idx + 1].timestamp - currentFrame.timestamp;
    setTimeout(() => {
      if (appState.playback.isPlaying) {
        appState.playback.timerId = requestAnimationFrame(runPlaybackLoop);
      }
    }, Math.max(timeDelta, 16));
  } else {
    pausePlayback();
  }
}

function resumeFromNote() {
  if (appState.mode !== 'WAITING_NOTE') return;
  noteBanner.classList.add('hidden');
  appState.mode = 'PLAYBACK';
  appState.playback.isPlaying = true;
  runPlaybackLoop();
}

// Pointer Event Handlers
function handlePointerDown(e) {
  if (appState.mode === 'WAITING_NOTE') {
    resumeFromNote();
    return;
  }

  appState.isPointerDown = true;
  const coords = getCanvasCoordinates(e);
  appState.pointerCoords = coords;

  if (appState.mode === 'BLOCKING') {
    const clickedActor = hitTestActor(coords);
    if (clickedActor) {
      appState.selectedActor = clickedActor;
    }
  } else if (appState.mode === 'BLUEPRINT_EDIT') {
    saveStateForUndo();
    const tool = appState.activeTool;
    if (tool === 'eraser') {
      eraseShapesAt(coords);
    } else if (tool === 'line') {
      appState.currentShape = { type: 'line', x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y };
    } else if (tool === 'freehand') {
      appState.currentShape = { type: 'freehand', points: [{ x: coords.x, y: coords.y }] };
    } else if (tool === 'rect') {
      appState.currentShape = { type: 'rect', x: coords.x, y: coords.y, w: 0, h: 0 };
    } else if (tool === 'circle') {
      appState.currentShape = { type: 'circle', cx: coords.x, cy: coords.y, r: 0 };
    }
  }
  render();
}

function handlePointerMove(e) {
  if (!appState.isPointerDown) return;
  const coords = getCanvasCoordinates(e);
  appState.pointerCoords = coords;

  if (appState.mode === 'BLOCKING' && appState.selectedActor) {
    const actor = appState.selectedActor;
    const dx = coords.x - actor.x;
    const dy = coords.y - actor.y;
    const distanceMoved = Math.sqrt(dx * dx + dy * dy);

    actor.x = coords.x;
    actor.y = coords.y;

    if (appState.isRecording && distanceMoved > 1.5) {
      const timeElapsed = Date.now() - appState.recordingStartTime;
      appState.activeRecording.push({
        actorId: actor.id,
        x: actor.x,
        y: actor.y,
        floorId: appState.activeFloorId,
        timestamp: timeElapsed
      });
    }
  } else if (appState.mode === 'BLUEPRINT_EDIT') {
    if (appState.activeTool === 'eraser') {
      eraseShapesAt(coords);
    } else if (appState.currentShape) {
      const shape = appState.currentShape;
      if (shape.type === 'line') {
        shape.x2 = coords.x;
        shape.y2 = coords.y;
      } else if (shape.type === 'freehand') {
        shape.points.push({ x: coords.x, y: coords.y });
      } else if (shape.type === 'rect') {
        shape.w = coords.x - shape.x;
        shape.h = coords.y - shape.y;
      } else if (shape.type === 'circle') {
        const dx = coords.x - shape.cx;
        const dy = coords.y - shape.cy;
        shape.r = Math.sqrt(dx * dx + dy * dy);
      }
    }
  }
  render();
}

function handlePointerUp() {
  if (!appState.isPointerDown) return;
  appState.isPointerDown = false;

  if (appState.selectedActor) {
    appState.selectedActor = null;
  } else if (appState.mode === 'BLUEPRINT_EDIT' && appState.currentShape) {
    const activeFloor = getActiveFloor();
    if (activeFloor) {
      activeFloor.shapes.push(appState.currentShape);
      appState.isDirty = true;
    }
    appState.currentShape = null;
  }
  render();
}

function handleKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    redo();
  }
}

// Drawing Utilities
function drawShape(ctx, shape, isPreview = false) {
  ctx.strokeStyle = isPreview ? '#0a84ff' : '#ffffff';
  ctx.lineWidth = isPreview ? 2 : 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isPreview) {
    ctx.setLineDash([6, 6]);
  } else {
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  if (shape.type === 'line') {
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
  } else if (shape.type === 'freehand') {
    if (shape.points.length > 0) {
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
    }
  } else if (shape.type === 'rect') {
    ctx.rect(shape.x, shape.y, shape.w, shape.h);
  } else if (shape.type === 'circle') {
    ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawRecordedPaths(ctx) {
  const selectedTake = selectRecording.value;
  const keyframes = appState.savedRecordings[selectedTake] || appState.activeRecording;

  if (!keyframes || keyframes.length === 0) return;

  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#0a84ff';
  ctx.lineWidth = 4;
  ctx.beginPath();

  let isDrawingPath = false;
  keyframes.forEach((kf) => {
    if (kf.floorId === appState.activeFloorId) {
      if (!isDrawingPath) {
        ctx.moveTo(kf.x, kf.y);
        isDrawingPath = true;
      } else {
        ctx.lineTo(kf.x, kf.y);
      }
    } else {
      isDrawingPath = false;
    }
  });

  ctx.stroke();
  ctx.restore();
}

function drawActors(ctx) {
  appState.actors.forEach(actor => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(actor.x, actor.y, actor.radius, 0, Math.PI * 2);
    ctx.fillStyle = actor.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(actor.label, actor.x, actor.y);
    ctx.restore();
  });
}

function render() {
  if (workspace.classList.contains('hidden')) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const activeFloor = getActiveFloor();
  if (activeFloor) {
    activeFloor.shapes.forEach(shape => drawShape(ctx, shape, false));
  }

  if (appState.currentShape) {
    drawShape(ctx, appState.currentShape, true);
  }

  if (appState.mode === 'BLUEPRINT_EDIT' && appState.activeTool === 'eraser' && appState.isPointerDown) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(appState.pointerCoords.x, appState.pointerCoords.y, 15, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  if (appState.mode !== 'BLUEPRINT_EDIT') {
    drawRecordedPaths(ctx);
    drawActors(ctx);
  }

  ctx.save();
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#8e8e93';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('AUDIENCE', canvas.width / 2, canvas.height - 20);
  ctx.restore();
}

// Initialization
async function init() {
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', handleKeyDown);

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);

  btnAddFloor.addEventListener('click', addNewFloor);
  btnAddPerson.addEventListener('click', addPerson);
  btnRecord.addEventListener('click', toggleRecording);
  btnSaveTake.addEventListener('click', saveRecordingTake);
  btnPlay.addEventListener('click', startPlayback);
  btnPause.addEventListener('click', pausePlayback);
  btnAddNote.addEventListener('click', addNotePrompt);
  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);
  noteBanner.addEventListener('click', resumeFromNote);

  btnCreateBlueprint.addEventListener('click', createNewBlueprint);
  btnMainMenu.addEventListener('click', handleMainMenuClick);
  btnSelectFolder.addEventListener('click', setBlueprintsDirectory);
  btnSaveBlueprint.addEventListener('click', () => triggerBlueprintSave(true));

  toolButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      toolButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      appState.activeTool = e.target.dataset.tool;
    });
  });

  await initDirectoryHandle();
  showLaunchScreen();
}

document.addEventListener('DOMContentLoaded', init);