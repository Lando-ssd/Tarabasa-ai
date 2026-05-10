function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toggleHistoryAccordion(button) {
  const panel = button.nextElementSibling;
  if (!panel || !panel.classList.contains("history-accordion-panel")) return;
  const open = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", open ? "false" : "true");
  panel.hidden = open;
  button.classList.toggle("is-open", !open);
}

window.toggleHistoryAccordion = toggleHistoryAccordion;

function groupByStudent(attempts) {
  const map = new Map();
  for (const a of attempts) {
    const key = a.studentEmail || a.studentName || "unknown";
    if (!map.has(key)) {
      map.set(key, { studentName: a.studentName || "Student", attempts: [] });
    }
    map.get(key).attempts.push(a);
  }
  return Array.from(map.entries())
    .map(([key, row]) => ({ key, ...row }))
    .sort((a, b) => new Date(b.attempts[0].createdAt) - new Date(a.attempts[0].createdAt));
}

function groupByVerbTense(attempts) {
  const map = new Map();
  for (const a of attempts) {
    const key = `${a.verb || ""}|${a.tense || ""}`;
    if (!map.has(key)) {
      map.set(key, { verb: a.verb, tense: a.tense, attempts: [] });
    }
    map.get(key).attempts.push(a);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.attempts[0].createdAt) - new Date(a.attempts[0].createdAt)
  );
}

function getStudentBadges(attempts) {
  if (!Array.isArray(attempts) || !attempts.length) return [{ label: "Starter", tone: "soft", icon: "🌱" }];
  const best = Math.max(...attempts.map((a) => a.overallScore || 0));
  const avg = Math.round(attempts.reduce((sum, row) => sum + Number(row.overallScore || 0), 0) / attempts.length);
  const recent3Passed = attempts.slice(0, 3).every((a) => Number(a.overallScore || 0) >= 75);
  const badges = [];
  if (attempts.length >= 5) badges.push({ label: "Practice Streak", tone: "info", icon: "🔥" });
  if (best >= 90) badges.push({ label: "Pronunciation Star", tone: "gold", icon: "⭐" });
  if (avg >= 80) badges.push({ label: "Strong Performer", tone: "success", icon: "🏅" });
  if (recent3Passed && attempts.length >= 3) badges.push({ label: "Consistency", tone: "purple", icon: "🎯" });
  return badges.length ? badges : [{ label: "Keep Going", tone: "soft", icon: "💪" }];
}

function getTeacherBadges(attempts) {
  if (!Array.isArray(attempts) || !attempts.length) return [{ label: "Class Monitor", tone: "soft", icon: "📘" }];
  const uniqueStudents = new Set(attempts.map((a) => a.studentEmail)).size;
  const highScores = attempts.filter((a) => Number(a.overallScore || 0) >= 85).length;
  const badges = [];
  if (uniqueStudents >= 3) badges.push({ label: "Multi-Student Tracking", tone: "info", icon: "👥" });
  if (highScores >= 5) badges.push({ label: "Class Momentum", tone: "success", icon: "📈" });
  badges.push({ label: "Live Insights", tone: "purple", icon: "🧠" });
  return badges;
}

function renderBadgeBoard(targetId, badges) {
  const board = document.getElementById(targetId);
  if (!board) return;
  board.innerHTML = badges.map((badge) => `
    <div class="design-badge ${badge.tone}">
      <span class="design-badge-icon">${badge.icon}</span>
      <span>${badge.label}</span>
    </div>
  `).join("");
}

function buildTrendSvg(attempts) {
  if (!Array.isArray(attempts) || !attempts.length) return "";
  const recent = attempts.slice().reverse().slice(-10);
  const points = recent
    .map((attempt, index) => {
      const x = 30 + index * 36;
      const y = 175 - Math.round((Number(attempt.overallScore || 0) / 100) * 145);
      return `${x},${y}`;
    })
    .join(" ");
  const bars = recent
    .map((attempt, index) => {
      const x = 22 + index * 36;
      const height = Math.round((Number(attempt.overallScore || 0) / 100) * 120);
      const y = 175 - height;
      return `<rect x="${x}" y="${y}" width="16" height="${height}" rx="4" fill="rgba(79,172,254,0.35)" />`;
    })
    .join("");

  return `
    <svg viewBox="0 0 400 200" class="trend-chart-svg" aria-label="Score trend chart">
      <defs>
        <linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#667eea"></stop>
          <stop offset="100%" stop-color="#ff6b9d"></stop>
        </linearGradient>
      </defs>
      <line x1="20" y1="175" x2="390" y2="175" stroke="#d8deee" />
      <line x1="20" y1="25" x2="20" y2="175" stroke="#d8deee" />
      <line x1="20" y1="62" x2="390" y2="62" stroke="#edf1fb" />
      <line x1="20" y1="100" x2="390" y2="100" stroke="#edf1fb" />
      <line x1="20" y1="138" x2="390" y2="138" stroke="#edf1fb" />
      ${bars}
      <polyline fill="none" stroke="url(#lineStroke)" stroke-width="3.5" points="${points}" />
      <text x="345" y="20" font-size="11" fill="#666">Last attempts</text>
    </svg>
  `;
}

function renderStudentHistory(attempts, studentName) {
  const list = Array.isArray(attempts) ? attempts : [];
  const feed = document.getElementById("student-history-feed");
  const chart = document.getElementById("student-trend-chart");
  if (!feed || !chart) return;
  renderBadgeBoard("student-badge-board", getStudentBadges(list));

  const name = studentName ? escapeHtml(studentName) : "You";
  if (!list.length) {
    feed.innerHTML = `<p class="history-feed-intro">Voice attempts for <strong>${name}</strong></p><div class="history-empty">No attempts yet.</div>`;
  } else {
    const groups = groupByVerbTense(list.slice(0, 100));
    const accordions = groups.map((g) => {
      const scores = g.attempts.map((x) => Number(x.overallScore || 0));
      const avg = Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);
      const verbLabel = escapeHtml(g.verb);
      const tenseLabel = escapeHtml(g.tense);
      const rows = g.attempts
        .map(
          (attempt) => `
        <div class="history-item history-item-nested">
          <div><strong>${escapeHtml(attempt.verb)}</strong> (${escapeHtml(attempt.tense)}) — ${attempt.overallScore}% overall</div>
          <div class="history-item-sub">Pronunciation ${attempt.pronunciationScore}% · Fluency ${attempt.fluencyScore}% · Accuracy ${attempt.accuracyScore}%</div>
          ${attempt.feedback ? `<div class="history-item-feedback" style="margin-top:8px; padding:8px; background-color:#f0f8ff; border-radius:3px; white-space:pre-wrap; font-size:0.9em; line-height:1.4;">${escapeHtml(attempt.feedback)}</div>` : ""}
          <div class="history-item-meta">${new Date(attempt.createdAt).toLocaleString()}</div>
        </div>`
        )
        .join("");
      return `
        <div class="history-accordion">
          <button type="button" class="history-accordion-trigger" aria-expanded="false" onclick="toggleHistoryAccordion(this)">
            <span class="history-accordion-chevron" aria-hidden="true"></span>
            <span class="history-accordion-title"><strong>${verbLabel}</strong> <span class="history-muted">(${tenseLabel})</span></span>
            <span class="history-accordion-meta">${g.attempts.length} ${g.attempts.length === 1 ? "try" : "tries"} · avg ${avg}%</span>
          </button>
          <div class="history-accordion-panel" hidden>${rows}</div>
        </div>`;
    }).join("");
    feed.innerHTML = `<p class="history-feed-intro">Voice attempts for <strong>${name}</strong> — tap a verb to expand details.</p><div class="history-accordion-list">${accordions}</div>`;
  }

  chart.innerHTML = list.length ? buildTrendSvg(list) : "<div>No trend data yet.</div>";
}

function renderTeacherHistory(attempts) {
  const list = Array.isArray(attempts) ? attempts : [];
  const feed = document.getElementById("teacher-history-feed");
  const chart = document.getElementById("teacher-trend-chart");
  if (!feed || !chart) return;
  renderBadgeBoard("teacher-badge-board", getTeacherBadges(list));

  if (!list.length) {
    feed.innerHTML = `<p class="history-feed-intro">One row per student — expand to see each voice attempt.</p><div class="history-empty">No class attempts yet.</div>`;
  } else {
    const groups = groupByStudent(list.slice(0, 200));
    const accordions = groups.map((g) => {
      const scores = g.attempts.map((x) => Number(x.overallScore || 0));
      const avg = Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);
      const latest = scores[0];
      const displayName = escapeHtml(g.studentName);
      const rows = g.attempts
        .map(
          (attempt) => `
        <div class="history-item history-item-nested">
          <div><strong>${escapeHtml(attempt.verb)}</strong> (${escapeHtml(attempt.tense)})</div>
          <div>Score: ${attempt.overallScore}% · ${new Date(attempt.createdAt).toLocaleString()}</div>
          ${attempt.feedback ? `<div class="history-item-feedback" style="margin-top:6px; padding:6px; background-color:#f0f8ff; border-radius:3px; white-space:pre-wrap; font-size:0.85em; line-height:1.4;">${escapeHtml(attempt.feedback)}</div>` : ""}
        </div>`
        )
        .join("");
      return `
        <div class="history-accordion">
          <button type="button" class="history-accordion-trigger" aria-expanded="false" onclick="toggleHistoryAccordion(this)">
            <span class="history-accordion-chevron" aria-hidden="true"></span>
            <span class="history-accordion-title"><strong>${displayName}</strong></span>
            <span class="history-accordion-meta">${g.attempts.length} attempt${g.attempts.length === 1 ? "" : "s"} · avg ${avg}% · latest ${latest}%</span>
          </button>
          <div class="history-accordion-panel" hidden>${rows}</div>
        </div>`;
    }).join("");
    feed.innerHTML = `<p class="history-feed-intro">Tap a student to see their attempts (newest students first).</p><div class="history-accordion-list">${accordions}</div>`;
  }

  chart.innerHTML = list.length ? buildTrendSvg(list) : "<div>No class trend yet.</div>";
}

async function refreshProgressTracking() {
  const session = await getSession();
  if (!session) return;
  try {
    if (session.role === "student") {
      const attempts = await getStudentVoiceAttempts();
      renderStudentHistory(attempts, session.name);
    } else if (session.role === "teacher") {
      const attempts = await getTeacherVoiceAttempts();
      renderTeacherHistory(attempts);
    }
  } catch (err) {
    console.error("Voice history could not be loaded:", err);
    const studentFeed = document.getElementById("student-history-feed");
    const teacherFeed = document.getElementById("teacher-history-feed");
    const msg = `<div class="history-empty">Could not load voice history (${err && err.message ? err.message : "network or server error"}). Check that the server is running (npm start) and refresh.</div>`;
    if (session.role === "student" && studentFeed) studentFeed.innerHTML = msg;
    if (session.role === "teacher" && teacherFeed) teacherFeed.innerHTML = msg;
  }
}

window.refreshProgressTracking = refreshProgressTracking;
