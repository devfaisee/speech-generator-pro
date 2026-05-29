// -------------------------------------------------------------
// AI Voiceover Pro - Core Studio Controller & Synthesis Engine
// -------------------------------------------------------------

// Active State
const state = {
  engineMode: "neural", // "neural" (SpeechSynthesis), "wasm" (meSpeak)
  selectedVoice: null,
  rate: 1.0,
  pitch: 1.0,
  volume: 0.9,
  
  // Script tracking
  scriptText: "Narration studio active. Paste your script here to record custom offline voiceovers instantly.",
  wordsCount: 0,
  charsCount: 0,
  
  // meSpeak WASM state
  meSpeakReady: false,
  selectedMeSpeakVoice: "en/en", // default english
  
  // Active playing SpeechSynthesisUtterance
  isPlaying: false,
  isPaused: false,
  activeUtterance: null,
  
  // Word highlighting maps
  wordBounds: [] // [{ start, end, index }] mapping word offsets
};

// DOM References
let elEngineSelect, elVoiceSelect, elRateSlider, elRateVal, elPitchSlider, elPitchVal;
let elVolumeSlider, elVolumeVal, elStatsBadge;
let elScriptInput, elHighlightOverlay, elBtnCloseHighlight, elHighlightContent;
let elBtnPlay, elBtnPause, elBtnStop, elBtnCopy, elBtnDownload;
let elProcessingOverlay, elEngineStatus, elCompilerStatus;

document.addEventListener("DOMContentLoaded", () => {
  cacheDomElements();
  bindEventHandlers();
  initNativeSpeechSynthesis();
  initMeSpeakEngine();
});

function cacheDomElements() {
  elEngineSelect = document.getElementById("engine-select");
  elVoiceSelect = document.getElementById("voice-select");
  
  elRateSlider = document.getElementById("range-rate");
  elRateVal = document.getElementById("val-rate");
  elPitchSlider = document.getElementById("range-pitch");
  elPitchVal = document.getElementById("val-pitch");
  elVolumeSlider = document.getElementById("range-volume");
  elVolumeVal = document.getElementById("val-volume");
  
  elStatsBadge = document.getElementById("stats-badge");
  elScriptInput = document.getElementById("script-input");
  elHighlightOverlay = document.getElementById("highlight-overlay");
  elBtnCloseHighlight = document.getElementById("btn-close-highlight");
  elHighlightContent = document.getElementById("highlight-text-content");
  
  elBtnPlay = document.getElementById("btn-play");
  elBtnPause = document.getElementById("btn-pause");
  elBtnStop = document.getElementById("btn-stop");
  elBtnCopy = document.getElementById("btn-copy");
  elBtnDownload = document.getElementById("btn-download");
  
  elProcessingOverlay = document.getElementById("processing-overlay");
  elEngineStatus = document.getElementById("engine-status");
  elCompilerStatus = document.getElementById("compiler-status");
}

function bindEventHandlers() {
  // Engine select
  elEngineSelect.addEventListener("change", handleEngineModeChange);

  // Script inputs
  elScriptInput.addEventListener("input", handleScriptInput);
  elScriptInput.value = state.scriptText;
  handleScriptInput(); // initial stats

  // Parameters
  elRateSlider.addEventListener("input", (e) => {
    state.rate = parseFloat(e.target.value);
    elRateVal.textContent = `${state.rate.toFixed(1)}x`;
  });

  elPitchSlider.addEventListener("input", (e) => {
    state.pitch = parseFloat(e.target.value);
    elPitchVal.textContent = `${state.pitch.toFixed(1)}x`;
  });

  elVolumeSlider.addEventListener("input", (e) => {
    const vol = parseInt(e.target.value);
    state.volume = vol / 100;
    elVolumeVal.textContent = `${vol}%`;
  });

  // Synced Transports
  elBtnPlay.addEventListener("click", handlePlayTrigger);
  elBtnPause.addEventListener("click", handlePauseTrigger);
  elBtnStop.addEventListener("click", handleStopTrigger);

  elBtnCloseHighlight.addEventListener("click", () => {
    handleStopTrigger();
    elHighlightOverlay.style.display = "none";
  });

  elBtnCopy.addEventListener("click", copyScriptToClipboard);
  elBtnDownload.addEventListener("click", executeWasmSpeechCompilation);
}

// --- Browser SpeechSynthesis API Engine ---
let nativeVoices = [];

function initNativeSpeechSynthesis() {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    elEngineStatus.textContent = "Error (Not Supported)";
    elEngineStatus.style.color = "var(--color-rose)";
    return;
  }

  function loadNativeVoices() {
    nativeVoices = window.speechSynthesis.getVoices();
    
    // Sort premium neural/natural voices to the top
    nativeVoices.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      const neuralA = nameA.includes("natural") || nameA.includes("neural") || nameA.includes("google");
      const neuralB = nameB.includes("natural") || nameB.includes("neural") || nameB.includes("google");
      
      if (neuralA && !neuralB) return -1;
      if (!neuralA && neuralB) return 1;
      return a.lang.localeCompare(b.lang);
    });

    populateVoiceSelectDropdown();
  }

  // Handle async voice loading
  window.speechSynthesis.onvoiceschanged = loadNativeVoices;
  loadNativeVoices();
}

function populateVoiceSelectDropdown() {
  elVoiceSelect.innerHTML = "";
  
  if (state.engineMode === "neural") {
    nativeVoices.forEach((voice, index) => {
      const option = document.createElement("option");
      option.value = index;
      
      // Label dynamic styles
      let label = `${voice.name} (${voice.lang})`;
      if (voice.name.toLowerCase().includes("natural") || voice.name.toLowerCase().includes("neural")) {
        label = `🌟 ${voice.name} (Neural Premium)`;
      } else if (voice.name.toLowerCase().includes("google")) {
        label = `🌐 ${voice.name} (Google Neural)`;
      }
      
      option.textContent = label;
      elVoiceSelect.appendChild(option);
    });
  } else {
    // WASM meSpeak profiles
    const meSpeakVoices = [
      { id: "en/en", name: "🇺🇸 English Male (Standard)" },
      { id: "en/en-us", name: "🇺🇸 English Female (Standard)" },
      { id: "en/en-n", name: "🇺🇸 English Regional" },
      { id: "de/de", name: "🇩🇪 German Male" },
      { id: "fr/fr", name: "🇫🇷 French Male" },
      { id: "es/es", name: "🇪🇸 Spanish Male" }
    ];
    
    meSpeakVoices.forEach(voice => {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.name;
      elVoiceSelect.appendChild(option);
    });
  }
}

function handleEngineModeChange() {
  state.engineMode = elEngineSelect.value;
  populateVoiceSelectDropdown();

  if (state.engineMode === "neural") {
    elEngineStatus.textContent = "Active (Browser-Native)";
    elEngineStatus.style.color = "";
    elCompilerStatus.textContent = "WAV serialization supported";
    elBtnDownload.disabled = false;
  } else {
    elEngineStatus.textContent = "Active (meSpeak WASM)";
    elEngineStatus.style.color = "var(--color-violet)";
    elCompilerStatus.textContent = "Direct WAV Compile ready";
    elBtnDownload.disabled = !state.meSpeakReady;
  }
  handleStopTrigger();
}

// --- meSpeak.js WebAssembly Engine ---
function initMeSpeakEngine() {
  if (typeof meSpeak === "undefined") {
    console.warn("meSpeak library was not found, compiling offline.");
    return;
  }

  // Load configuration files asynchronously from CDN
  meSpeak.loadConfig("https://cdn.jsdelivr.net/npm/mespeak@2.0.2/mespeak_config.json", () => {
    meSpeak.loadVoice("https://cdn.jsdelivr.net/npm/mespeak@2.0.2/voices/en/en.json", () => {
      state.meSpeakReady = true;
      console.log("meSpeak WebAssembly Engine loaded successfully!");
      if (state.engineMode === "wasm") {
        elBtnDownload.disabled = false;
      }
    });
  });
}

// --- Text Analytics ---
function handleScriptInput() {
  state.scriptText = elScriptInput.value;
  state.charsCount = state.scriptText.length;
  
  // Regex word count
  const words = state.scriptText.trim().split(/\s+/).filter(w => w.length > 0);
  state.wordsCount = words.length;

  elStatsBadge.textContent = `Words: ${state.wordsCount} | Characters: ${state.charsCount}`;
  
  if (state.wordsCount === 0) {
    elBtnPlay.disabled = true;
    elBtnDownload.disabled = true;
  } else {
    elBtnPlay.disabled = false;
    elBtnDownload.disabled = state.engineMode === "wasm" ? !state.meSpeakReady : false;
  }
}

// --- Dynamic highlighted visualizer markup compilers ---
function compileHighlightedTextLayout() {
  const text = state.scriptText;
  elHighlightContent.innerHTML = "";
  state.wordBounds = [];

  // Match alphanumeric words to wrap them in indexable spans
  // We use a regular expression that finds all words and records their exact string offsets
  const wordRegex = /[a-zA-Z0-9']+/g;
  let match;
  let wordIndex = 0;
  
  let formattedHtml = "";
  let lastIndex = 0;

  while ((match = wordRegex.exec(text)) !== null) {
    const start = match.index;
    const end = wordRegex.lastIndex;
    const word = match[0];

    // Append preceding whitespace or punctuation
    formattedHtml += text.substring(lastIndex, start);
    
    // Wrap target word
    formattedHtml += `<span class="highlight-word-span" id="word-${wordIndex}">${word}</span>`;
    
    // Map offsets
    state.wordBounds.push({
      start: start,
      end: end,
      index: wordIndex
    });

    wordIndex++;
    lastIndex = end;
  }

  // Append remaining text
  formattedHtml += text.substring(lastIndex);
  elHighlightContent.innerHTML = formattedHtml;
}

// --- Synced Speech Transport ---
function handlePlayTrigger() {
  if (state.wordsCount === 0) return;

  if (state.engineMode === "neural") {
    // --- Premium Browser SpeechSynthesis Mode ---
    if (state.isPaused) {
      window.speechSynthesis.resume();
      state.isPlaying = true;
      state.isPaused = false;
      elBtnPlay.classList.add("active");
      elBtnPause.classList.remove("active");
      return;
    }

    // Stop anything active
    window.speechSynthesis.cancel();

    // Rebuild highlighted spans DOM layout
    compileHighlightedTextLayout();
    elHighlightOverlay.style.display = "flex";

    const utterance = new SpeechSynthesisUtterance(state.scriptText);
    
    // Bind parameters
    utterance.rate = state.rate;
    utterance.pitch = state.pitch;
    utterance.volume = state.volume;
    
    const voiceIdx = parseInt(elVoiceSelect.value);
    if (!isNaN(voiceIdx) && nativeVoices[voiceIdx]) {
      utterance.voice = nativeVoices[voiceIdx];
    }

    // Word-by-word boundary callbacks
    utterance.onboundary = (event) => {
      if (event.name === "word") {
        const charOffset = event.charIndex;
        highlightActiveWordSpan(charOffset);
      }
    };

    utterance.onend = () => {
      handleStopTrigger();
    };

    utterance.onerror = (err) => {
      console.warn("Speech Synthesis interrupted.", err);
      handleStopTrigger();
    };

    state.activeUtterance = utterance;
    window.speechSynthesis.speak(utterance);
    
    state.isPlaying = true;
    elBtnPlay.classList.add("active");
  } else {
    // --- meSpeak WASM Playback Mode ---
    if (!state.meSpeakReady) return;
    
    elProcessingOverlay.style.display = "flex";
    
    setTimeout(() => {
      try {
        const voiceId = elVoiceSelect.value;
        
        // meSpeak speaks directly!
        meSpeak.speak(state.scriptText, {
          voice: voiceId,
          speed: Math.round(state.rate * 150), // standard speed is 150
          pitch: Math.round(state.pitch * 50), // standard pitch is 50
          volume: state.volume
        }, () => {
          // Playback finished
          state.isPlaying = false;
          elBtnPlay.classList.remove("active");
        });
        
        state.isPlaying = true;
        elBtnPlay.classList.add("active");
      } catch (err) {
        console.error("meSpeak execution failed.", err);
        alert("Error: WebAssembly voice compile failed.");
      } finally {
        elProcessingOverlay.style.display = "none";
      }
    }, 100);
  }
}

function highlightActiveWordSpan(charOffset) {
  // Find which word matches this character offset
  // We can binary-search or iterate since wordBounds is already sorted!
  const match = state.wordBounds.find(w => charOffset >= w.start && charOffset <= w.end);
  if (!match) return;

  // Clear previous highlights
  const spans = elHighlightContent.querySelectorAll(".highlight-word-span");
  spans.forEach(s => s.classList.remove("word-highlight"));

  // Highlight active
  const activeSpan = document.getElementById(`word-${match.index}`);
  if (activeSpan) {
    activeSpan.classList.add("word-highlight");
    // Scroll element smoothly into center view
    activeSpan.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function handlePauseTrigger() {
  if (state.engineMode === "neural" && state.isPlaying) {
    window.speechSynthesis.pause();
    state.isPlaying = false;
    state.isPaused = true;
    elBtnPlay.classList.remove("active");
    elBtnPause.classList.add("active");
  }
}

function handleStopTrigger() {
  if (state.engineMode === "neural") {
    window.speechSynthesis.cancel();
  } else {
    if (state.meSpeakReady) {
      meSpeak.stop();
    }
  }

  state.isPlaying = false;
  state.isPaused = false;
  
  elBtnPlay.classList.remove("active");
  elBtnPause.classList.remove("active");
}

// --- Exporter controls ---
function copyScriptToClipboard() {
  navigator.clipboard.writeText(state.scriptText)
    .then(() => {
      const originalText = elBtnCopy.innerHTML;
      elBtnCopy.innerHTML = "✓ Script Copied!";
      elBtnCopy.style.borderColor = "var(--color-green)";
      setTimeout(() => {
        elBtnCopy.innerHTML = originalText;
        elBtnCopy.style.borderColor = "";
      }, 1500);
    })
    .catch(err => {
      console.error("Failed to copy script.", err);
      alert("Failed to copy script to clipboard.");
    });
}

function executeWasmSpeechCompilation() {
  if (state.wordsCount === 0) return;

  if (state.engineMode === "neural") {
    // If they click download in neural mode, we suggest/autoswitch to WASM mode since
    // browser-native speech API cannot download buffers.
    alert("WAV Exporter Info: Native Neural Speech Synthesis doesn't support local audio downloads. We will automatically compile your script into a studio WAV file utilizing our offline meSpeak WebAssembly engine!");
    elEngineSelect.value = "wasm";
    handleEngineModeChange();
  }

  if (!state.meSpeakReady) {
    alert("WASM Engine loading. Please wait a moment.");
    return;
  }

  elProcessingOverlay.style.display = "flex";
  
  setTimeout(() => {
    try {
      const voiceId = elVoiceSelect.value;

      // Request raw array buffer data (generates direct 16-bit PCM WAV stream!)
      const wavArray = meSpeak.speak(state.scriptText, {
        rawdata: "array",
        voice: voiceId,
        speed: Math.round(state.rate * 150),
        pitch: Math.round(state.pitch * 50),
        volume: state.volume
      });

      if (!wavArray) {
        throw new Error("Compilation generated empty buffer.");
      }

      // Convert Uint8Array to Blob
      const blob = new Blob([new Uint8Array(wavArray)], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);

      // Trigger download
      const link = document.createElement("a");
      link.href = url;
      link.download = "verynt-voiceover.wav";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error("WASM compile failed.", err);
      alert("WASM Compile Error: Script size may exceed allocated memory limits. Try a shorter sentence.");
    } finally {
      elProcessingOverlay.style.display = "none";
    }
  }, 100);
}
