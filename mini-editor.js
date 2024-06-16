// Function to extract script content by ID
const getScriptContent = (scriptId) => {
  const scriptElement = document.getElementById(scriptId);
  return scriptElement ? scriptElement.innerText.trimStart() : '';
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
  constructor({ containerId, scriptId, autoRun = false, autoRefresh = true, showStopButton = true, showPlayButton = true, image = '', title = '', dependencies = [], options = {}, debounceDelay = 500, aijsProject = null }) {
    this.containerId = containerId;
    this.scriptId = scriptId;
    this.autoRun = autoRun;
    this.autoRefresh = autoRefresh;
    this.showStopButton = showStopButton;
    this.showPlayButton = showPlayButton;
    this.image = image;
    this.title = title;
    this.dependencies = dependencies;
    this.options = options;
    this.debounceDelay = debounceDelay;
    this.aijsProject = aijsProject;
    this.editorReady = false;
    this.isRunning = false;
    this.debounceTimeout = null;
    this.init();
  }

  async init() {
    this.createEditorElements();

    if (this.aijsProject) {
      this.initialCode = await loadAIJSProject(this.aijsProject.userId, this.aijsProject.projectName, this.aijsProject.fileName);
    } else {
      this.initialCode = getScriptContent(this.scriptId) || `let aspectRatio = 3 / 4;

function setup() {
  createCanvas(window.innerWidth, window.innerWidth / aspectRatio);
  flexibleCanvas(1000);
}

function draw() {
  background(220);
  rect(0, 0, 500);
}`;
    }

    const editorElement = document.getElementById(`${this.containerId}-monaco-editor`);
    const outputElement = document.getElementById(`${this.containerId}-output`);
    if (!editorElement || !outputElement) {
      console.error(`Elements with IDs ${this.containerId}-monaco-editor or ${this.containerId}-output not found.`);
      return;
    }
    await this.initializeEditor();
    this.setupSplit();
    this.updateButtonStates();
    const playButton = document.getElementById(`${this.containerId}-playButton`);
    const stopButton = document.getElementById(`${this.containerId}-stopButton`);
    if (playButton) playButton.addEventListener('click', () => this.runCode());
    if (stopButton) stopButton.addEventListener('click', () => this.stopCode());

    if (this.autoRun) {
      this.runCode();
    }

    if (this.autoRefresh) {
      this.editor.onDidChangeModelContent(() => {
        if (this.isRunning) {
          clearTimeout(this.debounceTimeout);
          this.debounceTimeout = setTimeout(() => this.runCode(), this.debounceDelay);
        }
      });
    }

    this.resizeEditor();
    window.addEventListener("resize", this.resizeEditor.bind(this));
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

    const output = document.createElement('iframe');
    output.id = `${this.containerId}-output`;
    output.className = 'output';
    output.setAttribute('sandbox', 'allow-scripts allow-same-origin');

    editorContainer.appendChild(monacoEditor);
    editorContainer.appendChild(output);

    container.appendChild(header);
    container.appendChild(editorContainer);
  }

  async initializeEditor() {
    return new Promise((resolve) => {
      require.config({
        paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.33.0/min/vs" },
      });
      require(["vs/editor/editor.main"], async () => {
        this.editor = monaco.editor.create(document.getElementById(`${this.containerId}-monaco-editor`), {
          value: this.initialCode,
          language: "javascript",
          theme: this.options.theme || "vs-dark",
          fontSize: this.options.fontSize || 14,
          lineNumbersMinChars: this.options.lineNumbersMinChars || 2,
          glyphMargin: this.options.glyphMargin !== undefined ? this.options.glyphMargin : false,
          minimap: this.options.minimap || { enabled: false },
          scrollbar: this.options.scrollbar || {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8
          }
        });

        this.editorReady = true;

        try {
          const response = await fetch('p5play.d.ts');
          const dtsText = await response.text();
          monaco.languages.typescript.javascriptDefaults.addExtraLib(
            dtsText,
            'file:///p5play.d.ts'
          );
        } catch (error) {
          console.error('Error loading p5play.d.ts:', error);
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
              ${this.editor.getValue().replace(/`/g, "\\`")}
          <\/script>
      </body>
      </html>
    `;
    const iframe = document.getElementById(`${this.containerId}-output`);
    iframe.srcdoc = html;
  }

  stopCode() {
    this.isRunning = false;
    this.updateButtonStates();
    clearTimeout(this.debounceTimeout);
    const iframe = document.getElementById(`${this.containerId}-output`);
    iframe.srcdoc = "<!DOCTYPE html><html><head><meta charset='UTF-8'></head><body></body></html>";
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
    const editorElement = document.getElementById(`${this.containerId}-monaco-editor`);
    const outputElement = document.getElementById(`${this.containerId}-output`);
    if (!editorElement || !outputElement) {
      console.error(`Elements with IDs ${this.containerId}-monaco-editor or ${this.containerId}-output not found.`);
      return;
    }

    Split([`#${this.containerId}-monaco-editor`, `#${this.containerId}-output`], {
      sizes: [50, 50],
      minSize: 100,
      gutterSize: 5,
      cursor: "col-resize",
      onDragEnd: () => {
        resizeEditor();
      },
      onDrag: () => {
        resizeEditor();
      },
    });

    resizeEditor();
  }
}

window.MiniEditor = MiniEditor;
