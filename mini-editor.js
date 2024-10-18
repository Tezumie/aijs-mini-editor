// Function to extract script content by ID
const getScriptContent = (scriptId) => {
  const scriptElement = document.getElementById(scriptId);
  return scriptElement ? scriptElement.innerText.trimStart() : scriptId.trimStart();
};

// Function to generate script tags for dependencies
const generateScriptTags = (dependencies) => {
  if (!dependencies || dependencies.length === 0) {
    return '<script src="https://q5js.org/q5.js"></script>';
  }
  return dependencies.map(dep => `<script src="${dep}"></script>`).join('\n');
};

// Function to load AIJS project code
const loadAIJSProject = async (userId, projectName, fileName) => {
  const url = `https://firebasestorage.googleapis.com/v0/b/aijs-code-editor.appspot.com/o/${encodeURIComponent(userId)}%2FProjects%2F${encodeURIComponent(projectName)}%2F${encodeURIComponent(fileName)}?alt=media`;
  const response = await fetch(url);
  if (response.ok) {
    return response.text();
  } else {
    console.error(`Failed to load AIJS project: ${response.statusText}`);
    return '';
  }
};

class MiniEditor {
  constructor({
    containerId,
    scriptId,
    autoRun = false,
    autoRefresh = true,
    showStopButton = true,
    showPlayButton = true,
    image = '',
    title = '',
    dependencies = [],
    dtsDependencies = [],
    options = {},
    debounceDelay = 500,
    aijsProject = null,
    Q5InstancedMode = false,
    sizes = [50, 50],
    canvasWidth = null,
  }) {
    this.containerId = containerId;
    this.scriptId = scriptId;
    this.autoRun = autoRun;
    this.autoRefresh = autoRefresh;
    this.showStopButton = showStopButton;
    this.showPlayButton = showPlayButton;
    this.image = image;
    this.title = title;
    this.dependencies = dependencies;
    this.dtsDependencies = dtsDependencies;
    this.options = options;
    this.debounceDelay = debounceDelay;
    this.aijsProject = aijsProject;
    this.editorReady = false;
    this.isRunning = false;
    this.debounceTimeout = null;
    this.Q5InstancedMode = Q5InstancedMode;
    this.q5Instance = null;
    this.sizes = sizes;
    this.canvasWidth = canvasWidth;
    this.init();
  }

  async init() {
    this.createEditorElements();

    if (this.aijsProject) {
      this.initialCode = await loadAIJSProject(
        this.aijsProject.userId,
        this.aijsProject.projectName,
        this.aijsProject.fileName
      );
    } else {
      this.initialCode = getScriptContent(this.scriptId) || `
        function setup() {
          createCanvas(400, 400);
        }
        function draw() {
          background(220);
          rect(150, 150, 100, 100);
        }
      `;
    }

    try {
      await this.loadScript('https://q5js.org/q5.js');
    } catch (error) {
      console.error('Failed to load Q5.js:', error);
      return;
    }

    await this.initializeEditor();
    this.setupSplit();
    this.updateButtonStates();

    const playButton = document.getElementById(`${this.containerId}-playButton`);
    const stopButton = document.getElementById(`${this.containerId}-stopButton`);

    if (playButton) playButton.addEventListener('click', () => this.runCode());
    if (stopButton) stopButton.addEventListener('click', () => this.stopCode());

    if (this.autoRun) this.runCode();

    if (this.autoRefresh) {
      this.editor.onDidChangeModelContent(() => {
        if (this.isRunning) {
          clearTimeout(this.debounceTimeout);
          this.debounceTimeout = setTimeout(() => this.runCode(), this.debounceDelay);
        }
      });
    }

    this.resizeEditor();
    window.addEventListener('resize', this.resizeEditor.bind(this));
  }


  createEditorElements() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Container with ID ${this.containerId} not found.`);
      return;
    }

    const header = document.createElement('div');
    header.id = `${this.containerId}-header`;
    header.className = 'header';

    const titleContainer = document.createElement('div');
    titleContainer.className = 'title-container';

    if (this.image) {
      const img = document.createElement('img');
      img.src = this.image;
      img.className = 'header-image';
      titleContainer.appendChild(img);
    }

    if (this.title) {
      const titleText = document.createElement('span');
      titleText.className = 'header-title';
      titleText.textContent = this.title;
      titleContainer.appendChild(titleText);
    }

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';

    if (this.showPlayButton) {
      const playButton = document.createElement('button');
      playButton.id = `${this.containerId}-playButton`;
      playButton.className = 'button playButton';
      const playIcon = document.createElement('div');
      playIcon.className = 'play-icon';
      playButton.appendChild(playIcon);
      buttonContainer.appendChild(playButton);
    }
    if (this.showStopButton) {
      const stopButton = document.createElement('button');
      stopButton.id = `${this.containerId}-stopButton`;
      stopButton.className = 'button stopButton';
      const stopIcon = document.createElement('div');
      stopIcon.className = 'stop-icon';
      stopButton.appendChild(stopIcon);
      buttonContainer.appendChild(stopButton);
    }

    header.appendChild(titleContainer);
    header.appendChild(buttonContainer);

    const editorContainer = document.createElement('div');
    editorContainer.id = `${this.containerId}-editor`;
    editorContainer.className = 'mini-editor-container';

    const monacoEditor = document.createElement('div');
    monacoEditor.id = `${this.containerId}-monaco-editor`;
    monacoEditor.className = 'monaco-editor';

    const output = document.createElement('div');
    output.id = `${this.containerId}-output`;
    output.className = 'output';

    editorContainer.appendChild(monacoEditor);
    editorContainer.appendChild(output);

    container.appendChild(header);
    container.appendChild(editorContainer);
  }

  async initializeEditor() {
    return new Promise((resolve) => {
      require.config({
        paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.33.0/min/vs' },
      });

      require(['vs/editor/editor.main'], async () => {
        this.editor = monaco.editor.create(
          document.getElementById(`${this.containerId}-monaco-editor`),
          {
            value: this.initialCode,
            language: 'javascript',
            automaticLayout: this.options.automaticLayout ?? false,
            wordWrap: this.options.wordWrap ?? 'off',
            wrappingIndent: this.options.wrappingIndent || 'none',
            theme: this.options.theme || 'vs-dark',
            fontSize: this.options.fontSize || 14,
            lineNumbersMinChars: this.options.lineNumbersMinChars || 2,
            glyphMargin: this.options.glyphMargin ?? false,
            minimap: this.options.minimap || { enabled: false },
            scrollbar: this.options.scrollbar || {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }
        );

        this.editorReady = true;

        // Load optional .d.ts dependencies
        for (const dtsFile of this.dtsDependencies) {
          try {
            const response = await fetch(dtsFile);
            if (response.ok) {
              const dtsText = await response.text();
              monaco.languages.typescript.javascriptDefaults.addExtraLib(dtsText, dtsFile);
            } else {
              console.warn(`Failed to load ${dtsFile}: ${response.statusText}`);
            }
          } catch (error) {
            console.error(`Error loading ${dtsFile}:`, error);
          }
        }

        resolve();
      });
    });
  }


  runCode() {
    if (!this.editorReady) {
      console.error("Editor is not ready yet");
      return;
    }
    this.isRunning = true;
    this.updateButtonStates();

    if (this.Q5InstancedMode) {
      if (typeof Q5 === 'undefined') {
        this.loadScript('https://q5js.org/q5.js', () => {
          this.runQ5InstanceCode();
        });
      } else {
        this.runQ5InstanceCode();
      }
    } else {
      const scripts = generateScriptTags(this.dependencies);
      const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          ${scripts}
          <style>
            html, body {
                margin: 0;
                padding: 0;
                height: 100vh;
                overflow: hidden;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            canvas {
                display: block;
                max-width: 100%;
                max-height: 100vh;
                width: auto;
                height: auto;
                object-fit: contain;
            }
          </style>
      </head>
      <body>
          <div id="output"></div>
          <script>
              ${this.editor.getValue()}
          <\/script>
      </body>
      </html>
    `;
      const outputElement = document.getElementById(`${this.containerId}-output`);
      outputElement.innerHTML = '';

      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.style.width = '100%';
      iframe.style.height = '100%';

      outputElement.appendChild(iframe);

      iframe.srcdoc = html;
    }
  }
  loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script ${src}`));
      document.head.appendChild(script);
    });
  }

  runQ5InstanceCode() {
    const outputElement = document.getElementById(`${this.containerId}-output`);
    outputElement.innerHTML = '';

    const q5FunctionNames = [
      'preload', 'setup', 'draw', 'doubleClicked',
      'keyPressed', 'keyReleased', 'keyTyped',
      'mouseMoved', 'mouseDragged', 'mousePressed',
      'mouseReleased', 'mouseClicked', 'touchStarted',
      'touchMoved', 'touchEnded', 'windowResized'
    ];

    let q = new Q5('instance', outputElement);

    try {
      let userCode = this.editor.getValue();

      for (let f of q5FunctionNames) {
        const regex = new RegExp(`function\\s+${f}\\s*\\(`, 'g');
        userCode = userCode.replace(regex, `q.${f} = function(`);
      }

      const func = new Function('q', `
          with (q) {
              ${userCode}
          }
      `);

      func(q);
    } catch (e) {
      console.error('Error executing user code:', e);
    }

    this.q5Instance = q;
  }

  stopCode() {
    this.isRunning = false;
    this.updateButtonStates();
    clearTimeout(this.debounceTimeout);

    if (this.Q5InstancedMode) {
      // Stop the Q5 instance
      if (this.q5Instance) {
        if (typeof this.q5Instance.remove === 'function') {
          this.q5Instance.remove();
        }
        this.q5Instance = null;
      }
      const outputElement = document.getElementById(`${this.containerId}-output`);
      outputElement.innerHTML = '';
    } else {
      // Original code
      const outputElement = document.getElementById(`${this.containerId}-output`);
      outputElement.innerHTML = '';
    }
  }

  updateButtonStates() {
    const playButton = document.getElementById(`${this.containerId}-playButton`);
    const stopButton = document.getElementById(`${this.containerId}-stopButton`);
    if (playButton) playButton.classList.toggle("active", this.isRunning);
    if (stopButton) stopButton.classList.toggle("active", !this.isRunning);
  }

  resizeEditor() {
    const header = document.getElementById(`${this.containerId}-header`);
    const editorContainer = document.getElementById(`${this.containerId}-editor`);
    if (header && editorContainer) {
      const headerHeight = header.offsetHeight;
      editorContainer.style.height = `calc(100% - ${headerHeight}px)`;
      if (this.editor) {
        this.editor.layout();
      }
    }
  }
  setupSplit() {
    const resizeEditor = this.resizeEditor.bind(this);
    let splitInstance;

    const applySplit = () => {
      const editorElement = document.getElementById(`${this.containerId}-monaco-editor`);
      const outputElement = document.getElementById(`${this.containerId}-output`);
      const containerElement = document.getElementById(this.containerId);

      if (!editorElement || !outputElement || !containerElement) {
        console.warn(`Elements with IDs ${this.containerId}-monaco-editor, ${this.containerId}-output, or ${this.containerId} not found.`);
        if (splitInstance) {
          splitInstance.destroy();
          splitInstance = null;
        }
        return;
      }

      const isNarrow = window.innerWidth <= 600;

      // Destroy any existing Split.js instance
      if (splitInstance) {
        splitInstance.destroy();
      }

      // Reset styles to default before applying new split
      editorElement.style.width = '';
      editorElement.style.flex = '';
      outputElement.style.width = '';
      outputElement.style.flex = '';

      let sizes = this.sizes;
      let minSizes = [50, 50]; // Minimum sizes in pixels

      if (this.canvasWidth !== null) {
        // Parse canvasWidth to a number
        const parsedCanvasWidth = typeof this.canvasWidth === 'string' && this.canvasWidth.endsWith('px')
          ? parseInt(this.canvasWidth, 10)
          : this.canvasWidth;

        // Get container width or height based on layout direction
        const containerSize = isNarrow ? containerElement.clientHeight : containerElement.clientWidth;

        // Calculate sizes as percentages
        const outputSizePercent = (parsedCanvasWidth / containerSize) * 100;
        const editorSizePercent = 100 - outputSizePercent;
        sizes = [editorSizePercent, outputSizePercent];

        // Set minimum sizes to prevent canvas from shrinking below its width
        minSizes = [50, 50];
      }

      // Initialize Split.js with calculated sizes
      splitInstance = Split(
        [`#${this.containerId}-monaco-editor`, `#${this.containerId}-output`],
        {
          sizes: sizes,
          minSize: minSizes,
          gutterSize: 5,
          cursor: isNarrow ? 'row-resize' : 'col-resize',
          direction: isNarrow ? 'vertical' : 'horizontal',
          onDragEnd: resizeEditor,
          onDrag: resizeEditor,
        }
      );

      resizeEditor();
    };

    applySplit();
    window.removeEventListener('resize', applySplit);
    window.addEventListener('resize', applySplit);
  }



}

window.MiniEditor = MiniEditor;
