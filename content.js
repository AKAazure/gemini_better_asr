// content.js - Injected into Gemini/NotebookLM
console.log("Gemini Voice Input Extension Loaded");

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioContext = null;
let analyser = null;
let animationId = null;

// 1. Inject CSS for Waveform Animation and Button Styles
const style = document.createElement('style');
style.textContent = `
  .gemini-voice-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    min-width: 40px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    background: transparent;
    color: #444746;
    transition: background 0.2s;
    margin: 0 4px;
    z-index: 999;
    flex-shrink: 0;
  }
  
  /* Dark theme support for NotebookLM and Gemini */
  body.dark-theme .gemini-voice-btn, 
  .dark-theme .gemini-voice-btn,
  [data-theme="dark"] .gemini-voice-btn {
    color: #e3e3e3;
  }

  .gemini-voice-btn:hover {
    background: rgba(68, 71, 70, 0.08);
  }
  body.dark-theme .gemini-voice-btn:hover,
  .dark-theme .gemini-voice-btn:hover,
  [data-theme="dark"] .gemini-voice-btn:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .gemini-voice-btn.recording {
    background: rgba(239, 68, 68, 0.1);
  }
  
  /* Waveform Animation */
  .gemini-voice-waveform {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 16px;
    width: 24px;
  }
  
  .gemini-voice-bar {
    width: 3px;
    background-color: #ef4444;
    border-radius: 2px;
    height: 10%; /* Default idle height */
    transition: height 0.05s ease;
    will-change: height;
  }

  /* Spinner for processing */
  .gemini-voice-spinner {
    border: 2px solid #f3f3f3;
    border-top: 2px solid #3498db;
    border-radius: 50%;
    width: 16px;
    height: 16px;
    animation: gemini-spin 1s linear infinite;
  }
  @keyframes gemini-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
`;
document.head.appendChild(style);

// SVG Icons
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;
const WAVEFORM_HTML = `
  <div class="gemini-voice-waveform">
    <div class="gemini-voice-bar"></div>
    <div class="gemini-voice-bar"></div>
    <div class="gemini-voice-bar"></div>
    <div class="gemini-voice-bar"></div>
    <div class="gemini-voice-bar"></div>
  </div>
`;

function createMicButton() {
  const btn = document.createElement("button");
  btn.innerHTML = ICON_SVG;
  btn.className = "gemini-voice-btn";
  btn.title = "Speak to Type";
  btn.type = "button";
  btn.addEventListener("click", handleMicClick);
  return btn;
}

async function handleMicClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const btn = e.currentTarget;

  if (!isRecording) {
    // Start Recording
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        alert("Please set your OpenAI API Key in the extension options first.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup Audio Context for visualization
      await setupVisualizer(stream);

      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = reader.result;
          sendToBackground(base64data, apiKey, btn);
        };
        // Stop all tracks to release mic
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      
      // Update UI to Waveform
      btn.innerHTML = WAVEFORM_HTML;
      btn.classList.add("recording");
      
    } catch (err) {
      console.error("Mic Error:", err);
      alert("Could not access microphone. Please ensure permission is granted.");
    }
  } else {
    // Stop Recording
    if (mediaRecorder) mediaRecorder.stop();
    isRecording = false;
    
    // Stop Visualizer immediately
    stopVisualizer();
    
    // Update UI to Spinner
    btn.innerHTML = `<div class="gemini-voice-spinner"></div>`;
    btn.classList.remove("recording");
  }
}

async function setupVisualizer(stream) {
  try {
    audioContext = new AudioContext();
    
    // Resume context if suspended (common browser policy)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    
    // Increase fftSize for better resolution, we will downsample to 5 bars
    analyser.fftSize = 256; 
    analyser.smoothingTimeConstant = 0.6; // Slightly smoother
    source.connect(analyser);
    
    visualize();
  } catch (e) {
    console.error("Audio Context Setup Error:", e);
  }
}

function visualize() {
  if (!isRecording || !analyser) return;
  
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);
  
  // Calculate average volume roughly 0-255
  // We use a range of bins that represent speech frequencies
  // fftSize 256 -> bin width ~172Hz (assuming 44.1kHz)
  // Voice fundamental freq ~85-255Hz. Harmonics up to 3-4kHz.
  // Bins 1 to 20 cover approx 170Hz to 3400Hz.
  let sum = 0;
  const startBin = 1;
  const endBin = 20;
  for(let i = startBin; i <= endBin; i++) {
    sum += dataArray[i];
  }
  const averageVolume = sum / (endBin - startBin + 1);

  const bars = document.querySelectorAll('.gemini-voice-bar');
  if (bars.length === 5) {
      // Noise gate: Threshold to ignore background hum
      if (averageVolume < 5) {
        bars.forEach(bar => bar.style.height = '10%');
      } else {
        // Distribute bars across the frequency spectrum
        // We pick 5 representative points
        const indices = [2, 4, 8, 12, 16]; // Low to Mid frequencies
        
        bars.forEach((bar, i) => {
            const val = dataArray[indices[i]] || 0;
            
            // Dynamic scaling:
            // Input 0-255. 
            // We want output 10% - 100%.
            
            // Boost low signals slightly so they are visible
            let percent = 10 + (val / 255) * 120;
            
            // Clamp
            if (percent > 100) percent = 100;
            if (percent < 10) percent = 10;
            
            bar.style.height = `${percent}%`;
        });
      }
  }
  
  animationId = requestAnimationFrame(visualize);
}

function stopVisualizer() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (audioContext) {
    audioContext.close().catch(console.error);
    audioContext = null;
  }
  analyser = null;
}

function sendToBackground(base64Audio, apiKey, btnElement) {
  chrome.runtime.sendMessage(
    { action: "transcribe", audioData: base64Audio, apiKey: apiKey },
    (response) => {
      // Reset UI
      if (btnElement) {
        btnElement.innerHTML = ICON_SVG;
      }

      if (response && response.success) {
        insertText(response.text, btnElement);
      } else {
        console.error("Transcription failed:", response ? response.error : "Unknown error");
        alert("Transcription failed. Please check your API key.");
      }
    }
  );
}

function insertText(text, btnElement) {
  // Try to find the input relative to the button first (best for multiple inputs)
  let inputArea = null;
  
  if (btnElement) {
    // Check siblings
    const parent = btnElement.parentElement;
    if (parent) {
      inputArea = parent.querySelector('textarea, input[type="text"], div[contenteditable="true"]');
      if (!inputArea) {
        // Go up one level and check
        const grandParent = parent.parentElement;
        if (grandParent) {
          inputArea = grandParent.querySelector('textarea, input[type="text"], div[contenteditable="true"]');
        }
      }
    }
  }

  // Fallback to generic active query
  if (!inputArea) {
    inputArea = document.querySelector('div[contenteditable="true"][role="textbox"]') || 
                document.querySelector('textarea') ||
                document.querySelector('input[type="text"]');
  }
  
  if (inputArea) {
    inputArea.focus();
    
    // Dispatch input events to simulate user typing (needed for frameworks like React/Angular)
    if (inputArea.tagName === 'TEXTAREA' || inputArea.tagName === 'INPUT') {
      const start = inputArea.selectionStart || 0;
      const end = inputArea.selectionEnd || 0;
      const originalValue = inputArea.value || '';
      const newValue = originalValue.slice(0, start) + text + originalValue.slice(end);
      
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window[`HTML${inputArea.tagName === 'TEXTAREA' ? 'TextArea' : 'Input'}Element`].prototype, 
        "value"
      ).set;
      
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputArea, newValue);
      } else {
        inputArea.value = newValue;
      }
      
      inputArea.dispatchEvent(new Event('input', { bubbles: true }));
      inputArea.dispatchEvent(new Event('change', { bubbles: true }));
    } 
    else {
      // ContentEditable (Gemini uses this extensively)
      // Use execCommand for broader compatibility, or textContent fallback
      document.execCommand('insertText', false, text);
      
      // Ensure React/Framework listeners catch the change
      inputArea.dispatchEvent(new Event('input', { bubbles: true }));
      inputArea.dispatchEvent(new Event('keydown', { bubbles: true }));
      inputArea.dispatchEvent(new Event('keyup', { bubbles: true }));
    }
  }
}

function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['openai_api_key'], (result) => {
      resolve(result.openai_api_key);
    });
  });
}

// Robust Observer to handle various NotebookLM and Gemini layouts
const observer = new MutationObserver((mutations) => {
  // 1. NotebookLM Main Chat Input
  // 2. NotebookLM Modal Input
  // 3. Generic inputs
  // 4. Gemini Specifics
  
  const potentialInputs = document.querySelectorAll(`
    textarea.query-box-input:not(.has-gemini-voice),
    textarea.query-box-textarea:not(.has-gemini-voice),
    textarea:not(.has-gemini-voice), 
    div[contenteditable="true"][role="textbox"]:not(.has-gemini-voice),
    input[type="text"]:not(.has-gemini-voice),
    rich-textarea > div > p:not(.has-gemini-voice)
  `);

  potentialInputs.forEach(input => {
    // Filter out irrelevant inputs (hidden, very small, etc)
    if (input.offsetParent === null || input.offsetWidth < 50) return;

    // Filter out inputs that are likely search bars in headers (optional, but good heuristic)
    if (input.getAttribute('aria-label')?.includes('Search')) return;
    
    injectButton(input);
  });
});

function injectButton(inputElement) {
  if (inputElement.classList.contains('has-gemini-voice')) return;
  
  // Identify if we are in Gemini
  const isGemini = window.location.hostname.includes('gemini.google.com');

  const btn = createMicButton();

  // --- GEMINI SPECIFIC LOGIC ---
  if (isGemini) {
    // Gemini Input Structure: 
    // <div class="input-area"> ... <rich-textarea> ... <div class="input-buttons"> <button aria-label="Send message">
    
    // Strategy: Look for the 'Send' button wrapper
    // Usually finding the closest common ancestor for input and send button
    
    // 1. Try to find the Send button directly
    const inputArea = inputElement.closest('.input-area') || inputElement.closest('div[class*="input-area"]');
    
    // Selectors for Gemini's Send Button
    const geminiSendSelectors = [
      'button[aria-label="Send message"]',
      'button[aria-label="Send"]',
      'div[role="button"][aria-label="Send message"]',
      '.send-button'
    ];
    
    let sendBtn = null;
    let container = inputArea || inputElement.parentElement.parentElement; // Fallback to grand-parent
    
    if (container) {
      for (let sel of geminiSendSelectors) {
        const found = container.querySelector(sel);
        if (found) {
          sendBtn = found;
          break;
        }
      }
    }

    if (sendBtn) {
       inputElement.classList.add('has-gemini-voice');
       // Insert before the Send button
       // Often Send button is in a wrapper, we want to be inside that wrapper if possible
       const sendWrapper = sendBtn.parentElement;
       sendWrapper.insertBefore(btn, sendBtn);
       sendWrapper.style.display = 'flex'; // Ensure alignment
       sendWrapper.style.alignItems = 'center';
       return;
    }
  }

  // --- NOTEBOOKLM SPECIFIC LOGIC ---
  if (inputElement.classList.contains('query-box-input')) {
    const container = inputElement.closest('.message-container');
    if (container) {
      const submitBtn = container.querySelector('.submit-button');
      if (submitBtn) {
        inputElement.classList.add('has-gemini-voice');
        container.insertBefore(btn, submitBtn);
        return;
      }
    }
  }

  if (inputElement.classList.contains('query-box-textarea')) {
    const queryBox = inputElement.closest('.query-box');
    if (queryBox) {
      inputElement.classList.add('has-gemini-voice');
      queryBox.appendChild(btn);
      return;
    }
  }

  // --- GENERIC FALLBACK ---
  // Look for a submit/send button near the input
  const container = inputElement.closest('form') || inputElement.closest('div[class*="input"]') || inputElement.parentElement;
  
  if (container) {
    const sendSelectors = [
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'div[role="button"][aria-label*="Send"]',
      'button:has(svg)', // Buttons with icons are likely controls
      '.send-button'
    ];

    let sendButton = null;
    for (let selector of sendSelectors) {
      const candidate = container.querySelector(selector);
      if (candidate && !candidate.classList.contains('gemini-voice-btn') && candidate !== inputElement) {
        sendButton = candidate;
        break;
      }
    }

    if (sendButton && sendButton.parentElement) {
      inputElement.classList.add('has-gemini-voice');
      sendButton.parentElement.insertBefore(btn, sendButton);
      sendButton.parentElement.style.alignItems = 'center';
    } else {
      // Last resort: Append to input's parent
      if (inputElement.parentElement) {
         inputElement.classList.add('has-gemini-voice');
         inputElement.parentElement.appendChild(btn);
         inputElement.parentElement.style.display = 'flex';
         inputElement.parentElement.style.alignItems = 'center';
      }
    }
  }
}

// Start observing
observer.observe(document.body, { childList: true, subtree: true });