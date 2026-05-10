function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function scoreColor(score) {
  if (score === null || score === undefined) return "#aaa";
  if (score >= 90) return "#4CAF50";
  if (score >= 75) return "#2196F3";
  if (score >= 60) return "#FF9800";
  return "#f44336";
}

function scoreLabel(score) {
  if (score === null || score === undefined) return "No data yet";
  if (score >= 90) return "Excellent 🌟";
  if (score >= 75) return "Good 👍";
  if (score >= 60) return "Needs Practice 📚";
  return "Needs Help ⚠️";
}

function renderScoreBar(score, label) {
  const pct = score !== null ? score : 0;
  const color = scoreColor(score);
  return `
    <div style="margin-bottom: 6px;">
      <div style="display:flex; justify-content:space-between; font-size:0.82em; margin-bottom:3px;">
        <span>${label}</span>
        <span style="font-weight:600; color:${color};">${score !== null ? score + "%" : "—"}</span>
      </div>
      <div style="background:#e0e0e0; border-radius:999px; height:8px; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:${color}; border-radius:999px; transition:width 0.6s ease;"></div>
      </div>
    </div>
  `;
}

async function renderParentDashboard() {
  const summaryEl = document.getElementById("parent-summary-cards");
  const progressSection = document.getElementById("parent-child-progress-section");
  const weeklyEl = document.getElementById("weekly-report-content");
  const checklistEl = document.getElementById("activity-checklist");
  const badgesEl = document.getElementById("badge-display");

  if (!summaryEl || !weeklyEl || !checklistEl || !badgesEl) return;

  try {
    const data = await getParentOverview();

    // ── Child Overview Cards ──────────────────────────────────────────────────
    if (!data.children || data.children.length === 0) {
      summaryEl.innerHTML = `
        <div style="text-align:center; padding:24px; color:#888;">
          <div style="font-size:2em; margin-bottom:8px;">🔗</div>
          <div><strong>No children linked yet.</strong></div>
          <div style="font-size:0.9em; margin-top:6px;">Ask your school admin to connect your account to your child's email.</div>
        </div>`;
      progressSection.innerHTML = "";
      weeklyEl.innerHTML = "No data available.";
      checklistEl.innerHTML = "";
      badgesEl.innerHTML = "";
      return;
    }

    summaryEl.innerHTML = data.children.map((child) => {
      const vp = child.voiceProgress;
      const avgVoice = vp.averageScore;
      const statusColor = child.atRisk ? "#f44336" : "#4CAF50";
      const statusText = child.atRisk ? "⚠️ Needs Help" : "✅ On Track";

      return `
        <div style="
          background: linear-gradient(135deg, #f8f9ff 0%, #fff 100%);
          border: 1px solid #e0e4ff;
          border-left: 5px solid ${statusColor};
          border-radius: 12px;
          padding: 20px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 16px;
          align-items: start;
        ">
          <div>
            <div style="font-size:1.2em; font-weight:700; color:#333; margin-bottom:4px;">${child.name}</div>
            <div style="color:#666; font-size:0.9em; margin-bottom:12px;">${child.currentLevel} &nbsp;|&nbsp; Last active: ${formatDate(child.lastActive)}</div>

            ${renderScoreBar(child.score, "📘 Class Score")}
            ${renderScoreBar(avgVoice, "🎙️ Avg. Voice Score")}

            <div style="margin-top:12px; display:flex; gap:16px; flex-wrap:wrap; font-size:0.88em; color:#555;">
              <span>🎯 Total Attempts: <strong>${vp.totalAttempts}</strong></span>
              <span>✅ Passed: <strong style="color:#4CAF50;">${vp.passedCount}</strong></span>
              <span>❌ Failed: <strong style="color:#f44336;">${vp.failedCount}</strong></span>
            </div>
          </div>
          <div style="text-align:center; min-width:80px;">
            <div style="
              width:70px; height:70px;
              border-radius:50%;
              background: conic-gradient(${scoreColor(avgVoice)} ${(avgVoice || 0) * 3.6}deg, #e0e0e0 0deg);
              display:flex; align-items:center; justify-content:center;
              position:relative; margin:0 auto 8px;
            ">
              <div style="width:54px;height:54px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1em;color:${scoreColor(avgVoice)};">
                ${avgVoice !== null ? avgVoice + "%" : "—"}
              </div>
            </div>
            <div style="font-size:0.75em; color:${statusColor}; font-weight:600;">${statusText}</div>
            <div style="font-size:0.7em; color:#999; margin-top:2px;">${scoreLabel(avgVoice)}</div>
          </div>
        </div>
      `;
    }).join("");

    // ── Per-Child Voice Attempt History ──────────────────────────────────────
    progressSection.innerHTML = data.children.map((child) => {
      const vp = child.voiceProgress;
      if (!vp.recentAttempts || vp.recentAttempts.length === 0) {
        return `
          <div class="panel">
            <h3>🎙️ ${child.name}'s Practice History</h3>
            <div style="color:#888; text-align:center; padding:16px;">
              No voice practice sessions yet. When ${child.name} completes verb activities, they'll appear here.
            </div>
          </div>`;
      }

      const rows = vp.recentAttempts.map((attempt) => `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 8px; font-weight:600;">${attempt.verb}</td>
          <td style="padding:10px 8px; color:#666; font-size:0.88em;">${attempt.tense}</td>
          <td style="padding:10px 8px; text-align:center;">
            <span style="color:${scoreColor(attempt.pronunciationScore)}; font-weight:600;">${attempt.pronunciationScore}%</span>
          </td>
          <td style="padding:10px 8px; text-align:center;">
            <span style="color:${scoreColor(attempt.fluencyScore)}; font-weight:600;">${attempt.fluencyScore}%</span>
          </td>
          <td style="padding:10px 8px; text-align:center;">
            <span style="color:${scoreColor(attempt.accuracyScore)}; font-weight:600;">${attempt.accuracyScore}%</span>
          </td>
          <td style="padding:10px 8px; text-align:center;">
            <span style="
              background:${attempt.passed ? "#e8f5e9" : "#ffebee"};
              color:${attempt.passed ? "#2e7d32" : "#c62828"};
              padding:3px 10px; border-radius:999px; font-size:0.82em; font-weight:600;
            ">${attempt.passed ? "✅ Passed" : "❌ Failed"}</span>
          </td>
          <td style="padding:10px 8px; font-size:0.8em; color:#999;">${formatDate(attempt.date)}</td>
        </tr>
      `).join("");

      return `
        <div class="panel">
          <h3>🎙️ ${child.name}'s Recent Practice Sessions</h3>
          <div style="max-height: 350px; overflow-y: auto; overflow-x: auto; padding-right: 5px;">
            <table style="width:100%; border-collapse:collapse; font-size:0.9em;">
              <thead>
                <tr style="background:#f5f5f5; text-align:left;">
                  <th style="padding:10px 8px; color:#555;">Verb</th>
                  <th style="padding:10px 8px; color:#555;">Tense</th>
                  <th style="padding:10px 8px; text-align:center; color:#555;">Pronun.</th>
                  <th style="padding:10px 8px; text-align:center; color:#555;">Fluency</th>
                  <th style="padding:10px 8px; text-align:center; color:#555;">Accuracy</th>
                  <th style="padding:10px 8px; text-align:center; color:#555;">Result</th>
                  <th style="padding:10px 8px; color:#555;">Date</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          ${vp.totalAttempts > 10 ? `<div style="text-align:center; margin-top:12px; font-size:0.85em; color:#888;">Showing 10 most recent of ${vp.totalAttempts} total sessions.</div>` : ""}
        </div>
      `;
    }).join("");

    // ── Weekly Report ─────────────────────────────────────────────────────────
    const wr = data.weeklyReport;
    weeklyEl.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:12px;">
        <div style="text-align:center; padding:16px; background:#f3f8ff; border-radius:10px;">
          <div style="font-size:1.8em; font-weight:700; color:#1976D2;">${wr.weeklyActivities}</div>
          <div style="font-size:0.85em; color:#555; margin-top:4px;">Total Activities This Week</div>
        </div>
        <div style="text-align:center; padding:16px; background:#f3f8ff; border-radius:10px;">
          <div style="font-size:1.8em; font-weight:700; color:#7B1FA2;">${wr.weeklyVoiceAttempts}</div>
          <div style="font-size:0.85em; color:#555; margin-top:4px;">Voice Sessions This Week</div>
        </div>
        <div style="text-align:center; padding:16px; background:#f3f8ff; border-radius:10px;">
          <div style="font-size:1.8em; font-weight:700; color:${scoreColor(wr.averageScore)};">${wr.averageScore}%</div>
          <div style="font-size:0.85em; color:#555; margin-top:4px;">Average Class Score</div>
        </div>
        <div style="text-align:center; padding:16px; background:#f3f8ff; border-radius:10px;">
          <div style="font-size:1.8em; font-weight:700; color:${scoreColor(wr.averageVoiceScore)};">${wr.averageVoiceScore}%</div>
          <div style="font-size:0.85em; color:#555; margin-top:4px;">Average Voice Score</div>
        </div>
      </div>
    `;

    // ── Activity Checklist ────────────────────────────────────────────────────
    checklistEl.innerHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">` +
      data.activityChecklist.map((item) => {
        const icon = item.label.split(' ')[0];
        const title = item.label.substring(item.label.indexOf(' ') + 1);
        return `
        <div style="
          display:flex; align-items:center; padding:12px 16px;
          border-radius:12px; border:1px solid ${item.done ? '#c8e6c9' : '#e4e8f6'};
          background:${item.done ? 'linear-gradient(135deg, #f0faf0, #ffffff)' : '#fdfdff'};
          opacity:${item.done ? '1' : '0.6'};
          filter:${item.done ? 'none' : 'grayscale(100%)'};
          transition:all 0.2s;
        ">
          <div style="font-size:2.4em; margin-right:16px;">${icon}</div>
          <div>
            <div style="font-weight:700; color:${item.done ? '#2e7d32' : '#666'}; font-size:1.05em; margin-bottom:4px;">
              ${title} ${item.done ? '✅' : '❌'}
            </div>
            <div style="font-size:0.82em; color:#666; line-height:1.3;">${item.description || ''}</div>
          </div>
        </div>
      `;
      }).join("") + `</div>`;

    // ── Badges ────────────────────────────────────────────────────────────────
    badgesEl.innerHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">` +
      data.badges.map((b) => {
        const icon = b.name.split(' ')[0];
        const title = b.name.substring(b.name.indexOf(' ') + 1);
        return `
        <div style="
          display:flex; align-items:center; padding:12px 16px;
          border-radius:12px; border:1px solid ${b.earned ? '#d3c3ff' : '#e4e8f6'};
          background:${b.earned ? 'linear-gradient(135deg, #f8f6ff, #ffffff)' : '#fdfdff'};
          opacity:${b.earned ? '1' : '0.6'};
          filter:${b.earned ? 'none' : 'grayscale(100%)'};
          transition:all 0.2s;
        ">
          <div style="font-size:2.4em; margin-right:16px;">${icon}</div>
          <div>
            <div style="font-weight:700; color:${b.earned ? '#5b33c4' : '#666'}; font-size:1.05em; margin-bottom:4px;">
              ${title} ${b.earned ? '✅' : '🔒'}
            </div>
            <div style="font-size:0.82em; color:#666; line-height:1.3;">${b.description}</div>
          </div>
        </div>
      `;
      }).join("") + `</div>`;

  } catch (err) {
    if (summaryEl) summaryEl.innerHTML = `<div style="color:#c00; padding:16px;">${err.message || "Could not load parent dashboard."}</div>`;
  }
}

window.renderParentDashboard = renderParentDashboard;
