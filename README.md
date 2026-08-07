# Portfolio

A modern, highly interactive personal portfolio website styled with a premium dark theme. This project utilizes custom Canvas-based particle simulations, draggable elements, 3D card tilt reflections, and a custom developer command line console.

## 🚀 Key Features

1. **Interactive Starfield Canvas**:
   - Particle connections form complex visual nets that shift as you move the cursor.
   - Click the page to trigger an **impulse wave** that repels stars outward.

2. **Skills Sandbox**:
   - Grab, drag, and throw skill tags around the canvas area.
   - Thrown elements maintain velocity and inertia, bouncing elastically off sandbox boundaries.

3. **3D Tilt Project Cards**:
   - Cards tilt on a 3D axis based on cursor position relative to the card.
   - Radial glow follow-lights track the cursor.

4. **Terminal Interface**:
   - Draggable terminal window modeled after macOS console.
   - Supports key commands to alter color themes or list skills.
   - Available commands:
     - `help`: list all terminal functions.
     - `about`: display Michael Moss's background.
     - `experience`: fetch professional experience details.
     - `color [cyan/magenta/purple/reset]`: shift neon canvas color themes.
     - `clear`: clear console history.

## 🛠️ Tech Stack
- **Structure**: Semantic HTML5
- **Styling**: Modern CSS3 (Variables, Keyframe Animations, Perspective Transforms)
- **Logic & Physics**: Vanilla JavaScript ES6
- **Animations**: GSAP (GreenSock) via CDN

## 💻 Local Development

To spin up a local development server, run:

```bash
# Using Python 3
python3 -m http.server 8000
```

Once running, navigate to `http://localhost:8000` in your browser.
