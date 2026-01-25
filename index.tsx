import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Mic, Save, Settings, Square, Loader2, Info, Key, Check, Globe } from 'lucide-react';

declare const chrome: any;

const App = () => {
  const [apiKey, setApiKey] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [status, setStatus] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    // Try to retrieve from Chrome extension storage first (for the actual extension)
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['openai_api_key'], (result: any) => {
        if (result.openai_api_key) {
          setApiKey(result.openai_api_key);
        }
      });
    } else {
      // Fallback to localStorage for development/web preview
      const storedKey = localStorage.getItem('openai_api_key');
      if (storedKey) setApiKey(storedKey);
    }
  }, []);

  const handleSaveKey = () => {
    // Save to Chrome extension storage so content scripts can access it
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ openai_api_key: apiKey }, () => {
        console.log('API Key saved to chrome.storage.local');
      });
    }

    // Also save to localStorage for development environment consistency
    localStorage.setItem('openai_api_key', apiKey);
    
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  const startRecording = async () => {
    if (!apiKey) {
      setStatus('Please save your OpenAI API Key first.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus('Recording... Speak now.');
      setTranscription('');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setStatus('Error accessing microphone. Check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus('Processing audio...');
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');

    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to transcribe');
      }

      setTranscription(data.text);
      setStatus('Transcription complete!');
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="bg-blue-600 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
              <Mic className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Gemini Voice Extension</h1>
              <p className="text-blue-100 text-sm">Speech-to-Text for Gemini & NotebookLM</p>
            </div>
          </div>
          <div className="bg-blue-700 px-3 py-1 rounded-full text-xs text-blue-100 font-medium">
            v1.0.0
          </div>
        </div>

        <div className="p-6 space-y-8">
          
          {/* API Key Configuration */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-800 font-semibold text-lg border-b border-slate-100 pb-2">
              <Settings className="w-5 h-5 text-blue-600" />
              <h2>Configuration</h2>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 flex gap-3">
              <Info className="w-5 h-5 shrink-0" />
              <p>
                An OpenAI API Key is required for high-quality Whisper transcription. 
                Your key is stored securely in your browser's extension storage.
              </p>
            </div>

            <div className="flex gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Key className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <button
                onClick={handleSaveKey}
                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
                  showSaved 
                    ? 'bg-green-600 text-white' 
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {showSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {showSaved ? 'Saved' : 'Save Key'}
              </button>
            </div>
          </section>

          {/* Test Playground */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-800 font-semibold text-lg border-b border-slate-100 pb-2">
              <Globe className="w-5 h-5 text-blue-600" />
              <h2>Test Bench</h2>
            </div>
            
            <div className="border border-slate-200 rounded-xl p-6 bg-slate-50/50">
              <div className="flex flex-col items-center justify-center space-y-4">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg ${
                    isRecording 
                      ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                      : 'bg-blue-600 hover:bg-blue-500 hover:scale-105'
                  }`}
                >
                  {isRecording ? (
                    <Square className="w-6 h-6 text-white" fill="currentColor" />
                  ) : (
                    <Mic className="w-8 h-8 text-white" />
                  )}
                </button>
                <div className="text-sm font-medium text-slate-600 h-5">
                  {status || 'Click microphone to test transcription'}
                </div>
              </div>

              {transcription && (
                <div className="mt-6">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Result
                  </label>
                  <div className="p-4 bg-white border border-slate-200 rounded-lg text-slate-700 min-h-[80px]">
                    {transcription}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Installation Info */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-800 font-semibold text-lg border-b border-slate-100 pb-2">
              <Info className="w-5 h-5 text-blue-600" />
              <h2>Installation</h2>
            </div>
            <div className="text-sm text-slate-600 space-y-2">
              <p>This application includes the necessary files to run as a Chrome Extension:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono">manifest.json</code> - Extension configuration</li>
                <li><code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono">content.js</code> - Injects the UI into Gemini/NotebookLM</li>
                <li><code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono">background.js</code> - Handles secure API calls</li>
              </ul>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);