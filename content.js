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
  .gemini-voice-btn:hover {
    background: rgba(68, 71, 70, 0.08);
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
  // 1. Main Chat Inputs (Textarea or ContentEditable)
  // 2. Modal Inputs (Input[type=text])
  
  const potentialInputs = document.querySelectorAll(`
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
    
    // NotebookLM Modal "Add Source" check
    // The specific modal in the screenshot is "在网络中搜索新来源" or "Web"
    // We want to be careful not to inject into EVERY text input, but search/chat inputs are safe.
    
    injectButton(input);
  });
});

function injectButton(inputElement) {
  if (inputElement.classList.contains('has-gemini-voice')) return;
  
  // Mark as processed
  inputElement.classList.add('has-gemini-voice');

  const btn = createMicButton();

  // PLACEMENT LOGIC
  
  // Case 1: NotebookLM Search Modal (usually input inside a wrapper)
  // We often want to put it at the end of the wrapper
  if (inputElement.tagName === 'INPUT') {
    // Usually these are inside a div with other icons
    const wrapper = inputElement.parentElement;
    if (wrapper) {
      wrapper.appendChild(btn);
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      return;
    }
  }

  // Case 2: Chat Box (NotebookLM bottom bar / Gemini)
  // Look for a submit/send button
  const container = inputElement.closest('div.input-area, form, footer, main') || inputElement.parentElement;
  
  if (container) {
    const sendSelectors = [
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'button[aria-label*="Submit"]',
      '.send-button',
      'button:has(svg)'
    ];

    let sendButton = null;
    for (let selector of sendSelectors) {
      const candidate = container.querySelector(selector);
      if (candidate && !candidate.classList.contains('gemini-voice-btn')) {
        sendButton = candidate;
        break;
      }
    }

    if (sendButton && sendButton.parentElement) {
      // Insert next to send button
      sendButton.parentElement.insertBefore(btn, sendButton);
      sendButton.parentElement.style.alignItems = 'center';
    } else {
      // Fallback: Append to input's direct parent
      if (inputElement.parentElement) {
         inputElement.parentElement.appendChild(btn);
         inputElement.parentElement.style.display = 'flex';
         inputElement.parentElement.style.alignItems = 'center';
      }
    }
  }
}

// Start observing
observer.observe(document.body, { childList: true, subtree: true });