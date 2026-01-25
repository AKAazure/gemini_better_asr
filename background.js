// background.js handles the API calls to avoid CORS issues in the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "transcribe") {
    handleTranscription(request.audioData, request.apiKey)
      .then(text => sendResponse({ success: true, text }))
      .catch(error => sendResponse({ success: false, error: error.toString() }));
    
    // Return true to indicate we wish to send a response asynchronously
    return true;
  }
});

async function handleTranscription(base64AudioData, apiKey) {
  try {
    // 1. Fetch the base64 data to get a blob
    const res = await fetch(base64AudioData);
    const blob = await res.blob();

    // 2. Prepare FormData for OpenAI Whisper API
    const formData = new FormData();
    formData.append("file", blob, "recording.webm");
    formData.append("model", "whisper-1");

    // 3. Call OpenAI
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      },
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ? data.error.message : "Transcription failed");
    }

    return data.text;
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
}
