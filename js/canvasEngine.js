// js/canvasEngine.js

export class BlueprintEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.stage = null;
    this.layer = null;
    
    this.activeTool = 'freehand'; // 'freehand', 'line', 'box', 'circle'
    this.activeFloor = 1;
    this.floorsData = { 1: [] }; // { floorLevel: [konvaShapes] }
    
    this.undoStack = [];
    this.redoStack = [];
    this.isDirty = false;
    this.isDrawing = false;
    this.currentShape = null;

    this.onDirtyChangeCallback = null;
  }

  init() {
    const width = this.container.offsetWidth;
    const height = this.container.offsetHeight;

    this.stage = new Konva.Stage({
      container: this.container.id,
      width: width,
      height: height,
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    this.bindEvents();
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
        globalCompositeOperation: 'source-over',
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
    const jsonState = this.layer.toJSON();
    this.undoStack.push(jsonState);
    this.redoStack = []; // Reset redo stack on new action
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

  switchFloor(floorLevel) {
    // Save current floor shapes
    this.floorsData[this.activeFloor] = this.layer.toJSON();
    this.activeFloor = floorLevel;

    // Load target floor shapes
    this.layer.destroyChildren();
    if (this.floorsData[floorLevel]) {
      const loadedLayer = Konva.Node.create(this.floorsData[floorLevel]);
      loadedLayer.getChildren().forEach(child => this.layer.add(child.clone()));
    } else {
      this.floorsData[floorLevel] = [];
    }
    this.layer.batchDraw();
  }

  addFloor() {
    const nextFloor = Object.keys(this.floorsData).length + 1;
    this.floorsData[nextFloor] = [];
    this.switchFloor(nextFloor);
    return nextFloor;
  }

  exportJSON(blueprintId, blueprintName) {
    // Sync active floor first
    this.floorsData[this.activeFloor] = this.layer.toJSON();
    
    const floorsArray = Object.keys(this.floorsData).map(level => ({
      level: parseInt(level),
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
    blueprintData.floors.forEach(f => {
      this.floorsData[f.level] = f.layerData;
    });
    this.activeFloor = 1;
    this.switchFloor(1);
    this.undoStack = [];
    this.redoStack = [];
    this.setDirty(false);
  }
}