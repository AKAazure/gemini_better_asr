document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('apiKeyInput');
  const saveBtn = document.getElementById('saveBtn');
  const btnText = document.getElementById('btnText');
  const saveIcon = document.getElementById('saveIcon');
  const checkIcon = document.getElementById('checkIcon');

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
});