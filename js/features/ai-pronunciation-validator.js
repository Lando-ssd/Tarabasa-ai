let recognitionInstance = null;
let recordingStartedAt = null;
let recordingTimeout = null;
let silenceTimeout = null;
let hasAudioInput = false;
let finalTranscriptLocked = false;
let soundDetectedTimeout = null;

function computeAccuracy(transcript, expected) {
  const t = transcript.toLowerCase().trim().replace(/[.,!?;:]/g, "");
  const e = expected.toLowerCase().trim().replace(/[.,!?;:]/g, "");

  if (!t) return 0;
  if (t === e) return 100;

  // Calculate Levenshtein distance
  const matrix = Array(e.length + 1).fill(null).map(() => Array(t.length + 1).fill(null));

  for (let i = 0; i <= e.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= e.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const indicator = e[i - 1] === t[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j] + 1, // deletion
        matrix[i - 1][j - 1] + indicator // substitution
      );
    }
  }

  const distance = matrix[e.length][t.length];
  const maxLength = Math.max(e.length, t.length);
  const similarity = 1 - (distance / maxLength);

  // Boost score if the expected word is completely contained within the transcript
  let score = Math.round(similarity * 100);
  if (t.includes(e) && score < 85) {
    score = 85;
  }

  return Math.max(10, Math.min(100, score));
}

function updateLiveAiStatus(text) {
  const el = document.getElementById("ai-live-status");
  if (el) el.textContent = text;
}

function generateAiFeedback(pronunciationScore, fluencyScore, accuracyScore, overallScore, expected, transcript) {
  const feedback = [];

  // Accuracy feedback
  if (accuracyScore === 100) {
    feedback.push("🎯 Perfect! You said exactly what was expected.");
  } else if (accuracyScore >= 80) {
    feedback.push("✅ Very good! You were very close to the target phrase.");
  } else if (accuracyScore >= 50) {
    feedback.push(`⚠️ You said: "${transcript || '[Nothing clearly heard]'}". We were looking for: "${expected}".`);
  } else {
    feedback.push(`❌ I heard "${transcript || '[Nothing clearly heard]'}". Please focus on saying "${expected}".`);
  }

  // Pronunciation feedback
  if (pronunciationScore >= 85) {
    feedback.push("🗣️ Your pronunciation is clear and natural.");
  } else if (pronunciationScore >= 60) {
    feedback.push("🗣️ Your pronunciation is okay, but could be clearer.");
  } else if (pronunciationScore >= 35) {
    feedback.push("🗣️ Try to enunciate your words more clearly. Open your mouth wider on vowels.");
  } else {
    feedback.push("🗣️ Your pronunciation was totally inaccurate. Please listen to the correct pronunciation and try again slowly.");
  }

  // Fluency feedback
  if (fluencyScore >= 80) {
    feedback.push("⏱️ Great pacing! You spoke at a natural speed.");
  } else if (fluencyScore >= 60) {
    feedback.push("⏱️ Your pacing was a bit uneven. Try to speak steadily.");
  } else {
    feedback.push("⏱️ You spoke too slowly or paused too much. Try to speak more fluidly.");
  }

  return feedback.join("\n");
}

async function startVoiceValidation() {
  const selectedVerb = window.tbVerbPractice?.selectedVerb;
  const selectedTense = window.tbVerbPractice?.selectedTense;
  if (!selectedVerb) {
    alert("Select a verb card first.");
    return;
  }

  // Stop any existing recognition
  if (recognitionInstance) {
    try {
      recognitionInstance.abort();
    } catch (err) {
      console.log("Aborted previous recognition");
    }
    recognitionInstance = null;
  }

  // Clear all timeouts
  if (recordingTimeout) clearTimeout(recordingTimeout);
  if (silenceTimeout) clearTimeout(silenceTimeout);
  if (soundDetectedTimeout) clearTimeout(soundDetectedTimeout);
  recordingTimeout = null;
  silenceTimeout = null;
  soundDetectedTimeout = null;

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    alert("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
    return;
  }

  // Check for microphone permission
  let microphoneGranted = false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    microphoneGranted = true;
  } catch (err) {
    alert("Microphone access denied. Please allow microphone access and try again.");
    updateLiveAiStatus("❌ Microphone access denied.");
    return;
  }

  recognitionInstance = new Recognition();
  recognitionInstance.lang = "en-US";
  recognitionInstance.interimResults = true;
  recognitionInstance.continuous = true;
  recognitionInstance.maxAlternatives = 3; // Get multiple alternatives for better accuracy
  
  recordingStartedAt = Date.now();
  let finalTranscript = "";
  let interimTranscript = "";
  let lastFinalResultTime = Date.now();
  let soundDetected = false;
  
  const maxRecordingTime = 30000; // 30 seconds max (longer for kids)
  const silenceTimeout_ms = 6000; // Stop after 6 seconds of silence
  const minRecordingTime = 800; // Minimum 800ms before detecting silence
  const soundDetectTimeout = 8000; // Warn if no sound in 8 seconds

  updateLiveAiStatus("🎤 Listening... speak clearly. I'm ready!");
  hasAudioInput = false;
  soundDetected = false;
  finalTranscriptLocked = false;

  // Warn if no sound detected after 8 seconds
  soundDetectedTimeout = setTimeout(() => {
    if (!soundDetected && recognitionInstance) {
      updateLiveAiStatus("⚠️ No sound detected yet. Make sure microphone is working and speak louder.");
    }
  }, soundDetectTimeout);

  recognitionInstance.onstart = () => {
    updateLiveAiStatus("🎤 Listening... speak now.");
    hasAudioInput = false;
    soundDetected = false;
    finalTranscriptLocked = false;
  };

  recognitionInstance.onresult = (event) => {
    let hasNewFinal = false;
    let bestConfidence = 0;
    
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      const confidence = event.results[i][0].confidence || 0;
      
      // Track best confidence for feedback
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
      }
      
      if (event.results[i].isFinal) {
        // Only add if not already in finalTranscript and has minimum confidence
        if (!finalTranscript.includes(transcript.trim()) && confidence > 0.3) {
          finalTranscript += `${transcript} `;
          hasNewFinal = true;
          lastFinalResultTime = Date.now();
          soundDetected = true;
          console.log(`Audio captured: "${transcript}" (confidence: ${(confidence * 100).toFixed(0)}%)`);
        }
      } else {
        interimTranscript = transcript;
      }
    }

    hasAudioInput = true;
    soundDetected = true;

    // Clear previous silence timeout on new input
    if (silenceTimeout) {
      clearTimeout(silenceTimeout);
      silenceTimeout = null;
    }

    const displayText = (finalTranscript + interimTranscript).trim() || "...";
    const confidencePercent = (bestConfidence * 100).toFixed(0);
    updateLiveAiStatus(`🎤 Heard: "${displayText}" (${confidencePercent}% confident)`);

    // Set silence timeout after a final result
    if (event.results[event.results.length - 1].isFinal) {
      const elapsedSinceFinal = Date.now() - lastFinalResultTime;
      
      // Only set silence timeout if we're past minimum recording time
      if (elapsedSinceFinal > minRecordingTime) {
        silenceTimeout = setTimeout(() => {
          if (recognitionInstance && !finalTranscriptLocked) {
            console.log("Stopping due to silence...");
            recognitionInstance.stop();
          }
        }, silenceTimeout_ms);
      }
    }
  };

  recognitionInstance.onerror = (event) => {
    const errorMessages = {
      'no-speech': '🔇 No speech detected. Please speak louder and try again.',
      'audio-capture': '🎙️ Microphone issue. Check connection and try again.',
      'network': '🌐 Network error. Check internet and try again.',
      'not-allowed': '🔒 Allow microphone in browser settings.',
      'service-not-allowed': '🔒 Speech service not allowed.',
      'bad-grammar': '⚠️ Unclear speech. Try again more clearly.',
      'aborted': '⏹️ Recording cancelled.',
    };

    const message = errorMessages[event.error] || `❌ Error: ${event.error}`;
    updateLiveAiStatus(message);
    console.error('Speech error:', event.error, event);
    
    // Don't stop on certain errors, let it keep trying
    if (event.error === 'no-speech' || event.error === 'audio-capture') {
      // These errors might be temporary, keep listening
      console.log('Retrying...');
    }
  };

  recognitionInstance.onend = async () => {
    // Lock the transcript immediately
    finalTranscriptLocked = true;
    
    // Clear timeouts
    if (recordingTimeout) clearTimeout(recordingTimeout);
    if (silenceTimeout) clearTimeout(silenceTimeout);
    if (soundDetectedTimeout) clearTimeout(soundDetectedTimeout);
    recordingTimeout = null;
    silenceTimeout = null;
    soundDetectedTimeout = null;

    const transcript = finalTranscript.trim();
    const recordingDuration = Date.now() - recordingStartedAt;
    console.log(`Recording ended. Duration: ${recordingDuration}ms, Transcript: "${transcript}"`);
    
    // Check if we got any speech
    if (!transcript || transcript.length === 0) {
      updateLiveAiStatus("❌ No speech captured. Check your microphone and try again.");
      document.getElementById("ai-score-pronunciation").textContent = "0";
      document.getElementById("ai-score-fluency").textContent = "0";
      document.getElementById("ai-score-accuracy").textContent = "0";
      document.getElementById("ai-score-overall").textContent = "0";
      return;
    }

    const expectedSpeech = formatVerbByTense(selectedVerb, selectedTense);
    const accuracyScore = computeAccuracy(transcript, expectedSpeech);

    const lengthDiff = Math.abs(transcript.length - expectedSpeech.length);
    let pronunciationScore = Math.max(0, Math.min(100, accuracyScore - (lengthDiff * 1.5)));
    if (accuracyScore < 40) pronunciationScore = Math.min(pronunciationScore, 25);
    else pronunciationScore = Math.round(pronunciationScore);

    const durationSeconds = Math.max(1, Math.round(recordingDuration / 1000));
    const fluencyScore = accuracyScore < 30 ? Math.min(100, accuracyScore + 20) : Math.max(40, Math.min(100, 70 + Math.round(20 / durationSeconds)));
    const overallScore = Math.round((pronunciationScore + fluencyScore + accuracyScore) / 3);
    const passed = overallScore >= 75;
    const feedback = generateAiFeedback(pronunciationScore, fluencyScore, accuracyScore, overallScore, expectedSpeech, transcript);

    document.getElementById("ai-score-pronunciation").textContent = `${pronunciationScore}`;
    document.getElementById("ai-score-fluency").textContent = `${fluencyScore}`;
    document.getElementById("ai-score-accuracy").textContent = `${accuracyScore}`;
    document.getElementById("ai-score-overall").textContent = `${overallScore}`;

    // Display feedback to user
    const feedbackEl = document.getElementById("ai-feedback");
    if (feedbackEl) {
      feedbackEl.style.display = "block";
      feedbackEl.textContent = feedback;
    }

    updateLiveAiStatus(`✅ Recorded: "${transcript}"`);

    await saveVoiceAttempt({
      verb: selectedVerb,
      tense: selectedTense,
      transcript,
      pronunciationScore,
      fluencyScore,
      accuracyScore,
      overallScore,
      passed,
      feedback
    });
    await refreshProgressTracking();
  };

  // Set maximum recording time
  recordingTimeout = setTimeout(() => {
    if (recognitionInstance) {
      recognitionInstance.stop();
      updateLiveAiStatus("⏱️ Recording time limit reached. Processing...");
    }
  }, maxRecordingTime);

  try {
    recognitionInstance.start();
  } catch (err) {
    console.error('Error starting speech recognition:', err);
    updateLiveAiStatus("❌ Could not start recording. Please try again.");
  }
}

function stopVoiceValidation() {
  if (recordingTimeout) clearTimeout(recordingTimeout);
  if (silenceTimeout) clearTimeout(silenceTimeout);
  if (soundDetectedTimeout) clearTimeout(soundDetectedTimeout);
  recordingTimeout = null;
  silenceTimeout = null;
  soundDetectedTimeout = null;
  finalTranscriptLocked = true;

  if (recognitionInstance) {
    updateLiveAiStatus("⏹️ Stopping... processing your speech.");
    try {
      recognitionInstance.stop();
    } catch (err) {
      console.error('Error stopping speech recognition:', err);
    }
  }
}

window.startVoiceValidation = startVoiceValidation;
window.stopVoiceValidation = stopVoiceValidation;
