// content.js - Injected into Gemini/NotebookLM
console.log("Gemini Voice Input Extension Loaded");

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

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
  
  /* Dark theme support for NotebookLM */
  body.dark-theme .gemini-voice-btn, 
  .dark-theme .gemini-voice-btn {
    color: #e3e3e3;
  }

  .gemini-voice-btn:hover {
    background: rgba(68, 71, 70, 0.08);
  }
  body.dark-theme .gemini-voice-btn:hover,
  .dark-theme .gemini-voice-btn:hover {
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
    animation: gemini-wave 1s ease-in-out infinite;
  }
  
  @keyframes gemini-wave {
    0%, 100% { height: 20%; }
    50% { height: 100%; }
  }
  
  .gemini-voice-bar:nth-child(1) { animation-delay: 0.0s; }
  .gemini-voice-bar:nth-child(2) { animation-delay: 0.2s; }
  .gemini-voice-bar:nth-child(3) { animation-delay: 0.4s; }
  .gemini-voice-bar:nth-child(4) { animation-delay: 0.15s; }
  .gemini-voice-bar:nth-child(5) { animation-delay: 0.3s; }

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
    
    // Update UI to Spinner
    btn.innerHTML = `<div class="gemini-voice-spinner"></div>`;
    btn.classList.remove("recording");
  }
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
      // ContentEditable
      const success = document.execCommand('insertText', false, text);
      if (!success) {
        inputArea.textContent += text;
        inputArea.dispatchEvent(new Event('input', { bubbles: true }));
      }
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
  
  const potentialInputs = document.querySelectorAll(`
    textarea.query-box-input:not(.has-gemini-voice),
    textarea.query-box-textarea:not(.has-gemini-voice),
    textarea:not(.has-gemini-voice), 
    div[contenteditable="true"][role="textbox"]:not(.has-gemini-voice),
    input[type="text"]:not(.has-gemini-voice)
  `);

  potentialInputs.forEach(input => {
    // Filter out irrelevant inputs (hidden, very small, etc)
    if (input.offsetParent === null || input.offsetWidth < 50) return;

    // Check against placeholders to avoid injecting into completely wrong places
    // But be permissive enough for "Search" or "Start typing"
    const placeholder = input.getAttribute('placeholder') || input.getAttribute('aria-label') || "";
    
    injectButton(input);
  });
});

function injectButton(inputElement) {
  if (inputElement.classList.contains('has-gemini-voice')) return;
  
  const btn = createMicButton();

  // NOTEBOOKLM SPECIFIC PLACEMENT LOGIC

  // 1. Main Chat Bar (NotebookLM)
  // Input class: 'query-box-input'
  // Container class: 'message-container'
  // Sibling Button class: 'submit-button'
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

  // 2. Add Source Modal (NotebookLM)
  // Input class: 'query-box-textarea'
  // Container class: 'query-box' (Flex container)
  if (inputElement.classList.contains('query-box-textarea')) {
    const queryBox = inputElement.closest('.query-box');
    if (queryBox) {
      inputElement.classList.add('has-gemini-voice');
      // Append to the end of the flex container (right of the input)
      queryBox.appendChild(btn);
      return;
    }
  }

  // GENERIC PLACEMENT LOGIC (Fallback for Gemini / other parts)
  
  // Case 3: Generic Chat Box (e.g. Gemini)
  // Look for a submit/send button
  const container = inputElement.closest('div.input-area, form, footer, main') || inputElement.parentElement;
  
  if (container) {
    const sendSelectors = [
      'button.submit-button',
      '.actions-enter-button',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]', // Chinese Send
      'button[aria-label*="Submit"]',
      'button[aria-label*="提交"]', // Chinese Submit
      '.send-button',
      'button:has(svg)'
    ];

    let sendButton = null;
    for (let selector of sendSelectors) {
      // Find a button inside the container that is NOT our button
      // and NOT a menu button (often has 'more_vert')
      const candidate = container.querySelector(selector);
      if (candidate && !candidate.classList.contains('gemini-voice-btn')) {
        sendButton = candidate;
        break;
      }
    }

    if (sendButton && sendButton.parentElement) {
      // Insert next to send button
      inputElement.classList.add('has-gemini-voice');
      sendButton.parentElement.insertBefore(btn, sendButton);
      sendButton.parentElement.style.alignItems = 'center';
    } else {
      // Fallback: Append to input's direct parent
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