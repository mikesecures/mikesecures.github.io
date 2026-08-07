// Ensure page refreshes always start at the top (Home)
if (history.scrollRestoration) {
  history.scrollRestoration = 'manual';
}
// Check if the page is being reloaded, rather than navigated to via a hash link
const isReload = performance.getEntriesByType("navigation").some(nav => nav.type === "reload") || 
                 (window.performance && window.performance.navigation && window.performance.navigation.type === 1);

if (isReload) {
  window.scrollTo(0, 0);
  if (window.location.hash) {
    history.replaceState(null, null, window.location.pathname);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  /* ==========================================================================
     1. State Management
     ========================================================================== */
  const state = {

    activeColorTheme: 'cyan', // cyan, magenta, purple, gcp, aws, bbva
    colors: {
      cyan: 'rgba(0, 242, 254, ',
      magenta: 'rgba(243, 85, 218, ',
      purple: 'rgba(142, 45, 226, ',
      grey: 'rgba(142, 142, 147, ',
      // GCP Colors
      gcpBlue: 'rgba(66, 133, 244, ',
      gcpRed: 'rgba(234, 67, 53, ',
      gcpYellow: 'rgba(251, 188, 5, ',
      gcpGreen: 'rgba(52, 168, 83, ',
      // AWS Colors
      awsOrange: 'rgba(255, 153, 0, ',
      // BBVA Colors
      bbvaBlue: 'rgba(0, 115, 194, '
    }
  };

  /* ==========================================================================
     2. Canvas Starfield Physics Engine
     ========================================================================== */
  const canvas = document.getElementById('particle-canvas');
  
  let scene, camera, renderer;
  let particleGroup, snowParticles;
  let shaderMaterial;
  
  // Interaction variables
  let isDragging = false;
  let isIgnited = false; // Tracks toggle state for the color transition
  let clickTransition = 0.0; // Lerps from 0 to 1 for smooth transitions
  
  let previousMousePosition = { x: 0, y: 0 };
  let targetRotation = { x: 0, y: 0 };
  let currentRotation = { x: 0, y: 0 };
  let autoRotateSpeed = 0.002;
  
  // Hover interaction variables
  let isHovering = false;
  let hoverTransition = 0.0;
  let mouseNDC = new THREE.Vector2(-10, -10);

  function initWebGL() {
      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x000000, 0.0015); // Black fog to match background

      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1500);
      camera.position.z = 180; // Pulled back slightly for better scale

      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      
      // Helper function to create circular texture for particles
      function createCircleTexture() {
          const canvasPat = document.createElement('canvas');
          canvasPat.width = 32;
          canvasPat.height = 32;
          const context = canvasPat.getContext('2d');
          context.beginPath();
          context.arc(16, 16, 16, 0, Math.PI * 2);
          context.fillStyle = '#ffffff';
          context.fill();
          return new THREE.CanvasTexture(canvasPat);
      }

      // 1. Generate Environment (Marine Snow)
      const snowGeo = new THREE.BufferGeometry();
      const snowPos = [];
      for(let i=0; i<3000; i++) {
          snowPos.push((Math.random() - 0.5) * 800);
          snowPos.push((Math.random() - 0.5) * 800);
          snowPos.push((Math.random() - 0.5) * 800);
      }
      snowGeo.setAttribute('position', new THREE.Float32BufferAttribute(snowPos, 3));
      const snowMat = new THREE.PointsMaterial({
          color: 0x44aaff,
          size: 2.0,
          map: createCircleTexture(),
          transparent: true,
          opacity: 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false
      });
      snowParticles = new THREE.Points(snowGeo, snowMat);
      scene.add(snowParticles);

      // 2. Generate Octopus Particles
      particleGroup = new THREE.Group();
      particleGroup.scale.set(1.3, 1.3, 1.3); // Scale the octopus up slightly
      scene.add(particleGroup);
      
      const particlesGeometry = createOctopusGeometry();
      
      const vertexShader = `
          uniform float uTime;
          uniform float uClickState; // 0.0 = Default, 1.0 = Fully clicked/orange
          uniform float uHoverState;
          uniform vec2 uMouse;
          
          attribute float aPhase;
          attribute vec3 aColor;
          attribute vec3 aColorOrange;
          attribute float aSize;
          attribute vec2 aTentacleData; // x: isTentacle flag, y: length factor (0 to 1)
          
          varying vec3 vColor;
          varying float vPhase;
          varying float vHoverGlow;
          
          void main() {
              vPhase = aPhase;
              
              // Smoothly mix between the cool blue palette and hot orange palette
              vColor = mix(aColor, aColorOrange, uClickState);
              
              vec3 pos = position;
              float isTentacle = aTentacleData.x;
              float t = aTentacleData.y;
              
              // -- SWIMMING ANIMATION PHYSICS --
              float swimSpeed = 1.8; // Constant, smooth swimming speed
              
              if (isTentacle > 0.5) {
                  // Tentacles ripple and expand outward
                  vec2 dir = normalize(pos.xz + vec2(0.001)); 
                  
                  // Undulating wave traveling down the tentacle
                  float wave = sin(uTime * swimSpeed - t * 6.0);
                  
                  // Push out and up/down
                  float expansion = wave * (t * 12.0); 
                  pos.xz += dir * expansion;
                  pos.y += cos(uTime * swimSpeed - t * 6.0) * (t * 8.0);
              } else {
                  // Head (Mantle) breathing logic. Pulses in opposite phase to tentacles.
                  float breath = sin(uTime * swimSpeed + 3.1415) * 0.06;
                  pos.x += pos.x * breath;
                  pos.z += pos.z * breath;
                  pos.y += pos.y * breath * 0.5;
              }
              
              // Global vertical bobbing for the entire creature
              pos.y += sin(uTime * swimSpeed * 0.5) * 8.0;
              
              // Minor individual particle jitter
              float pulse = sin(uTime * 1.5 + aPhase) * 0.15;
              pos += pos * pulse * 0.05;
              
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              
              // Interactive screen-space hover effect
              vec2 screenPos = gl_Position.xy / gl_Position.w;
              float distToMouse = distance(screenPos, uMouse);
              vHoverGlow = smoothstep(0.5, 0.0, distToMouse) * uHoverState;
              
              // Scale point size based on depth and give it a massive glow boost on click or hover
              float glowBonus = uClickState * 0.8 + vHoverGlow * 2.5;
              gl_PointSize = aSize * (1.0 + pulse * 0.5 + glowBonus) * (150.0 / -mvPosition.z);
          }
      `;

      const fragmentShader = `
          uniform float uTime;
          varying vec3 vColor;
          varying float vPhase;
          varying float vHoverGlow;
          
          void main() {
              vec2 center = vec2(0.5, 0.5);
              float dist = distance(gl_PointCoord, center);
              
              if (dist > 0.5) discard;
              
              // Soft, glowing center
              float intensity = pow((0.5 - dist) * 2.0, 1.5);
              intensity += vHoverGlow * 1.5 * pow((0.5 - dist) * 2.0, 2.0); // Make the core extra bright on hover
              
              // Shimmering color
              float colorShift = sin(uTime + vPhase) * 0.1;
              
              // Inject a bioluminescent cyan/white into the hovered area
              vec3 hoverHighlight = vec3(0.3, 0.8, 1.0) * vHoverGlow * 0.8;
              vec3 finalColor = vColor + vec3(colorShift) + hoverHighlight;
              
              gl_FragColor = vec4(finalColor * intensity, 1.0);
          }
      `;

      shaderMaterial = new THREE.ShaderMaterial({
          uniforms: {
              uTime: { value: 0.0 },
              uClickState: { value: 0.0 },
              uHoverState: { value: 0.0 },
              uMouse: { value: new THREE.Vector2(-10, -10) }
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
      });

      const particles = new THREE.Points(particlesGeometry, shaderMaterial);
      particleGroup.add(particles);

      // Event Listeners on window for smooth screen-space dragging
      window.addEventListener('resize', onWindowResize, false);
      window.addEventListener('mousedown', onPointerDown, false);
      window.addEventListener('mousemove', onPointerMove, false);
      window.addEventListener('mouseup', onPointerUp, false);
      window.addEventListener('mouseleave', onPointerLeave, false);
      window.addEventListener('mouseenter', onPointerEnter, false);
      
      window.addEventListener('touchstart', onPointerDown, { passive: false });
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp, false);
  }

  function createOctopusGeometry() {
      const positions = [];
      const colorsBlue = [];
      const colorsOrange = []; // New array for transition
      const tentacleData = []; // New array for animation logic
      const phases = [];
      const sizes = [];

      // Primary Palette
      const colorCyan = new THREE.Color(0x00ffff);
      const colorBlue = new THREE.Color(0x0044ff);
      const colorPurple = new THREE.Color(0xa200ff);
      
      // Interaction Palette
      const colorGold = new THREE.Color(0xffd700);
      const colorOrangeRed = new THREE.Color(0xff4500);
      const colorDarkRed = new THREE.Color(0x8b0000);

      // Utility to plot a point and its attributes
      function addParticle(x, y, z, isTentacle, tValue) {
          positions.push(x, y, z);

          // --- Base Blue Color Mapping ---
          const mappedY = Math.max(0, Math.min(1, (y + 35) / 70));
          const pColorBlue = new THREE.Color();
          if (mappedY > 0.5) {
              pColorBlue.lerpColors(colorBlue, colorCyan, (mappedY - 0.5) * 2);
          } else {
              pColorBlue.lerpColors(colorPurple, colorBlue, mappedY * 2);
          }
          colorsBlue.push(pColorBlue.r, pColorBlue.g, pColorBlue.b);

          // --- Ignition Orange Color Mapping ---
          const pColorOrg = new THREE.Color();
          if (isTentacle) {
              // Tentacles go from OrangeRed at base to DarkRed at tips
              pColorOrg.lerpColors(colorOrangeRed, colorDarkRed, tValue);
          } else {
              // Head goes from OrangeRed at neck to bright Gold at top
              pColorOrg.lerpColors(colorOrangeRed, colorGold, tValue);
          }
          colorsOrange.push(pColorOrg.r, pColorOrg.g, pColorOrg.b);
          
          // Store structural metadata for vertex shader animations
          tentacleData.push(isTentacle ? 1.0 : 0.0, tValue);

          phases.push(Math.random() * Math.PI * 2);
          sizes.push(Math.random() * 1.5 + 0.5);
      }

      // --- 1. Generate Head ---
      const HEAD_PARTICLES = 45000;
      for (let i = 0; i < HEAD_PARTICLES; i++) {
          const r = 0.6 + Math.random() * 0.4; 
          const phi = Math.acos(2 * Math.random() - 1);
          const theta = Math.random() * Math.PI * 2;

          const yOffset = 18;
          const a = 14, b = 18, c = 14;

          let x = a * r * Math.sin(phi) * Math.cos(theta);
          let y = b * r * Math.cos(phi) + yOffset;
          let z = c * r * Math.sin(phi) * Math.sin(theta);

          if (y < yOffset) {
               const taper = 0.5 + 0.5 * ((y - (yOffset - b)) / b);
               x *= taper;
               z *= taper;
          }
          
          const tHead = Math.max(0, Math.min(1, (y - (yOffset - b)) / (b * 2)));
          addParticle(x, y, z, false, tHead);
      }

      // --- 2. Generate Tentacles ---
      const numTentacles = 8;
      const particlesPerTentacle = 8000;

      for (let i = 0; i < numTentacles; i++) {
          const angle = (i / numTentacles) * Math.PI * 2;

          for (let j = 0; j < particlesPerTentacle; j++) {
              const t = Math.random();
              const distance = t * 45;
              const wiggle = Math.sin(t * Math.PI * 5) * 2.5; 
              
              let spineX = Math.cos(angle) * (6 + distance) + Math.sin(angle) * wiggle;
              let spineZ = Math.sin(angle) * (6 + distance) - Math.cos(angle) * wiggle;
              let spineY = -t * 35 + Math.sin(t * Math.PI) * 12; 
              
              if (t > 0.65) {
                  const curl = (t - 0.65) * 2.8;
                  spineY += Math.sin(curl * Math.PI) * 18;
                  spineX -= Math.cos(angle) * curl * 12;
                  spineZ -= Math.sin(angle) * curl * 12;
              }

              const radius = 4 * Math.pow((1 - t), 1.5) + 0.3;
              const u = Math.random(), v = Math.random();
              const thetaOffset = u * 2.0 * Math.PI;
              const phiOffset = Math.acos(2.0 * v - 1.0);
              const rOffset = Math.cbrt(Math.random()) * radius;
              
              addParticle(
                  spineX + rOffset * Math.sin(phiOffset) * Math.cos(thetaOffset), 
                  spineY + rOffset * Math.cos(phiOffset), 
                  spineZ + rOffset * Math.sin(phiOffset) * Math.sin(thetaOffset),
                  true, 
                  t
              );
          }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colorsBlue, 3));
      geometry.setAttribute('aColorOrange', new THREE.Float32BufferAttribute(colorsOrange, 3));
      geometry.setAttribute('aTentacleData', new THREE.Float32BufferAttribute(tentacleData, 2));
      geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
      geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));

      geometry.computeBoundingBox();
      const offset = new THREE.Vector3();
      geometry.boundingBox.getCenter(offset);
      geometry.translate(-offset.x, -offset.y, -offset.z);

      return geometry;
  }

  function getPointerPos(e) {
      if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
  }

  function onPointerDown(e) {
      if (e.target.closest('button, a, .physics-widget, .experience-card, #terminal-window')) return;
      
      isIgnited = !isIgnited; // Toggle color state
      
      // Prevent octopus rotation dragging on mobile touch so the user can scroll the page
      if (e.touches) return; 

      isDragging = true;
      const pos = getPointerPos(e);
      previousMousePosition = { x: pos.x, y: pos.y };
      document.body.style.cursor = 'grabbing';
  }

  function onPointerMove(e) {
      isHovering = true;
      const pos = getPointerPos(e);
      
      // Update Mouse NDC for shader hover effect
      mouseNDC.x = (pos.x / window.innerWidth) * 2 - 1;
      mouseNDC.y = -(pos.y / window.innerHeight) * 2 + 1;

      if (isDragging) {
          if (e.cancelable) e.preventDefault(); 
          const deltaMove = { x: pos.x - previousMousePosition.x, y: pos.y - previousMousePosition.y };

          targetRotation.y += deltaMove.x * 0.008;
          targetRotation.x += deltaMove.y * 0.008;
          targetRotation.x = Math.max(-Math.PI/3, Math.min(Math.PI/3, targetRotation.x));

          previousMousePosition = { x: pos.x, y: pos.y };
      }
  }

  function onPointerUp(e) {
      isDragging = false;
      document.body.style.cursor = 'default';
  }

  function onPointerEnter(e) {
      isHovering = true;
  }

  function onPointerLeave(e) {
      isHovering = false;
      isDragging = false;
      document.body.style.cursor = 'default';
      mouseNDC.set(-10, -10); // Move hover effect off-screen
  }

  function onWindowResize() {
      if (camera && renderer) {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
      }
  }

  const clock = new THREE.Clock();

  function animateWebGL() {
      requestAnimationFrame(animateWebGL);
      const elapsedTime = clock.getElapsedTime();
      
      // 1. Process Color transitions (dynamic triggers based on clicks or brand-theme)
      const forceIgnite = (state.activeColorTheme !== 'cyan' && state.activeColorTheme !== 'magenta' && state.activeColorTheme !== 'purple');
      const targetIgnition = forceIgnite ? 1.0 : (isIgnited ? 1.0 : 0.0);
      
      if (clickTransition < targetIgnition) {
          clickTransition += (targetIgnition - clickTransition) * 0.015;
      } else {
          clickTransition += (targetIgnition - clickTransition) * 0.01;
      }

      // Process Hover Transition
      if (isHovering) {
          hoverTransition += (1.0 - hoverTransition) * 0.05;
      } else {
          hoverTransition += (0.0 - hoverTransition) * 0.05;
      }

      // 2. Update Shaders
      if (shaderMaterial) {
          shaderMaterial.uniforms.uTime.value = elapsedTime;
          shaderMaterial.uniforms.uClickState.value = clickTransition;
          shaderMaterial.uniforms.uHoverState.value = hoverTransition;
          shaderMaterial.uniforms.uMouse.value = mouseNDC;
      }

      // 3. Manage Environment Animation
      if (snowParticles) {
          snowParticles.rotation.y = elapsedTime * 0.02;
          snowParticles.position.y = ((elapsedTime * 4.0) % 800) - 400; // Slow upward drift
      }

      // 4. Manage Rotation & 3D Spatial Movement
      if (!isDragging) {
          targetRotation.y += autoRotateSpeed;
      }

      currentRotation.x += (targetRotation.x - currentRotation.x) * 0.1;
      currentRotation.y += (targetRotation.y - currentRotation.y) * 0.1;

      if (particleGroup) {
          particleGroup.rotation.x = currentRotation.x;
          particleGroup.rotation.y = currentRotation.y;
          
          particleGroup.position.x = Math.sin(elapsedTime * 0.25) * 45;
          particleGroup.position.y = Math.cos(elapsedTime * 0.18) * 35;
          particleGroup.position.z = Math.sin(elapsedTime * 0.3) * 50;
          
          particleGroup.rotation.z = Math.sin(elapsedTime * 0.2) * 0.2;
          particleGroup.rotation.x += Math.sin(elapsedTime * 0.35) * 0.15;
      }

      renderer.render(scene, camera);
  }

  // Run Canvas Setup after fonts are fully loaded to prevent race conditions
  document.fonts.ready.then(() => {
    initWebGL();
    animateWebGL();
  });


  /* ==========================================================================
     5. 3D Card Tilt & Brand Particle Interaction
     ========================================================================= */
  const cards = document.querySelectorAll('.experience-card, .image-interactive-wrapper');

  cards.forEach(card => {
    const company = card.dataset.company;

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left; // relative positions
      const y = e.clientY - rect.top;

      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);

      // Tilt angles
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = -(y - centerY) / centerY * 8;
      const rotateY = (x - centerX) / centerX * 8;

      card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });

    card.addEventListener('mouseenter', () => {
      // Trigger brand animation on canvas particles!
      if (company === 'gcp') {
        state.activeColorTheme = 'gcp';
      } else if (company === 'aws') {
        state.activeColorTheme = 'aws';
      } else if (company === 'bbva') {
        state.activeColorTheme = 'bbva';
      }
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';

      // Reset color theme back to default
      state.activeColorTheme = 'cyan';
    });
  });

  /* ==========================================================================
     6. Draggable Terminal Console Window
     ========================================================================== */
  const terminalWin = document.getElementById('terminal-window');
  const terminalHeader = document.getElementById('terminal-drag-handle');
  const terminalInput = document.getElementById('terminal-input');
  const terminalBody = document.getElementById('terminal-body');

  let consoleDragX = 0, consoleDragY = 0;

  terminalHeader.addEventListener('mousedown', (e) => {
    if (e.target.closest('.terminal-dots')) return; // ignore buttons clicks

    e.preventDefault();
    consoleDragX = e.clientX - terminalWin.offsetLeft;
    consoleDragY = e.clientY - terminalWin.offsetTop;

    function onConsoleMove(moveEvent) {
      let x = moveEvent.clientX - consoleDragX;
      let y = moveEvent.clientY - consoleDragY;

      // Stay on screen limits
      x = Math.max(0, Math.min(x, window.innerWidth - terminalWin.offsetWidth));
      y = Math.max(0, Math.min(y, window.innerHeight - terminalWin.offsetHeight));

      terminalWin.style.left = `${x}px`;
      terminalWin.style.top = `${y}px`;
      terminalWin.style.position = 'fixed';
    }

    function onConsoleRelease() {
      window.removeEventListener('mousemove', onConsoleMove);
      window.removeEventListener('mouseup', onConsoleRelease);
    }

    window.addEventListener('mousemove', onConsoleMove);
    window.addEventListener('mouseup', onConsoleRelease);
  });

  // Touch drag support for terminal
  terminalHeader.addEventListener('touchstart', (e) => {
    if (e.target.closest('.terminal-dots')) return;

    const touch = e.touches[0];
    consoleDragX = touch.clientX - terminalWin.offsetLeft;
    consoleDragY = touch.clientY - terminalWin.offsetTop;

    function onConsoleTouchMove(moveEvent) {
      const moveTouch = moveEvent.touches[0];
      let x = moveTouch.clientX - consoleDragX;
      let y = moveTouch.clientY - consoleDragY;

      x = Math.max(0, Math.min(x, window.innerWidth - terminalWin.offsetWidth));
      y = Math.max(0, Math.min(y, window.innerHeight - terminalWin.offsetHeight));

      terminalWin.style.left = `${x}px`;
      terminalWin.style.top = `${y}px`;
      terminalWin.style.position = 'fixed';
    }

    function onConsoleTouchRelease() {
      window.removeEventListener('touchmove', onConsoleTouchMove);
      window.removeEventListener('touchend', onConsoleTouchRelease);
    }

    window.addEventListener('touchmove', onConsoleTouchMove);
    window.addEventListener('touchend', onConsoleTouchRelease);
  });

  // Command History tracking
  const commandHistory = [];
  let historyIndex = -1;

  terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cmd = terminalInput.value.trim().toLowerCase();
      terminalInput.value = '';

      if (cmd) {
        commandHistory.push(cmd);
        historyIndex = commandHistory.length;
        writeToTerminal(`mmoss@secops-terminal:~$ ${cmd}`, 'user-line');
        executeCommand(cmd);
      }
    } else if (e.key === 'ArrowUp') {
      if (historyIndex > 0) {
        historyIndex--;
        terminalInput.value = commandHistory[historyIndex];
      }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        terminalInput.value = commandHistory[historyIndex];
      } else {
        historyIndex = commandHistory.length;
        terminalInput.value = '';
      }
      e.preventDefault();
    }
  });

  terminalBody.addEventListener('click', () => {
    terminalInput.focus();
  });

  function writeToTerminal(text, className = '') {
    const line = document.createElement('div');
    line.className = `terminal-line ${className}`;
    line.innerHTML = text;
    terminalBody.insertBefore(line, terminalBody.lastElementChild);
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }

  function executeCommand(commandStr) {
    const args = commandStr.split(' ');
    const cmd = args[0];

    switch (cmd) {
      case 'help':
        writeToTerminal('Available commands:', 'system-msg');
        writeToTerminal('&nbsp;&nbsp;help&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Show commands menu.');
        writeToTerminal('&nbsp;&nbsp;about&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Display Michael Moss\'s background.');
        writeToTerminal('&nbsp;&nbsp;experience&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Print professional experience log.');
        writeToTerminal('&nbsp;&nbsp;certs&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- List cloud security certifications.');

        writeToTerminal('&nbsp;&nbsp;color [color-name]&nbsp;&nbsp;- Change themes: cyan, magenta, purple, reset.');
        writeToTerminal('&nbsp;&nbsp;clear&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Clear screen.');
        break;

      case 'about':
        writeToTerminal('Michael Moss - Cloud Security Consultant and Application Security Engineer.', 'success-msg');
        writeToTerminal('Specializing in securing large-scale cloud operations, IAM governance, threat modeling, and building resilient infrastructures at Google (GCP) and formerly AWS.');
        writeToTerminal('Alumnus of the University of Alabama.');
        break;

      case 'experience':
        writeToTerminal('Retrieved professional log:', 'system-msg');
        writeToTerminal('&nbsp;&nbsp;• <b>Google Cloud (GCP)</b> - Cloud Security Consultant [Jan 2026 - Present]');
        writeToTerminal('&nbsp;&nbsp;&nbsp;&nbsp;Hardening infrastructures, IAM controls, SCC configurations, and SecOps automation.');
        writeToTerminal('&nbsp;&nbsp;• <b>Amazon Web Services (AWS)</b> - Security Transformation Consultant [Jan 2020 - Jan 2026]');
        writeToTerminal('&nbsp;&nbsp;&nbsp;&nbsp;Led security transformation engagements and technical programs securing customer workloads.');
        writeToTerminal('&nbsp;&nbsp;• <b>BBVA</b> - Application Security Analyst [Jun 2018 - Jan 2020]');
        writeToTerminal('&nbsp;&nbsp;&nbsp;&nbsp;Conducted software security assessments, DAST/SAST reviews, and threat modeling.');
        break;

      case 'certs':
        writeToTerminal('Cloud Certifications (Verified via Credly):', 'system-msg');
        writeToTerminal('&nbsp;&nbsp;• <b>Google Cloud</b> - Professional Cloud Security Engineer');
        writeToTerminal('&nbsp;&nbsp;• <b>AWS</b> - Solutions Architect Professional');
        writeToTerminal('&nbsp;&nbsp;• <b>AWS</b> - Security Specialty');
        writeToTerminal('&nbsp;&nbsp;• <b>AWS</b> - AI Practitioner');
        writeToTerminal('&nbsp;&nbsp;• <b>AWS</b> - Solutions Architect Associate [Inactive]');
        writeToTerminal('&nbsp;&nbsp;• <b>AWS</b> - SysOps Administrator Associate [Inactive]');
        writeToTerminal('&nbsp;&nbsp;• <b>AWS</b> - Developer Associate [Inactive]');
        break;

      case 'color':
        const theme = args[1];
        if (['cyan', 'magenta', 'purple'].includes(theme)) {
          state.activeColorTheme = theme;
          writeToTerminal(`Color theme changed to: ${theme}`, 'success-msg');
        } else if (theme === 'reset') {
          state.activeColorTheme = 'cyan';
          writeToTerminal('Color theme reset to default (cyan).', 'success-msg');
        } else {
          writeToTerminal('Usage: color [cyan/magenta/purple/reset]', 'error-msg');
        }
        break;

      case 'clear':
        const lines = Array.from(terminalBody.querySelectorAll('.terminal-line'));
        lines.forEach(l => l.remove());
        break;

      default:
        writeToTerminal(`bash: command not found: ${cmd}. Type 'help' for instructions.`, 'error-msg');
    }
  }

  /* ==========================================================================
     7. Dynamic Entrance Animations with GSAP
     ========================================================================== */
  // Reveal hero heading word by word
  gsap.from('.hero-title .word', {
    duration: 1.2,
    y: 80,
    opacity: 0,
    stagger: 0.25,
    ease: 'power4.out',
    delay: 0.2
  });

  gsap.from('.badge-container, .hero-subtitle, .hero-cta', {
    duration: 1.0,
    y: 30,
    opacity: 0,
    stagger: 0.15,
    ease: 'power3.out',
    delay: 0.6
  });

  gsap.from('.scroll-indicator', {
    duration: 0.8,
    opacity: 0,
    y: -10,
    ease: 'power2.out',
    delay: 1.5
  });

  // Slide header down
  gsap.from('header', {
    duration: 0.8,
    y: -70,
    opacity: 0,
    ease: 'power2.out'
  });

  // Scroll nav activation
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('section');

  window.addEventListener('scroll', () => {
    let currentSectionId = 'hero';

    sections.forEach(sec => {
      const secTop = sec.offsetTop - 120;
      if (window.scrollY >= secTop) {
        currentSectionId = sec.getAttribute('id');
      }
    });

    navItems.forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('href') === `#${currentSectionId}`) {
        item.classList.add('active');
      }
    });
  });



  // ScrollTrigger - Parallax background shield rotation & scale
  gsap.to('.gcp-bg-graphic', {
    scale: 1.05,
    rotation: 5,
    scrollTrigger: {
      trigger: '#gcp-experience',
      start: 'top 85%',
      end: 'bottom 15%',
      scrub: 1 // Damped scrub for smooth ease feedback
    }
  });

  // 1. Fade out the octopus/canvas when scrolling to the GCP section
  gsap.to('#particle-canvas', {
    opacity: 0,
    scrollTrigger: {
      trigger: '#gcp-experience',
      start: 'top 60%',
      end: 'top 10%',
      scrub: true
    }
  });

  // 2. Fade the octopus back in for Past Deployments
  gsap.to('#particle-canvas', {
    opacity: 1,
    immediateRender: false,
    scrollTrigger: {
      trigger: '#experience',
      start: 'top 80%',
      end: 'top 30%',
      scrub: true
    }
  });

  // 3. Fade the octopus out again for the Certifications section
  gsap.to('#particle-canvas', {
    opacity: 0,
    immediateRender: false,
    scrollTrigger: {
      trigger: '#certifications',
      start: 'top 80%',
      end: 'top 30%',
      scrub: true
    }
  });

  // 4. Fade the octopus back in for the Terminal section
  gsap.to('#particle-canvas', {
    opacity: 1,
    immediateRender: false,
    scrollTrigger: {
      trigger: '#console-section',
      start: 'top 80%',
      end: 'top 30%',
      scrub: true
    }
  });
});

// Fix for hash navigation breaking with GSAP ScrollTrigger
window.addEventListener('load', () => {
  if (window.location.hash) {
    setTimeout(() => {
      const target = document.querySelector(window.location.hash);
      if (target) {
        window.scrollTo({
          top: target.offsetTop - 80, // offset for header
          behavior: 'smooth'
        });
      }
    }, 100);
  }
});

// Smooth scroll for internal nav links
document.querySelectorAll('a.nav-item[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 80, // offset for header
                behavior: 'smooth'
            });
        }
    });
});
