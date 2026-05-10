let recognitionInstance = null;
let recordingStartedAt = null;

function computeAccuracy(transcript, expected) {
  const t = transcript.toLowerCase().trim().replace(/[.,!?]/g, "");
  const e = expected.toLowerCase().trim().replace(/[.,!?]/g, "");
  
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

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    alert("Speech recognition is not supported in this browser.");
    return;
  }

  recognitionInstance = new Recognition();
  recognitionInstance.lang = "en-US";
  recognitionInstance.interimResults = true;
  recognitionInstance.continuous = false;
  recordingStartedAt = Date.now();
  let finalTranscript = "";

  updateLiveAiStatus("Listening... speak now.");

  recognitionInstance.onresult = async (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += `${transcript} `;
      else interim += transcript;
    }
    updateLiveAiStatus(`Heard: ${(finalTranscript + interim).trim() || "..."}`);
  };

  recognitionInstance.onerror = () => {
    updateLiveAiStatus("Recording failed. Try again.");
  };

  recognitionInstance.onend = async () => {
    const transcript = finalTranscript.trim();
    const expectedSpeech = formatVerbByTense(selectedVerb, selectedTense);
    const accuracyScore = computeAccuracy(transcript, expectedSpeech);
    
    const lengthDiff = Math.abs(transcript.length - expectedSpeech.length);
    let pronunciationScore = Math.max(0, Math.min(100, accuracyScore - (lengthDiff * 1.5)));
    if (accuracyScore < 40) pronunciationScore = Math.min(pronunciationScore, 25);
    else pronunciationScore = Math.round(pronunciationScore);
    
    const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000));
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
    
    updateLiveAiStatus(`Transcript: ${transcript || "No speech captured"}`);

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

  recognitionInstance.start();
}

function stopVoiceValidation() {
  if (recognitionInstance) {
    updateLiveAiStatus("Processing audio...");
    recognitionInstance.stop();
  }
}

window.startVoiceValidation = startVoiceValidation;
window.stopVoiceValidation = stopVoiceValidation;
