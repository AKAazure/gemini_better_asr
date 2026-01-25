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
  
  // Basic styles injection
  btn.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    background: transparent;
    color: #444746;
    transition: background 0.2s;
    margin-right: 8px;
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
      alert("Could not access microphone.");
    }
  } else {
    // Stop Recording
    if (mediaRecorder) mediaRecorder.stop();
    isRecording = false;
    btn.innerHTML = `<div class="spinner"></div>`;
    
    // Inject simple spinner style temporarily
    const spinnerStyle = document.createElement('style');
    spinnerStyle.id = 'temp-spinner-style';
    spinnerStyle.textContent = `
      .spinner { border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; width: 16px; height: 16px; animation: spin 1s linear infinite; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `;
    document.head.appendChild(spinnerStyle);
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
        const style = document.getElementById('temp-spinner-style');
        if (style) style.remove();
      }

      if (response && response.success) {
        insertText(response.text);
      } else {
        console.error("Transcription failed:", response ? response.error : "Unknown error");
        alert("Transcription failed. Check console for details.");
      }
    }
  );
}

function insertText(text) {
  // Gemini usually uses a contenteditable div with role="textbox"
  const inputArea = document.querySelector('div[contenteditable="true"][role="textbox"]') || 
                    document.querySelector('textarea');
  
  if (inputArea) {
    inputArea.focus();
    
    // Method 1: execCommand (deprecated but reliable for contenteditable)
    const success = document.execCommand('insertText', false, text);
    
    // Method 2: Fallback for newer React environments if execCommand fails
    if (!success) {
      if (inputArea.tagName === 'TEXTAREA') {
        const start = inputArea.selectionStart;
        const end = inputArea.selectionEnd;
        const val = inputArea.value;
        inputArea.value = val.slice(0, start) + text + val.slice(end);
        inputArea.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        inputArea.textContent += text; // Crude fallback
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
  const inputArea = document.querySelector('div[contenteditable="true"][role="textbox"]');
  // Usually the input is wrapped in a container. We want to append to the toolbar or near the input.
  // Gemini structure changes, but typically looking for the parent container of the input or the send button container.
  
  if (inputArea && !document.querySelector(".gemini-voice-btn")) {
    const container = inputArea.parentElement;
    if (container) {
      // Find the best place to insert. Usually after the input or before the send button.
      // We'll prepend it to the container for visibility or append to a toolbar if found.
      const btn = createMicButton();
      
      // Try to find the send button wrapper to place it next to
      const sendButton = document.querySelector('button[aria-label*="Send"]');
      if (sendButton && sendButton.parentElement) {
        sendButton.parentElement.insertBefore(btn, sendButton);
      } else {
        // Fallback: place inside the input container
        container.appendChild(btn);
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
