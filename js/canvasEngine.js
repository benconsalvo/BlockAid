// js/canvasEngine.js

function hexToRgb(hex) {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function colorMatch(r1, g1, b1, a1, r2, g2, b2, a2, tolerance = 32) {
  return Math.abs(r1 - r2) <= tolerance &&
         Math.abs(g1 - g2) <= tolerance &&
         Math.abs(b1 - b2) <= tolerance &&
         Math.abs(a1 - a2) <= tolerance;
}

export class BlueprintEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.stage = null;
    this.gridLayer = null;
    this.layer = null;
    this.tokenLayer = null;
    this.trailLayer = null;
    
    this.activeTool = 'freehand'; // 'freehand', 'line', 'box', 'circle', 'fill', 'eraser'
    this.strokeColor = '#1C1C1C';
    this.activeFloor = 1;
    this.floorsData = { 1: null };
    this.floorNames = { 1: 'Level 1' };
    this.floorOrder = [1];
    this.showGrid = true;

    // --- PHASE 4 RECORDING ENGINE STATE ---
    this.performers = {}; // { id: { id, name, color, group, floor } }
    this.recordedFrames = []; // Array of { timestamp, floor, performerData: { id: { x, y, floor } } }
    this.notes = []; // Array of { timestamp, text, floor }
    
    this.isRecording = false;
    this.isPlaying = false;
    this.isPaused = false;
    this.recStartTime = 0;
    this.elapsedTime = 0;
    this.recordingInterval = null;
    this.playbackAnimFrame = null;
    this.playbackStartTime = 0;

    this.undoStack = [];
    this.redoStack = [];
    this.isDirty = false;
    this.isDrawing = false;
    this.currentShape = null;

    this.onDirtyChangeCallback = null;
    this.onZoomChangeCallback = null;
    this.onTimerUpdateCallback = null;
    this.onNoteTriggerCallback = null;
    this.onPerformersChangeCallback = null;

    this.isRightClickPanning = false;
    this.lastPanPointer = null;
    this.lastCenter = null;
    this.lastDist = 0;
  }

  init() {
    const width = this.container.offsetWidth || window.innerWidth - 160;
    const height = this.container.offsetHeight || window.innerHeight - 96;

    this.stage = new Konva.Stage({
      container: this.container.id,
      width: width,
      height: height,
      draggable: false
    });

    // 1. Grid layer (bottom)
    this.gridLayer = new Konva.Layer({ listening: false });
    this.stage.add(this.gridLayer);

    // 2. Blueprint drawing layer
    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    // 3. Movement path trails layer
    this.trailLayer = new Konva.Layer({ listening: false });
    this.stage.add(this.trailLayer);

    // 4. Performer tokens layer (top)
    this.tokenLayer = new Konva.Layer();
    this.stage.add(this.tokenLayer);

    this.drawGrid();
    this.bindEvents();

    window.addEventListener('resize', () => {
      if (this.stage && this.container) {
        this.stage.width(this.container.offsetWidth);
        this.stage.height(this.container.offsetHeight);
        this.drawGrid();
      }
    });
  }

  // --- PERFORMER TOKEN MANAGEMENT ---
  addPerformer(name, color) {
    const id = `perf_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const startPos = {
      x: (this.stage.width() / 2 - this.stage.x()) / this.stage.scaleX(),
      y: (this.stage.height() / 2 - this.stage.y()) / this.stage.scaleY()
    };

    const group = new Konva.Group({
      x: startPos.x,
      y: startPos.y,
      draggable: true,
      id: id
    });

    const circle = new Konva.Circle({
      radius: 18,
      fill: color,
      stroke: '#FFFFFF',
      strokeWidth: 2,
      shadowColor: '#000000',
      shadowBlur: 6,
      shadowOpacity: 0.4
    });

    const label = new Konva.Text({
      text: name.substring(0, 3).toUpperCase(),
      fontSize: 11,
      fontStyle: 'bold',
      fill: '#FFFFFF',
      align: 'center'
    });
    label.offsetX(label.width() / 2);
    label.offsetY(label.height() / 2);

    group.add(circle);
    group.add(label);

    group.on('dragend', () => {
      this.setDirty(true);
    });

    this.performers[id] = {
      id: id,
      name: name,
      color: color,
      group: group,
      floor: this.activeFloor
    };

    this.tokenLayer.add(group);
    this.tokenLayer.batchDraw();
    this.setDirty(true);

    if (this.onPerformersChangeCallback) {
      this.onPerformersChangeCallback(this.performers);
    }

    return id;
  }

  // --- RECORDING LOGIC ---
  startRecording() {
    if (this.isPlaying) this.stopPlayback();

    this.isRecording = true;
    this.isPaused = false;
    this.recStartTime = Date.now() - this.elapsedTime;
    this.recordedFrames = [];

    this.recordingInterval = setInterval(() => {
      this.recordFrame();
    }, 100); // Record position every 100ms
  }

  recordFrame() {
    if (!this.isRecording || this.isPaused) return;

    this.elapsedTime = Date.now() - this.recStartTime;
    const performerData = {};

    Object.keys(this.performers).forEach(id => {
      const p = this.performers[id];
      performerData[id] = {
        x: p.group.x(),
        y: p.group.y(),
        floor: p.floor
      };
    });

    this.recordedFrames.push({
      timestamp: this.elapsedTime,
      performerData: performerData
    });

    if (this.onTimerUpdateCallback) {
      this.onTimerUpdateCallback(this.elapsedTime);
    }
  }

  pauseRecording() {
    this.isPaused = !this.isPaused;
    if (!this.isPaused) {
      this.recStartTime = Date.now() - this.elapsedTime;
    }
  }

  stopRecording() {
    this.isRecording = false;
    this.isPaused = false;
    clearInterval(this.recordingInterval);
    this.setDirty(true);
  }

  addNote(text) {
    if (!text || !text.trim()) return;
    const time = this.elapsedTime;
    this.notes.push({
      timestamp: time,
      text: text.trim(),
      floor: this.activeFloor
    });
    this.setDirty(true);
  }

  // --- PLAYBACK LOGIC ---
  startPlayback() {
    if (this.recordedFrames.length === 0) return;
    if (this.isRecording) this.stopRecording();

    this.isPlaying = true;
    this.isPaused = false;
    this.playbackStartTime = Date.now();
    this.drawPlaybackTrails();
    this.playLoop();
  }

  playLoop() {
    if (!this.isPlaying) return;

    if (!this.isPaused) {
      const currentRecTime = Date.now() - this.playbackStartTime;

      if (this.onTimerUpdateCallback) {
        this.onTimerUpdateCallback(currentRecTime);
      }

      // Check for Stage Notes trigger
      const triggeredNote = this.notes.find(n => Math.abs(n.timestamp - currentRecTime) < 120);
      if (triggeredNote && !triggeredNote.shown) {
        triggeredNote.shown = true;
        this.isPaused = true;
        if (this.onNoteTriggerCallback) {
          this.onNoteTriggerCallback(triggeredNote);
        }
      }

      // Find closest recorded frame
      const frame = this.recordedFrames.find(f => f.timestamp >= currentRecTime);
      if (frame) {
        Object.keys(frame.performerData).forEach(id => {
          const data = frame.performerData[id];
          const p = this.performers[id];
          if (p) {
            // Seamless Floor Level Switch during replay
            if (data.floor !== this.activeFloor) {
              this.switchFloor(data.floor);
            }
            p.group.position({ x: data.x, y: data.y });
          }
        });
        this.tokenLayer.batchDraw();
      } else {
        // End of recording reach
        this.stopPlayback();
        return;
      }
    }

    this.playbackAnimFrame = requestAnimationFrame(() => this.playLoop());
  }

  drawPlaybackTrails() {
    this.trailLayer.destroyChildren();

    Object.keys(this.performers).forEach(id => {
      const p = this.performers[id];
      const points = [];

      this.recordedFrames.forEach(f => {
        const data = f.performerData[id];
        if (data && data.floor === this.activeFloor) {
          points.push(data.x, data.y);
        }
      });

      if (points.length > 2) {
        const trail = new Konva.Line({
          points: points,
          stroke: p.color,
          strokeWidth: 3,
          opacity: 0.5,
          dash: [6, 4]
        });
        this.trailLayer.add(trail);
      }
    });

    this.trailLayer.batchDraw();
  }

  resumePlayback() {
    this.isPaused = false;
    this.playbackStartTime = Date.now() - this.elapsedTime;
  }

  stopPlayback() {
    this.isPlaying = false;
    this.isPaused = false;
    cancelAnimationFrame(this.playbackAnimFrame);
    this.trailLayer.destroyChildren();
    this.trailLayer.batchDraw();
  }

  // --- GRID & CANVAS SETUP ---
  toggleGrid() {
    this.showGrid = !this.showGrid;
    this.drawGrid();
    return this.showGrid;
  }

  drawGrid() {
    this.gridLayer.destroyChildren();
    if (!this.showGrid) {
      this.gridLayer.batchDraw();
      return;
    }

    const gridSize = 30;
    const width = 4000;
    const height = 4000;

    for (let i = 0; i < width / gridSize; i++) {
      this.gridLayer.add(new Konva.Line({
        points: [i * gridSize, 0, i * gridSize, height],
        stroke: '#BBBBBB',
        strokeWidth: 1,
        opacity: 0.35,
        dash: [2, 2]
      }));
    }

    for (let j = 0; j < height / gridSize; j++) {
      this.gridLayer.add(new Konva.Line({
        points: [0, j * gridSize, width, j * gridSize],
        stroke: '#BBBBBB',
        strokeWidth: 1,
        opacity: 0.35,
        dash: [2, 2]
      }));
    }

    this.gridLayer.batchDraw();
  }

  zoomIn() {
    const oldScale = this.stage.scaleX();
    const newScale = Math.min(oldScale * 1.2, 5);
    this.setStageScale(newScale);
  }

  zoomOut() {
    const oldScale = this.stage.scaleX();
    const newScale = Math.max(oldScale / 1.2, 0.3);
    this.setStageScale(newScale);
  }

  resetZoom() {
    this.stage.scale({ x: 1, y: 1 });
    this.stage.position({ x: 0, y: 0 });
    this.stage.batchDraw();
    if (this.onZoomChangeCallback) this.onZoomChangeCallback(1);
  }

  setStageScale(newScale) {
    const center = {
      x: this.stage.width() / 2,
      y: this.stage.height() / 2
    };

    const mousePointTo = {
      x: (center.x - this.stage.x()) / this.stage.scaleX(),
      y: (center.y - this.stage.y()) / this.stage.scaleY()
    };

    this.stage.scale({ x: newScale, y: newScale });

    const newPos = {
      x: center.x - mousePointTo.x * newScale,
      y: center.y - mousePointTo.y * newScale
    };

    this.stage.position(newPos);
    this.stage.batchDraw();

    if (this.onZoomChangeCallback) this.onZoomChangeCallback(newScale);
  }

  setDirty(dirty) {
    this.isDirty = dirty;
    if (this.onDirtyChangeCallback) {
      this.onDirtyChangeCallback(dirty);
    }
  }

  setTool(tool) {
    this.activeTool = tool;
    this.container.style.cursor = 'crosshair';
  }

  setColor(color) {
    this.strokeColor = color;
  }

  bindEvents() {
    this.stage.on('contextmenu', (e) => e.evt.preventDefault());

    this.stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const oldScale = this.stage.scaleX();
      const pointer = this.stage.getPointerPosition();

      const mousePointTo = {
        x: (pointer.x - this.stage.x()) / oldScale,
        y: (pointer.y - this.stage.y()) / oldScale
      };

      const scaleBy = 1.1;
      const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
      const clampedScale = Math.max(0.3, Math.min(5, newScale));

      this.stage.scale({ x: clampedScale, y: clampedScale });

      const newPos = {
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale
      };

      this.stage.position(newPos);
      this.stage.batchDraw();

      if (this.onZoomChangeCallback) this.onZoomChangeCallback(clampedScale);
    });

    this.stage.on('touchstart touchmove', (e) => {
      const touches = e.evt.touches;
      if (touches && touches.length === 2) {
        if (this.isDrawing) {
          this.isDrawing = false;
          if (this.currentShape) {
            this.currentShape.destroy();
            this.currentShape = null;
            this.layer.batchDraw();
          }
        }

        const p1 = { x: touches[0].clientX, y: touches[0].clientY };
        const p2 = { x: touches[1].clientX, y: touches[1].clientY };

        if (!this.lastCenter) {
          this.lastCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          this.lastDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          return;
        }

        const newCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

        const dx = newCenter.x - this.lastCenter.x;
        const dy = newCenter.y - this.lastCenter.y;

        const pointTo = {
          x: (newCenter.x - this.stage.x()) / this.stage.scaleX(),
          y: (newCenter.y - this.stage.y()) / this.stage.scaleY()
        };

        let scale = this.stage.scaleX() * (dist / this.lastDist);
        scale = Math.max(0.3, Math.min(5, scale));

        this.stage.scale({ x: scale, y: scale });

        const newPos = {
          x: newCenter.x - pointTo.x * scale + dx,
          y: newCenter.y - pointTo.y * scale + dy
        };

        this.stage.position(newPos);
        this.stage.batchDraw();

        this.lastCenter = newCenter;
        this.lastDist = dist;

        if (this.onZoomChangeCallback) this.onZoomChangeCallback(scale);
      }
    });

    this.stage.on('touchend', (e) => {
      if (!e.evt.touches || e.evt.touches.length < 2) {
        this.lastCenter = null;
        this.lastDist = 0;
      }
    });

    this.stage.on('mousedown touchstart', (e) => this.handlePointerDown(e));
    this.stage.on('mousemove touchmove', (e) => this.handlePointerMove(e));
    this.stage.on('mouseup touchend mouseleave', () => this.handlePointerUp());
  }

  handlePointerDown(e) {
    if (e.evt && e.evt.button === 2) {
      this.isRightClickPanning = true;
      this.lastPanPointer = { x: e.evt.clientX, y: e.evt.clientY };
      this.container.style.cursor = 'grabbing';
      return;
    }

    const rawPos = this.stage.getPointerPosition();
    if (!rawPos) return;

    const pos = {
      x: (rawPos.x - this.stage.x()) / this.stage.scaleX(),
      y: (rawPos.y - this.stage.y()) / this.stage.scaleY()
    };

    if (this.activeTool === 'fill') {
      this.floodFill(pos.x, pos.y, this.strokeColor);
      return;
    }

    this.isDrawing = true;

    if (this.activeTool === 'eraser') {
      this.currentShape = new Konva.Line({
        stroke: '#000000',
        strokeWidth: 24,
        globalCompositeOperation: 'destination-out',
        points: [pos.x, pos.y, pos.x, pos.y],
        tension: 0.5,
        lineCap: 'round',
        lineJoin: 'round'
      });
    } else if (this.activeTool === 'freehand') {
      this.currentShape = new Konva.Line({
        stroke: this.strokeColor,
        strokeWidth: 3,
        points: [pos.x, pos.y, pos.x, pos.y],
        tension: 0.5,
        lineCap: 'round',
        lineJoin: 'round'
      });
    } else if (this.activeTool === 'line') {
      this.currentShape = new Konva.Line({
        stroke: this.strokeColor,
        strokeWidth: 3,
        points: [pos.x, pos.y, pos.x, pos.y],
        lineCap: 'round'
      });
    } else if (this.activeTool === 'box') {
      this.currentShape = new Konva.Rect({
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        stroke: this.strokeColor,
        strokeWidth: 3
      });
    } else if (this.activeTool === 'circle') {
      this.currentShape = new Konva.Circle({
        x: pos.x,
        y: pos.y,
        radius: 0,
        stroke: this.strokeColor,
        strokeWidth: 3
      });
    }

    if (this.currentShape) {
      this.layer.add(this.currentShape);
      this.layer.batchDraw();
    }
  }

  handlePointerMove(e) {
    if (this.isRightClickPanning && e.evt) {
      const dx = e.evt.clientX - this.lastPanPointer.x;
      const dy = e.evt.clientY - this.lastPanPointer.y;

      this.stage.position({
        x: this.stage.x() + dx,
        y: this.stage.y() + dy
      });

      this.lastPanPointer = { x: e.evt.clientX, y: e.evt.clientY };
      this.stage.batchDraw();
      return;
    }

    if (!this.isDrawing || !this.currentShape) return;

    const rawPos = this.stage.getPointerPosition();
    if (!rawPos) return;

    const pos = {
      x: (rawPos.x - this.stage.x()) / this.stage.scaleX(),
      y: (rawPos.y - this.stage.y()) / this.stage.scaleY()
    };

    if (this.activeTool === 'freehand' || this.activeTool === 'eraser') {
      const newPoints = this.currentShape.points().concat([pos.x, pos.y]);
      this.currentShape.points(newPoints);
    } else if (this.activeTool === 'line') {
      const points = this.currentShape.points();
      this.currentShape.points([points[0], points[1], pos.x, pos.y]);
    } else if (this.activeTool === 'box') {
      const startX = this.currentShape.x();
      const startY = this.currentShape.y();
      this.currentShape.width(pos.x - startX);
      this.currentShape.height(pos.y - startY);
    } else if (this.activeTool === 'circle') {
      const startX = this.currentShape.x();
      const startY = this.currentShape.y();
      const radius = Math.sqrt(Math.pow(pos.x - startX, 2) + Math.pow(pos.y - startY, 2));
      this.currentShape.radius(radius);
    }

    this.layer.batchDraw();
  }

  handlePointerUp() {
    if (this.isRightClickPanning) {
      this.isRightClickPanning = false;
      this.container.style.cursor = 'crosshair';
      return;
    }

    if (!this.isDrawing) return;
    this.isDrawing = false;
    if (this.currentShape) {
      this.saveState();
      this.currentShape = null;
      this.setDirty(true);
    }
  }

  floodFill(startX, startY, fillColorHex) {
    const width = Math.floor(this.stage.width());
    const height = Math.floor(this.stage.height());
    const sX = Math.floor(startX);
    const sY = Math.floor(startY);

    if (sX < 0 || sX >= width || sY < 0 || sY >= height) return;

    const stageCanvas = this.layer.toCanvas({ pixelRatio: 1 });
    const ctx = stageCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const startPos = (sY * width + sX) * 4;
    const startR = data[startPos];
    const startG = data[startPos + 1];
    const startB = data[startPos + 2];
    const startA = data[startPos + 3];

    const fillRgb = hexToRgb(fillColorHex);
    if (!fillRgb) return;

    if (colorMatch(startR, startG, startB, startA, fillRgb.r, fillRgb.g, fillRgb.b, 255)) {
      return;
    }

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    const maskImgData = maskCtx.createImageData(width, height);
    const maskData = maskImgData.data;

    const queue = [sX, sY];
    const visited = new Uint8Array(width * height);

    while (queue.length > 0) {
      const cy = queue.pop();
      const cx = queue.pop();

      const idx = cy * width + cx;
      if (visited[idx]) continue;
      visited[idx] = 1;

      const p = idx * 4;
      if (colorMatch(data[p], data[p + 1], data[p + 2], data[p + 3], startR, startG, startB, startA)) {
        maskData[p] = fillRgb.r;
        maskData[p + 1] = fillRgb.g;
        maskData[p + 2] = fillRgb.b;
        maskData[p + 3] = 255;

        if (cx > 0) queue.push(cx - 1, cy);
        if (cx < width - 1) queue.push(cx + 1, cy);
        if (cy > 0) queue.push(cx, cy - 1);
        if (cy < height - 1) queue.push(cx, cy + 1);
      }
    }

    maskCtx.putImageData(maskImgData, 0, 0);

    const imgObj = new Image();
    imgObj.src = maskCanvas.toDataURL();
    imgObj.onload = () => {
      const konvaImg = new Konva.Image({
        x: 0,
        y: 0,
        image: imgObj,
        width: width,
        height: height
      });
      this.layer.add(konvaImg);
      konvaImg.moveToBottom();
      this.layer.batchDraw();
      this.saveState();
      this.setDirty(true);
    };
  }

  saveState() {
    this.undoStack.push(this.layer.toJSON());
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(this.layer.toJSON());
    this.undoStack.pop();
    const previousState = this.undoStack[this.undoStack.length - 1];
    
    this.layer.destroyChildren();
    if (previousState) {
      const tempLayer = Konva.Node.create(previousState);
      tempLayer.getChildren().forEach(child => this.layer.add(child.clone()));
    }
    this.layer.batchDraw();
    this.setDirty(true);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const nextState = this.redoStack.pop();
    this.undoStack.push(nextState);

    this.layer.destroyChildren();
    const tempLayer = Konva.Node.create(nextState);
    tempLayer.getChildren().forEach(child => this.layer.add(child.clone()));
    this.layer.batchDraw();
    this.setDirty(true);
  }

  renameFloor(floorLevel, newName) {
    if (newName && newName.trim()) {
      this.floorNames[floorLevel] = newName.trim();
      this.setDirty(true);
    }
  }

  reorderFloors(newOrder) {
    this.floorOrder = newOrder;
    this.setDirty(true);
  }

  switchFloor(floorLevel) {
    this.floorsData[this.activeFloor] = this.layer.toJSON();
    this.activeFloor = floorLevel;

    this.layer.destroyChildren();
    if (this.floorsData[floorLevel]) {
      const loadedLayer = Konva.Node.create(this.floorsData[floorLevel]);
      loadedLayer.getChildren().forEach(child => this.layer.add(child.clone()));
    } else {
      this.floorsData[floorLevel] = null;
    }
    this.layer.batchDraw();
  }

  addFloor() {
    const nextFloor = Object.keys(this.floorsData).length + 1;
    this.floorsData[nextFloor] = null;
    this.floorNames[nextFloor] = `Level ${nextFloor}`;
    this.floorOrder.push(nextFloor);
    this.switchFloor(nextFloor);
    this.setDirty(true);
    return nextFloor;
  }

  exportJSON(blueprintId, blueprintName) {
    this.floorsData[this.activeFloor] = this.layer.toJSON();
    
    const floorsArray = this.floorOrder.map(level => ({
      level: parseInt(level),
      name: this.floorNames[level] || `Level ${level}`,
      layerData: this.floorsData[level]
    }));

    return {
      id: blueprintId || `bp_${Date.now()}`,
      name: blueprintName || 'Untitled Stage Blocking',
      updatedAt: new Date().toISOString(),
      floors: floorsArray,
      recordedFrames: this.recordedFrames,
      notes: this.notes,
      performers: Object.keys(this.performers).map(k => ({
        id: this.performers[k].id,
        name: this.performers[k].name,
        color: this.performers[k].color
      }))
    };
  }

  loadJSON(blueprintData) {
    this.floorsData = {};
    this.floorNames = {};
    this.floorOrder = [];
    this.tokenLayer.destroyChildren();
    this.performers = {};

    if (blueprintData.floors && blueprintData.floors.length > 0) {
      blueprintData.floors.forEach(f => {
        this.floorsData[f.level] = f.layerData;
        this.floorNames[f.level] = f.name || `Level ${f.level}`;
        this.floorOrder.push(f.level);
      });
    } else {
      this.floorsData[1] = null;
      this.floorNames[1] = 'Level 1';
      this.floorOrder = [1];
    }

    if (blueprintData.performers) {
      blueprintData.performers.forEach(p => {
        this.addPerformer(p.name, p.color);
      });
    }

    this.recordedFrames = blueprintData.recordedFrames || [];
    this.notes = blueprintData.notes || [];

    this.activeFloor = this.floorOrder[0] || 1;
    this.switchFloor(this.activeFloor);
    this.undoStack = [];
    this.redoStack = [];
    this.resetZoom();
    this.setDirty(false);
  }
}