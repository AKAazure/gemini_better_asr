// content.js - Injected into Gemini/NotebookLM
console.log("Gemini Voice Input Extension Loaded");

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Config
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;
const STOP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>`;

function createMicButton() {
  const btn = document.createElement("button");
  btn.innerHTML = ICON_SVG;
  btn.className = "gemini-voice-btn";
  btn.title = "Speak to Type";
  btn.type = "button"; // Prevent form submission
  
  // Basic styles injection
  btn.style.cssText = `
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
  `;

  btn.addEventListener("mouseover", () => {
    btn.style.background = "rgba(68, 71, 70, 0.08)";
  });
  btn.addEventListener("mouseout", () => {
    btn.style.background = "transparent";
  });

  btn.addEventListener("click", handleMicClick);
  return btn;
}

async function handleMicClick(e) {
  e.preventDefault();
  e.stopPropagation(); // Stop event bubbling
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
        // Convert to base64 to send to background script
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = reader.result;
          sendToBackground(base64data, apiKey);
        };
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      btn.innerHTML = STOP_ICON_SVG;
      btn.style.color = "#ef4444"; // Red
      btn.classList.add("recording");
    } catch (err) {
      console.error("Mic Error:", err);
      alert("Could not access microphone. Please ensure permission is granted.");
    }
  } else {
    // Stop Recording
    if (mediaRecorder) mediaRecorder.stop();
    isRecording = false;
    btn.innerHTML = `<div class="spinner"></div>`;
    
    // Inject simple spinner style temporarily
    if (!document.getElementById('temp-spinner-style')) {
      const spinnerStyle = document.createElement('style');
      spinnerStyle.id = 'temp-spinner-style';
      spinnerStyle.textContent = `
        .spinner { border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; width: 16px; height: 16px; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `;
      document.head.appendChild(spinnerStyle);
    }
  }
}

function sendToBackground(base64Audio, apiKey) {
  chrome.runtime.sendMessage(
    { action: "transcribe", audioData: base64Audio, apiKey: apiKey },
    (response) => {
      const btn = document.querySelector(".gemini-voice-btn");
      if (btn) {
        btn.innerHTML = ICON_SVG;
        btn.style.color = "#444746";
      }

      if (response && response.success) {
        insertText(response.text);
      } else {
        console.error("Transcription failed:", response ? response.error : "Unknown error");
        alert("Transcription failed. Please check your API key.");
      }
    }
  );
}

function insertText(text) {
  const inputArea = document.querySelector('div[contenteditable="true"][role="textbox"]') || 
                    document.querySelector('textarea');
  
  if (inputArea) {
    inputArea.focus();
    
    // NotebookLM and modern React apps usually use Textarea
    if (inputArea.tagName === 'TEXTAREA') {
      const start = inputArea.selectionStart;
      const end = inputArea.selectionEnd;
      const originalValue = inputArea.value;
      const newValue = originalValue.slice(0, start) + text + originalValue.slice(end);
      
      // Robust React input update
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputArea, newValue);
      } else {
        inputArea.value = newValue;
      }
      
      // Dispatch multiple events to ensure React picks it up
      inputArea.dispatchEvent(new Event('input', { bubbles: true }));
      inputArea.dispatchEvent(new Event('change', { bubbles: true }));
    } 
    // Gemini often uses ContentEditable div
    else {
      // Try deprecated but reliable execCommand first
      const success = document.execCommand('insertText', false, text);
      
      // Fallback if execCommand fails
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

// Observer to inject button when input area appears
const observer = new MutationObserver((mutations) => {
  // Broad selector to find input areas in both Gemini (div) and NotebookLM (textarea)
  const inputArea = document.querySelector('div[contenteditable="true"][role="textbox"]') || 
                    document.querySelector('textarea');
  
  // If input exists but our button doesn't
  if (inputArea && !document.querySelector(".gemini-voice-btn")) {
    
    const btn = createMicButton();
    
    // Strategy 1: Look for the Send button to place next to (cleanest UI)
    // Common labels for Send button in Google apps
    const sendSelectors = [
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]', // Chinese
      'button[aria-label*="Submit"]',
      '.send-button',
      'button:has(svg)' // Generic button with icon as last resort near input
    ];

    let sendButton = null;
    
    // Look for send button within the same container or nearby context
    // We traverse up to find a common container, then query down
    const container = inputArea.closest('div.input-area, form, footer, main') || document.body;
    
    for (let selector of sendSelectors) {
      // Find a button inside the container that is NOT our button
      const candidate = container.querySelector(selector);
      if (candidate && !candidate.classList.contains('gemini-voice-btn')) {
        sendButton = candidate;
        break;
      }
    }

    if (sendButton && sendButton.parentElement) {
       // Insert before the send button
       sendButton.parentElement.insertBefore(btn, sendButton);
       // Ensure parent aligns items centered
       sendButton.parentElement.style.alignItems = 'center';
    } 
    // Strategy 2: Append to the parent of the input area (NotebookLM often)
    else if (inputArea.parentElement) {
       const parent = inputArea.parentElement;
       parent.appendChild(btn);
       
       // Force flex layout if not present to show side-by-side
       const style = window.getComputedStyle(parent);
       if (style.display !== 'flex' && style.display !== 'grid') {
         parent.style.display = 'flex';
         parent.style.alignItems = 'center';
       }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });