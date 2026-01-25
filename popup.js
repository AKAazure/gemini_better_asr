// popup.js

function init() {
  console.log("Popup script initializing...");

  // --- Settings Logic ---
  const input = document.getElementById('apiKeyInput');
  const saveBtn = document.getElementById('saveBtn');
  const btnText = document.getElementById('btnText');
  const saveIcon = document.getElementById('saveIcon');
  const checkIcon = document.getElementById('checkIcon');

  if (input) {
    // Load existing key
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['openai_api_key'], (result) => {
        if (result.openai_api_key) {
          input.value = result.openai_api_key;
        }
      });
    } else {
      // Dev fallback
      const stored = localStorage.getItem('openai_api_key');
      if (stored) input.value = stored;
    }

    // Save handler
    saveBtn.addEventListener('click', () => {
      const apiKey = input.value.trim();
      
      // Save to storage
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ openai_api_key: apiKey }, () => {
          console.log('Key saved to extension storage');
        });
      }
      // Backup/Dev save
      localStorage.setItem('openai_api_key', apiKey);

      // Visual Feedback
      showSuccess();
    });
  }

  function showSuccess() {
    saveBtn.classList.add('success');
    btnText.textContent = 'Saved Successfully';
    saveIcon.style.display = 'none';
    checkIcon.style.display = 'inline';

    setTimeout(() => {
      saveBtn.classList.remove('success');
      btnText.textContent = 'Save Key';
      saveIcon.style.display = 'inline';
      checkIcon.style.display = 'none';
    }, 2000);
  }


  // --- Microphone Test Logic ---
  
  const micContainer = document.getElementById('micTestContainer');
  let isRecording = false;
  let audioContext = null;
  let analyser = null;
  let animationId = null;
  let mediaStream = null;

  const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;
  
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
    btn.title = "Test Microphone";
    btn.id = "micTestBtn"; 
    btn.addEventListener("click", handleMicClick);
    return btn;
  }

  async function handleMicClick(e) {
    const btn = e.currentTarget;

    if (!isRecording) {
      // Start Recording Simulation
      try {
        console.log("Requesting microphone access...");
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Microphone access granted");
        
        
        isRecording = true;
        await setupVisualizer(mediaStream);
        btn.innerHTML = WAVEFORM_HTML;
        btn.classList.add("recording");
        
      } catch (err) {
        console.error("Mic Error:", err);
        alert("Could not access microphone. If you are in a preview window, try opening the page in a new tab or checking browser permissions.");
      }
    } else {
      stopTest(btn);
    }
  }

  function stopTest(btn) {
    isRecording = false;
    stopVisualizer();
    
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }

    if (btn) {
      btn.innerHTML = ICON_SVG;
      btn.classList.remove("recording");
    }
  }

  async function setupVisualizer(stream) {
    try {
      console.debug("Setting up visualizer...");
      audioContext = new AudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      
      analyser.fftSize = 256; 
      analyser.smoothingTimeConstant = 0.5; // More responsive
      source.connect(analyser);
      
      console.debug("Visualizer set up, starting visualize()");
      visualize();
    } catch (e) {
      console.error("Audio Context Setup Error:", e);
    }
  }

  function visualize() {
    if (!isRecording || !analyser) {
      console.log("Visualize early return:", { isRecording, analyser: !!analyser });
      return;
    }
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    
    let sum = 0;
    // Tuning bins for voice
    const startBin = 1;
    const endBin = 20;
    
    for(let i = startBin; i <= endBin; i++) {
      sum += dataArray[i];
    }
    const averageVolume = sum / (endBin - startBin + 1);

    const bars = document.querySelectorAll('.gemini-voice-bar');
    if (bars.length === 5) {
        if (averageVolume < 10) {
          bars.forEach(bar => bar.style.height = '10%');
        } else {
          // Map frequency bands to bars
          // indices covering low to high speech frequencies
          const indices = [2, 5, 9, 14, 19];
          
          bars.forEach((bar, i) => {
              const val = dataArray[indices[i]] || 0;
              
              // Scale 0-255 to 10-100%
              // Add a multiplier to make it look more active
              let percent = 10 + (val / 255) * 150;
              
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

  // Initialize Mic Test
  if (micContainer) {
    console.log("Injecting mic button...");
    micContainer.innerHTML = '';
    micContainer.appendChild(createMicButton());
  } else {
    console.error("micTestContainer not found in DOM");
  }
}

// Run immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}