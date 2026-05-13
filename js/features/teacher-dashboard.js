// ─── Filters ────────────────────────────────────────────────────────────────
function collectFilters() {
  return {
    q: (document.getElementById("student-search-input")?.value || "").trim(),
    grade: (document.getElementById("grade-filter-select")?.value || "").trim(),
    atRisk: (document.getElementById("risk-filter-select")?.value || "").trim()
  };
}

function buildQueryString(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.grade) params.set("grade", filters.grade);
  if (filters.atRisk) params.set("atRisk", filters.atRisk);
  const query = params.toString();
  return query ? `?${query}` : "";
}

// ─── Overview ────────────────────────────────────────────────────────────────
async function renderClassOverview() {
  const overview = await getTeacherClassOverview();
  const totalEl = document.getElementById("total-students-number");
  const needEl = document.getElementById("need-help-number");
  const avgEl = document.getElementById("class-average-number");
  const activeEl = document.getElementById("active-today-number");
  if (totalEl) totalEl.textContent = String(overview.totalStudents || 0);
  if (needEl) needEl.textContent = String(overview.atRiskCount || 0);
  if (avgEl) avgEl.textContent = `${overview.averageScore || 0}%`;
  if (activeEl) activeEl.textContent = String(overview.activeToday || 0);
}

function renderAlerts(students) {
  const alertPanel = document.getElementById("alert-panel");
  if (!alertPanel) return;
  const atRisk = students.filter((s) => s.needsHelp);
  if (!atRisk.length) {
    alertPanel.innerHTML = "<strong>✅ All Clear:</strong> All students are currently on track.";
    alertPanel.style.background = "#e8f5e9";
    alertPanel.style.borderLeftColor = "#4CAF50";
    return;
  }
  alertPanel.style.background = "#fff3cd";
  alertPanel.style.borderLeftColor = "#ffc107";
  alertPanel.innerHTML = `<strong>⚠️ Intervention Needed:</strong> ${atRisk.map((s) => s.name).join(", ")} — below 75%.`;
}

// ─── Student List ────────────────────────────────────────────────────────────
async function renderStudentList() {
  const filters = collectFilters();
  const students = await apiRequest(`/api/teacher-students${buildQueryString(filters)}`);
  const listEl = document.getElementById("student-list-container");
  if (!listEl) return;

  renderAlerts(students);

  if (!students.length) {
    listEl.innerHTML = `<div class="history-empty">No students found. Add one using the ➕ button above.</div>`;
    return;
  }

  listEl.innerHTML = students.map((s) => {
    const scoreColor = s.score >= 75 ? "#2e7d32" : "#c62828";
    const badgeClass = s.needsHelp ? "badge-at-risk" : "badge-on-track";
    const badgeLabel = s.needsHelp ? "⚠️ At Risk" : "✅ On Track";
    const scoreBar = Math.min(100, Math.max(0, s.score));

    return `
      <div class="student-card">
        <div class="student-card-info">
          <div class="student-card-name">
            ${s.name}
            <span class="student-card-badge ${badgeClass}">${badgeLabel}</span>
          </div>
          <div class="student-card-meta">Grade ${s.grade} &nbsp;·&nbsp; Parent: ${s.parentName || "—"} &nbsp;·&nbsp; Phone: ${s.parentPhone || "—"}</div>
          <div style="margin-top:6px; background:#e8edf6; border-radius:999px; height:7px; overflow:hidden;">
            <div style="height:100%; width:${scoreBar}%; background:${scoreColor}; border-radius:999px; transition:width 0.4s;"></div>
          </div>
          <div style="font-size:0.78em; color:${scoreColor}; margin-top:3px; font-weight:700;">${s.score}%</div>
        </div>
        <div class="student-card-actions">
          <button class="btn btn-info" onclick="openStudentDrawer(${s.id})">✏️ Edit</button>
          <button class="btn back-btn" style="background:#ef5350;" onclick="deleteStudentRecord(${s.id})">🗑️</button>
        </div>
      </div>
    `;
  }).join("");
}

// ─── Drawer ──────────────────────────────────────────────────────────────────
let _drawerEditId = null;

async function loadAvailableStudentsForDrawer(query = "") {
  const container = document.getElementById("drawer-available-students");
  if (!container) return;
  
  container.innerHTML = `<div style="text-align:center; color:#aaa; padding:12px;">Loading available students...</div>`;
  
  try {
    const students = await getAvailableStudents(query);
    
    if (!students || students.length === 0) {
      container.innerHTML = `<div style="text-align:center; color:#aaa; padding:12px;">No available approved students to add.</div>`;
      return;
    }
    
    const html = students.map(s => `
      <div style="
        padding:10px 12px;
        border:1px solid #e0e0e0;
        border-radius:6px;
        margin-bottom:8px;
        cursor:pointer;
        background:#fafafa;
        transition:all 0.2s;
      " onclick="selectAvailableStudent(${s.id}, '${s.name}')" onmouseover="this.style.background='#f0f0f0'; this.style.borderColor='#2196F3';" onmouseout="this.style.background='#fafafa'; this.style.borderColor='#e0e0e0';">
        <div style="font-weight:600; color:#333;">${s.name}</div>
        <div style="font-size:0.82em; color:#666;">Grade ${s.grade} • ${s.parentName || 'No parent info'}</div>
      </div>
    `).join("");
    
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#c62828; padding:12px;">Error loading students: ${err.message}</div>`;
  }
}

function selectAvailableStudent(studentId, studentName) {
  document.getElementById("drawer-selected-student-id").value = studentId;
  document.getElementById("drawer-selected-student-name").textContent = `Selected: ${studentName}`;
  document.getElementById("drawer-selected-student-name").style.display = "block";
  document.getElementById("drawer-selected-student-name").style.color = "#2e7d32";
  document.getElementById("drawer-selected-student-name").style.fontWeight = "600";
}

function onDrawerSearchInput(event) {
  const query = event.target.value.trim();
  loadAvailableStudentsForDrawer(query);
}

function switchDrawerTab(tab) {
  ["info", "scores", "parent"].forEach(t => {
    document.getElementById(`drawer-tab-${t}`).classList.toggle("active-tab", t === tab);
    document.getElementById(`drawer-tab-content-${t}`).style.display = t === tab ? "block" : "none";
  });
}

async function openStudentDrawer(id) {
  _drawerEditId = id;
  const drawer = document.getElementById("student-drawer");
  const overlay = document.getElementById("student-drawer-overlay");
  const title = document.getElementById("drawer-title");
  const err = document.getElementById("drawer-error");

  // Reset form
  ["drawer-name", "drawer-score", "drawer-parent-name", "drawer-parent-phone", "drawer-parent-email"].forEach(el => {
    const input = document.getElementById(el);
    if (input) input.value = "";
  });
  document.getElementById("drawer-grade").value = "1";
  document.getElementById("drawer-active").value = "true";
  document.getElementById("drawer-score-big").textContent = "—";
  document.getElementById("drawer-score-status").textContent = "Enter a score";
  err.style.display = "none";

  // Switch to Info tab
  switchDrawerTab("info");

  if (id) {
    title.textContent = "Edit Student";
    // Pre-fill from current data
    getTeacherStudents().then(students => {
      const s = students.find(x => Number(x.id) === Number(id));
      if (!s) return;
      document.getElementById("drawer-name").value = s.name || "";
      document.getElementById("drawer-grade").value = s.grade || "1";
      document.getElementById("drawer-score").value = s.score ?? "";
      document.getElementById("drawer-parent-name").value = s.parentName || "";
      document.getElementById("drawer-parent-phone").value = s.parentPhone || "";
      document.getElementById("drawer-parent-email").value = s.parentEmail || "";
      updateScorePreview(s.score);
      document.getElementById("drawer-form-container").style.display = "block";
      document.getElementById("drawer-search-container").style.display = "none";
    });
  } else {
    title.textContent = "Add Approved Student to Class";
    document.getElementById("drawer-form-container").style.display = "none";
    document.getElementById("drawer-search-container").style.display = "block";
    await loadAvailableStudentsForDrawer();
  }

  drawer.style.display = "flex";
  overlay.style.display = "block";
}

function closeStudentDrawer() {
  document.getElementById("student-drawer").style.display = "none";
  document.getElementById("student-drawer-overlay").style.display = "none";
  _drawerEditId = null;
}

function updateScorePreview(val) {
  const score = Number(val);
  const big = document.getElementById("drawer-score-big");
  const status = document.getElementById("drawer-score-status");
  const preview = document.getElementById("drawer-score-preview");
  if (isNaN(score) || val === "") {
    big.textContent = "—";
    status.textContent = "Enter a score";
    preview.style.background = "#f5f7ff";
    return;
  }
  big.textContent = `${score}%`;
  if (score >= 90) { status.textContent = "🌟 Excellent!"; preview.style.background = "#e8f5e9"; big.style.color = "#2e7d32"; }
  else if (score >= 75) { status.textContent = "✅ On Track"; preview.style.background = "#e8f5e9"; big.style.color = "#388E3C"; }
  else { status.textContent = "⚠️ Needs Support"; preview.style.background = "#fff3e0"; big.style.color = "#e65100"; }
}

// Live score preview
document.addEventListener("DOMContentLoaded", () => {
  const scoreInput = document.getElementById("drawer-score");
  if (scoreInput) scoreInput.addEventListener("input", e => updateScorePreview(e.target.value));
});

async function saveStudentDrawer() {
  if (!_drawerEditId) {
    // Adding a new student - use the search/selection mode
    const selectedId = document.getElementById("drawer-selected-student-id")?.value;
    if (!selectedId) {
      document.getElementById("drawer-error").textContent = "Please select a student.";
      document.getElementById("drawer-error").style.display = "block";
      return;
    }
    
    try {
      await addTeacherStudent(Number(selectedId));
      closeStudentDrawer();
      await renderClassOverview();
      await renderStudentList();
    } catch (err) {
      document.getElementById("drawer-error").textContent = err.message || "Could not add student to class.";
      document.getElementById("drawer-error").style.display = "block";
    }
    return;
  }

  // Editing an existing student
  const name = document.getElementById("drawer-name").value.trim();
  const grade = document.getElementById("drawer-grade").value;
  const scoreRaw = document.getElementById("drawer-score").value;
  const parentName = document.getElementById("drawer-parent-name").value.trim();
  const parentPhone = document.getElementById("drawer-parent-phone").value.trim();
  const parentEmail = document.getElementById("drawer-parent-email").value.trim().toLowerCase();
  const isActiveToday = document.getElementById("drawer-active").value === "true";

  const errEl = document.getElementById("drawer-error");

  if (!name) {
    errEl.textContent = "Please enter the student's full name.";
    errEl.style.display = "block";
    switchDrawerTab("info");
    return;
  }
  if (scoreRaw === "" || isNaN(Number(scoreRaw))) {
    errEl.textContent = "Please enter a valid score (0–100).";
    errEl.style.display = "block";
    switchDrawerTab("scores");
    return;
  }

  const score = Math.max(0, Math.min(100, Number(scoreRaw)));
  errEl.style.display = "none";

  const payload = { name, grade, parentName, parentPhone, parentEmail, score, isActiveToday };

  try {
    await updateTeacherStudent(_drawerEditId, payload);
    closeStudentDrawer();
    await renderClassOverview();
    await renderStudentList();
  } catch (err) {
    errEl.textContent = err.message || "Could not save student.";
    errEl.style.display = "block";
  }
}

// ─── Legacy wrappers (keep old names working) ─────────────────────────────────
function addStudent() { openStudentDrawer(null); }
function editStudent(id) { openStudentDrawer(id); }

async function deleteStudentRecord(id) {
  if (!window.confirm("Delete this student from your class?")) return;
  await deleteTeacherStudent(id);
  await renderClassOverview();
  await renderStudentList();
}

// ─── CSV Import (file-based) ─────────────────────────────────────────────────
async function handleCsvFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  event.target.value = ""; // Reset so same file can be re-imported

  try {
    const result = await importTeacherStudentsCsv(text);
    alert(`✅ Imported ${result.imported} student(s) from CSV!`);
    await renderClassOverview();
    await renderStudentList();
  } catch (err) {
    alert("❌ CSV import failed: " + (err.message || "Unknown error.\n\nRequired headers: name, grade, parentName, parentPhone, parentEmail, score"));
  }
}

// Legacy CSV via prompt (kept for compatibility)
async function importCsvStudents() {
  document.getElementById("csv-file-input").click();
}

// ─── PDF Analytics Report ────────────────────────────────────────────────────
async function generateReport() {
  const overview = await getTeacherClassOverview();
  const students = await apiRequest("/api/teacher-students");

  const now = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  // Score distribution
  const excellent = students.filter(s => s.score >= 90).length;
  const onTrack = students.filter(s => s.score >= 75 && s.score < 90).length;
  const atRisk = students.filter(s => s.score < 75).length;

  const rows = students.map(s => `
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:7px 10px;">${s.name}</td>
      <td style="padding:7px 10px; text-align:center;">Grade ${s.grade}</td>
      <td style="padding:7px 10px; text-align:center; font-weight:700; color:${s.score >= 75 ? '#2e7d32' : '#c62828'};">${s.score}%</td>
      <td style="padding:7px 10px; text-align:center;">${s.needsHelp ? "⚠️ At Risk" : "✅ On Track"}</td>
      <td style="padding:7px 10px;">${s.parentName || "—"}</td>
      <td style="padding:7px 10px;">${s.parentPhone || "—"}</td>
    </tr>
  `).join("");

  // Create hidden print area
  let area = document.getElementById("pdf-print-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "pdf-print-area";
    document.body.appendChild(area);
  }

  area.innerHTML = `
    <div style="max-width:900px; margin:0 auto; font-family:Arial,sans-serif; color:#111;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; border-bottom:3px solid #667eea; padding-bottom:16px;">
        <div>
          <div style="font-size:24px; font-weight:800; color:#667eea;">📚 TaraBasa AI</div>
          <div style="font-size:18px; font-weight:700; margin-top:4px;">Class Analytics Report</div>
          <div style="font-size:12px; color:#666; margin-top:2px;">Generated: ${now}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px;">
        ${[
          { label: "Total Students", value: overview.totalStudents, color: "#1976D2" },
          { label: "At-Risk", value: overview.atRiskCount, color: "#e65100" },
          { label: "Class Average", value: `${overview.averageScore}%`, color: "#388E3C" },
          { label: "Active Today", value: overview.activeToday, color: "#7B1FA2" }
        ].map(c => `
          <div style="border-radius:10px; padding:14px; text-align:center; background:${c.color}; color:#fff;">
            <div style="font-size:28px; font-weight:800;">${c.value}</div>
            <div style="font-size:12px;">${c.label}</div>
          </div>
        `).join("")}
      </div>

      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:24px;">
        <div style="border:1px solid #ddd; border-radius:8px; padding:12px; text-align:center;">
          <div style="font-size:20px; font-weight:700; color:#2e7d32;">${excellent}</div>
          <div style="font-size:12px; color:#666;">🌟 Excellent (≥90%)</div>
        </div>
        <div style="border:1px solid #ddd; border-radius:8px; padding:12px; text-align:center;">
          <div style="font-size:20px; font-weight:700; color:#388E3C;">${onTrack}</div>
          <div style="font-size:12px; color:#666;">✅ On Track (75–89%)</div>
        </div>
        <div style="border:1px solid #ddd; border-radius:8px; padding:12px; text-align:center;">
          <div style="font-size:20px; font-weight:700; color:#c62828;">${atRisk}</div>
          <div style="font-size:12px; color:#666;">⚠️ At Risk (&lt;75%)</div>
        </div>
      </div>

      <h3 style="margin-bottom:10px; font-size:15px;">Student Roster</h3>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background:#667eea; color:#fff;">
            <th style="padding:9px 10px; text-align:left;">Name</th>
            <th style="padding:9px 10px; text-align:center;">Grade</th>
            <th style="padding:9px 10px; text-align:center;">Score</th>
            <th style="padding:9px 10px; text-align:center;">Status</th>
            <th style="padding:9px 10px; text-align:left;">Parent</th>
            <th style="padding:9px 10px; text-align:left;">Phone</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px; font-size:10px; color:#999; text-align:center;">
        TaraBasa AI — Confidential Student Report — ${now}
      </div>
    </div>
  `;

  window.print();
}

// ─── Panel toggle ─────────────────────────────────────────────────────────────
function toggleStudentPanel() {
  const panel = document.getElementById("students-panel");
  if (!panel) return;
  panel.style.display = panel.style.display === "none" ? "block" : "none";
}

// ─── Expose ───────────────────────────────────────────────────────────────────
window.renderClassOverview = renderClassOverview;
window.renderStudentList = renderStudentList;
window.addStudent = addStudent;
window.editStudent = editStudent;
window.deleteStudentRecord = deleteStudentRecord;
window.importCsvStudents = importCsvStudents;
window.handleCsvFile = handleCsvFile;
window.generateReport = generateReport;
window.toggleStudentPanel = toggleStudentPanel;
window.openStudentDrawer = openStudentDrawer;
window.closeStudentDrawer = closeStudentDrawer;
window.saveStudentDrawer = saveStudentDrawer;
window.switchDrawerTab = switchDrawerTab;
window.loadAvailableStudentsForDrawer = loadAvailableStudentsForDrawer;
window.selectAvailableStudent = selectAvailableStudent;
window.onDrawerSearchInput = onDrawerSearchInput;
