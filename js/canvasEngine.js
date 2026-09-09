// js/canvasEngine.js

export class BlueprintEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.stage = null;
    this.layer = null;
    
    this.activeTool = 'freehand'; // 'freehand', 'line', 'box', 'circle'
    this.activeFloor = 1;
    this.floorsData = { 1: null };
    this.floorNames = { 1: 'Level 1' };

    this.undoStack = [];
    this.redoStack = [];
    this.isDirty = false;
    this.isDrawing = false;
    this.currentShape = null;

    this.onDirtyChangeCallback = null;
  }

  init() {
    const width = this.container.offsetWidth || window.innerWidth - 150;
    const height = this.container.offsetHeight || window.innerHeight - 96;

    this.stage = new Konva.Stage({
      container: this.container.id,
      width: width,
      height: height,
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    this.bindEvents();

    window.addEventListener('resize', () => {
      if (this.stage && this.container) {
        this.stage.width(this.container.offsetWidth);
        this.stage.height(this.container.offsetHeight);
      }
    });
  }

  setDirty(dirty) {
    this.isDirty = dirty;
    if (this.onDirtyChangeCallback) {
      this.onDirtyChangeCallback(dirty);
    }
  }

  setTool(tool) {
    this.activeTool = tool;
  }

  bindEvents() {
    this.stage.on('mousedown touchstart', (e) => this.handlePointerDown(e));
    this.stage.on('mousemove touchmove', (e) => this.handlePointerMove(e));
    this.stage.on('mouseup touchend', () => this.handlePointerUp());
  }

  handlePointerDown(e) {
    this.isDrawing = true;
    const pos = this.stage.getPointerPosition();

    if (this.activeTool === 'freehand') {
      this.currentShape = new Konva.Line({
        stroke: '#1C1C1C',
        strokeWidth: 3,
        points: [pos.x, pos.y, pos.x, pos.y],
        tension: 0.5,
        lineCap: 'round',
        lineJoin: 'round'
      });
    } else if (this.activeTool === 'line') {
      this.currentShape = new Konva.Line({
        stroke: '#1C1C1C',
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
        stroke: '#1C1C1C',
        strokeWidth: 3
      });
    } else if (this.activeTool === 'circle') {
      this.currentShape = new Konva.Circle({
        x: pos.x,
        y: pos.y,
        radius: 0,
        stroke: '#1C1C1C',
        strokeWidth: 3
      });
    }

    if (this.currentShape) {
      this.layer.add(this.currentShape);
      this.layer.batchDraw();
    }
  }

  handlePointerMove(e) {
    if (!this.isDrawing || !this.currentShape) return;
    const pos = this.stage.getPointerPosition();

    if (this.activeTool === 'freehand') {
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
    if (!this.isDrawing) return;
    this.isDrawing = false;
    if (this.currentShape) {
      this.saveState();
      this.currentShape = null;
      this.setDirty(true);
    }
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
    this.switchFloor(nextFloor);
    this.setDirty(true);
    return nextFloor;
  }

  exportJSON(blueprintId, blueprintName) {
    this.floorsData[this.activeFloor] = this.layer.toJSON();
    
    const floorsArray = Object.keys(this.floorsData).map(level => ({
      level: parseInt(level),
      name: this.floorNames[level] || `Level ${level}`,
      layerData: this.floorsData[level]
    }));

    return {
      id: blueprintId || `bp_${Date.now()}`,
      name: blueprintName || 'Untitled Blueprint',
      updatedAt: new Date().toISOString(),
      floors: floorsArray
    };
  }

  loadJSON(blueprintData) {
    this.floorsData = {};
    this.floorNames = {};
    if (blueprintData.floors && blueprintData.floors.length > 0) {
      blueprintData.floors.forEach(f => {
        this.floorsData[f.level] = f.layerData;
        this.floorNames[f.level] = f.name || `Level ${f.level}`;
      });
    } else {
      this.floorsData[1] = null;
      this.floorNames[1] = 'Level 1';
    }
    this.activeFloor = 1;
    this.switchFloor(1);
    this.undoStack = [];
    this.redoStack = [];
    this.setDirty(false);
  }
}