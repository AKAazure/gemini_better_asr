import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Mic, Save, Key, Check } from 'lucide-react';

declare const chrome: any;

const App = () => {
  const [apiKey, setApiKey] = useState('');
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    // Try to retrieve from Chrome extension storage first
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['openai_api_key'], (result: any) => {
        if (result.openai_api_key) {
          setApiKey(result.openai_api_key);
        }
      });
    } else {
      // Fallback for development/web preview
      const storedKey = localStorage.getItem('openai_api_key');
      if (storedKey) setApiKey(storedKey);
    }
  }, []);

  const handleSaveKey = () => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ openai_api_key: apiKey }, () => {
        console.log('API Key saved');
      });
    }
    localStorage.setItem('openai_api_key', apiKey);
    
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  return (
    <div className="bg-slate-50 min-h-full font-sans flex flex-col">
      {/* Compact Header */}
      <div className="bg-blue-600 p-4 flex items-center gap-3 shadow-sm shrink-0">
        <div className="bg-white/20 p-1.5 rounded-lg">
          <Mic className="text-white w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white leading-tight">Gemini Voice</h1>
          <p className="text-blue-100 text-xs">Extension Settings</p>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-4">
        {/* Input Section */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-blue-600" />
            OpenAI API Key
          </label>
          
          <div className="relative">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full pl-3 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all"
            />
          </div>
          
          <p className="text-xs text-slate-500 leading-relaxed">
            Required for speech-to-text. Keys are stored locally in your browser.
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={handleSaveKey}
          className={`w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm mt-auto ${
            showSaved 
              ? 'bg-green-600 text-white shadow-green-200' 
              : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200'
          }`}
        >
          {showSaved ? (
            <>
              <Check className="w-4 h-4" />
              <span>Saved Successfully</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Key</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);