# Block Aid — Software Requirement Specification & Project Tracker

**Project Name:** Block Aid  
**Target Platform:** Web Application (HTML5 Canvas + JavaScript), hosted via GitHub Pages (iPad / Desktop compatible)  
**Goal:** An interactive tool to draw stage blueprints, record character movement/blocking, view playback with stationary pauses and note prompts, and seamlessly switch floor levels.

---

## 1. Core Feature Requirements

* **Blueprint Creator & Multi-Level System**
  * Prompt for existing theater blueprints or create a new blueprint on launch.
  * Drawing canvas with line tools to create stage and backstage layouts.
  * Support for multi-story/multi-level stage layouts.
  * Fixed, centered label reading **"AUDIENCE"** at the bottom of the stage area.
  * Left sidebar indicating floor levels for quick selection and visual feedback.

* **Actor & Movement Recording**
  * Top navigation ribbon with actions: `Add Person`, `Record`, `Play`, `Pause`, `Add Note`.
  * Actor represented as a colored circle placed on the workspace.
  * Automatic recording pause when the actor stops moving.
  * In-recording note prompts that display under the top ribbon, pausing playback until the screen is tapped.

* **Playback Engine**
  * Replay path with a semi-transparent path line (`alpha: 0.3`) showing historical movement[cite: 1].
  * Replicate idle periods as stationary pauses during playback[cite: 1].
  * Seamless floor switching during playback when an actor transitions between levels[cite: 1].

---

## 2. Technical Stack & Data Models

### Tech Stack
* **Frontend:** Vanilla HTML5, CSS3, Modern JavaScript (ES6+).
* **Rendering:** Dual-Layer HTML5 Canvas API (Layer 1: Stage vectors, Layer 2: Actor & paths).
* **Input API:** Pointer Events (`pointerdown`, `pointermove`, `pointerup`) to unify mouse, finger touch, and Apple Pencil interactions.
* **Hosting:** GitHub Pages.

### Data Schemas

#### Blueprint Data Model
```javascript
const blueprintSchema = {
  id: "blueprint_101",
  name: "Main Stage",
  floors: [
    {
      id: "floor_1",
      name: "Stage Level",
      lines: [
        { x1: 50, y1: 50, x2: 500, y2: 50 },
        { x1: 500, y1: 50, x2: 500, y2: 400 }
      ]
    },
    {
      id: "floor_2",
      name: "Catwalk / Balcony",
      lines: []
    }
  ]
};

const actorPathSchema = {
  actorId: "actor_red",
  color: "#FF3B30",
  pathKeyframes: [
    {
      x: 100,
      y: 200,
      floorId: "floor_1",
      timestamp: 0,
      hasNote: false,
      noteText: ""
    },
    {
      x: 250,
      y: 200,
      floorId: "floor_1",
      timestamp: 1500,
      hasNote: true,
      noteText: "Pick up chair"
    }
  ]
};

Project Implementation Roadmap & Checklist

    [ ] Phase 1: Project Setup & Unified Input Layer

        [ ] Initialize GitHub repository and enable GitHub Pages deployment.

        [ ] Configure touch-action: none and text selection CSS overrides.

        [ ] Implement PointerEvent coordinate mapper for desktop and iPad compatibility.

    [ ] Phase 2: Blueprint Creator & Level Manager

        [ ] Build modal overlay for selecting or creating a stage blueprint[cite: 1].

        [ ] Implement line-drawing canvas for stage/backstage layouts[cite: 1].

        [ ] Render permanent centered "AUDIENCE" text anchor at the bottom[cite: 1].

        [ ] Implement multi-floor UI switcher sidebar[cite: 1].

    [ ] Phase 3: Drag-and-Drop Actor & Idle Path Recorder

        [ ] Add colored circle actor creation logic[cite: 1].

        [ ] Track coordinates, timestamps, and active floorId on drag.

        [ ] Implement stationary detection algorithm (auto-pause recording when stationary)[cite: 1].

    [ ] Phase 4: Playback, Notes Prompt, & Auto-Floor Switching

        [ ] Build requestAnimationFrame playback engine simulating keyframe delays[cite: 1].

        [ ] Draw semi-transparent path line (ctx.globalAlpha = 0.3) behind actor during replay[cite: 1].

        [ ] Implement note insertion banner and click-to-resume trigger[cite: 1].

        [ ] Implement automatic floor UI switching when recorded keyframes cross levels[cite: 1].