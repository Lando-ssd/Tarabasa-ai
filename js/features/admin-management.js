// ─── Admin Overview ────────────────────────────────────────────────────────
async function loadAdminOverview() {
  try {
    const data = await apiRequest("/api/admin/overview");
    document.getElementById("admin-total-users").textContent = data.totalUsers;
    document.getElementById("admin-teachers-count").textContent = data.teachers;
    document.getElementById("admin-students-count").textContent = data.students;
    document.getElementById("admin-parents-count").textContent = data.parents;

    document.getElementById("admin-overview-stats").innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
        <div style="padding: 12px; background: #f5f5f5; border-radius: 6px;">
          <strong>Student Records:</strong> ${data.studentRecords}
        </div>
        <div style="padding: 12px; background: #f5f5f5; border-radius: 6px;">
          <strong>Voice Attempts:</strong> ${data.voiceAttempts}
        </div>
        <div style="padding: 12px; background: #f5f5f5; border-radius: 6px;">
          <strong>At-Risk Students:</strong> ${data.atRiskStudents}
        </div>
        <div style="padding: 12px; background: #f5f5f5; border-radius: 6px;">
          <strong>Average Score:</strong> ${data.averageScore}%
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Error loading admin overview:", err);
    document.getElementById("admin-overview-stats").innerHTML =
      `<div class="history-empty">Could not load overview.</div>`;
  }
}

// ─── User Management ────────────────────────────────────────────────────────
function adminToggleCreateUser() {
  const form = document.getElementById("admin-create-user-form");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function adminCreateUser() {
  const name = document.getElementById("admin-create-name").value.trim();
  const email = document.getElementById("admin-create-email").value.trim().toLowerCase();
  const password = document.getElementById("admin-create-password").value;
  const role = document.getElementById("admin-create-role").value;

  if (!name || !email || !password || !role) {
    alert("Please fill all fields.");
    return;
  }

  try {
    await apiRequest("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ name, email, password, role })
    });
    alert("✅ User created successfully!");
    adminToggleCreateUser();
    document.getElementById("admin-create-name").value = "";
    document.getElementById("admin-create-email").value = "";
    document.getElementById("admin-create-password").value = "";
    await adminLoadUsers();
  } catch (err) {
    alert("❌ Error: " + (err.message || "Could not create user."));
  }
}

async function adminLoadUsers() {
  const search = document.getElementById("admin-user-search").value.toLowerCase();
  const roleFilter = document.getElementById("admin-role-filter").value;

  try {
    const data = await apiRequest("/api/admin/users");
    let users = data.users;

    if (search) {
      users = users.filter(u =>
        u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)
      );
    }

    const rolesOrder = ["admin", "teacher", "student", "parent"];
    const roleColors = {
      admin: "#D32F2F",
      teacher: "#1976D2",
      student: "#388E3C",
      parent: "#7B1FA2"
    };
    
    const studentsData = data.students;

    let listHtml = "";

    rolesOrder.forEach(roleKey => {
      if (roleFilter && roleFilter !== roleKey) return;
      
      const roleUsers = users.filter(u => u.role === roleKey);
      if (roleUsers.length === 0) return;

      const color = roleColors[roleKey];
      const roleName = roleKey.charAt(0).toUpperCase() + roleKey.slice(1) + "s";

      listHtml += `<h4 style="margin-top:20px; margin-bottom:10px; color:${color}; border-bottom:1px solid #ddd; padding-bottom:5px;">${roleName} (${roleUsers.length})</h4>`;

      roleUsers.forEach(user => {
        const studentInfo = studentsData.find(s => s.name === user.name);
        const details = studentInfo
          ? `Grade: ${studentInfo.grade}, Score: ${studentInfo.score}%`
          : "";

        listHtml += `
          <div style="
            padding: 12px 16px; margin: 8px 0;
            background: #fafafa;
            border-left: 4px solid ${color};
            border-radius: 6px;
            display:flex; justify-content:space-between; align-items:center;
          ">
            <div id="user-display-${user.id}" style="flex:1;">
              <strong>#${user.id} — ${user.name}</strong>
              <span style="color:#666; margin-left:8px; font-size:0.9em;">(${user.email})</span><br>
              ${details ? `<span style="color:#888; font-size:0.85em;">${details}</span>` : ""}
            </div>
            
            <div id="user-edit-${user.id}" style="display:none; flex:1; margin-right:15px;">
              <input id="user-edit-name-${user.id}" type="text" value="${user.name}" class="auth-input compact-input" style="width:100%; margin-bottom:4px;" placeholder="Name">
              <input id="user-edit-email-${user.id}" type="email" value="${user.email}" class="auth-input compact-input" style="width:100%; margin-bottom:4px;" placeholder="Email">
              <input id="user-edit-password-${user.id}" type="password" class="auth-input compact-input" style="width:100%; margin-bottom:4px;" placeholder="New Password (optional)">
              <select id="user-edit-role-${user.id}" class="auth-select compact-input" style="width:100%;">
                <option value="student" ${user.role==='student'?'selected':''}>Student</option>
                <option value="teacher" ${user.role==='teacher'?'selected':''}>Teacher</option>
                <option value="parent" ${user.role==='parent'?'selected':''}>Parent</option>
                <option value="admin" ${user.role==='admin'?'selected':''}>Admin</option>
              </select>
            </div>

            <div id="user-actions-${user.id}">
              <button class="btn btn-info" style="font-size:0.78em; padding:5px 12px; margin-right:6px;" onclick="adminStartEditUser(${user.id})">✏️ Edit</button>
              <button class="btn btn-warning" style="font-size:0.78em; padding:5px 12px;" onclick="adminDeleteUser(${user.id}, '${user.name}')">🗑️ Delete</button>
            </div>

            <div id="user-save-actions-${user.id}" style="display:none;">
              <button class="btn btn-success" style="font-size:0.78em; padding:5px 12px; margin-right:6px;" onclick="adminSaveEditUser(${user.id})">💾 Save</button>
              <button class="btn" style="font-size:0.78em; padding:5px 12px; background:#e0e0e0; color:#333;" onclick="adminCancelEditUser(${user.id})">✕ Cancel</button>
            </div>
          </div>
        `;
      });
    });

    document.getElementById("admin-users-list").innerHTML =
      listHtml || `<div class='history-empty'>No users found.</div>`;
  } catch (err) {
    console.error("Error loading users:", err);
    document.getElementById("admin-users-list").innerHTML =
      `<div class="history-empty">Error loading users.</div>`;
  }
}

function adminStartEditUser(id) {
  document.getElementById(`user-display-${id}`).style.display = "none";
  document.getElementById(`user-actions-${id}`).style.display = "none";
  document.getElementById(`user-edit-${id}`).style.display = "block";
  document.getElementById(`user-save-actions-${id}`).style.display = "block";
}

function adminCancelEditUser(id) {
  document.getElementById(`user-display-${id}`).style.display = "block";
  document.getElementById(`user-actions-${id}`).style.display = "block";
  document.getElementById(`user-edit-${id}`).style.display = "none";
  document.getElementById(`user-save-actions-${id}`).style.display = "none";
}

async function adminSaveEditUser(id) {
  const name = document.getElementById(`user-edit-name-${id}`).value.trim();
  const email = document.getElementById(`user-edit-email-${id}`).value.trim().toLowerCase();
  const password = document.getElementById(`user-edit-password-${id}`).value;
  const role = document.getElementById(`user-edit-role-${id}`).value;

  if (!name || !email || !role) {
    alert("Name, email, and role are required.");
    return;
  }

  try {
    await apiRequest(`/api/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name, email, password, role })
    });
    alert("✅ User updated successfully!");
    await adminLoadUsers();
  } catch (err) {
    alert("❌ Error: " + (err.message || "Could not update user."));
  }
}

async function adminDeleteUser(id, name) {
  if (!confirm(`Are you sure you want to completely delete the user "${name}"? This action cannot be undone.`)) {
    return;
  }

  try {
    await apiRequest(`/api/admin/users/${id}`, { method: "DELETE" });
    alert(`✅ User "${name}" deleted.`);
    await adminLoadUsers();
  } catch (err) {
    alert("❌ Error: " + (err.message || "Could not delete user."));
  }
}

// ─── Teacher ↔ Student connection ──────────────────────────────────────────
async function adminConnectTeacherStudent() {
  const teacherEmail = document.getElementById("admin-teacher-email").value.trim().toLowerCase();
  const studentEmail = document.getElementById("admin-student-email").value.trim().toLowerCase();

  if (!teacherEmail || !studentEmail) {
    alert("Please enter both Teacher Email and Student Email.");
    return;
  }

  try {
    await apiRequest("/api/admin/connect-teacher-student", {
      method: "POST",
      body: JSON.stringify({ teacherEmail, studentEmail })
    });
    alert("✅ Teacher connected to student successfully!");
    document.getElementById("admin-teacher-email").value = "";
    document.getElementById("admin-student-email").value = "";
    await adminLoadTeacherConnections();
  } catch (err) {
    alert("❌ Error: " + (err.message || "Could not connect teacher to student."));
  }
}

// ─── Teacher Connections CRUD ──────────────────────────────────────────────

async function adminLoadTeacherConnections() {
  const container = document.getElementById("admin-teacher-connections-list");
  if (!container) return;
  container.innerHTML = `<div style="color:#aaa; text-align:center; padding:16px;">Loading...</div>`;

  try {
    const data = await apiRequest("/api/admin/teacher-connections");
    const connections = data.connections;

    if (!connections.length) {
      container.innerHTML = `
        <div style="text-align:center; color:#aaa; padding:24px;">
          <div style="font-size:2em; margin-bottom:8px;">👨‍🏫</div>
          No teacher-student connections yet.
        </div>`;
      return;
    }

    const rows = connections.map(c => {
      const riskBadge = c.needsHelp
        ? `<span style="background:#ffebee;color:#c62828;padding:2px 8px;border-radius:999px;font-size:0.78em;font-weight:600;">⚠️ At Risk</span>`
        : `<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:999px;font-size:0.78em;font-weight:600;">✅ On Track</span>`;

      return `
        <tr id="tconn-row-${c.id}" style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 8px;">
            <div style="font-weight:600;">${c.studentName}</div>
            <div style="font-size:0.8em;color:#888;">${c.studentEmail || "—"}</div>
          </td>
          <td style="padding:10px 8px; text-align:center; font-size:0.88em;">Grade ${c.grade}</td>
          <td style="padding:10px 8px; text-align:center;">${c.score}% ${riskBadge}</td>
          <td style="padding:10px 8px;">
            <div id="tconn-display-${c.id}">
              <div style="font-weight:600;">${c.teacherName || "—"}</div>
              <div style="font-size:0.8em;color:#888;">${c.teacherEmail}</div>
            </div>
            <div id="tconn-edit-${c.id}" style="display:none;">
              <input
                id="tconn-edit-input-${c.id}"
                type="email"
                value="${c.teacherEmail}"
                placeholder="New teacher email"
                class="auth-input compact-input"
                style="width:100%; font-size:0.85em;"
              >
            </div>
          </td>
          <td style="padding:10px 8px; text-align:right; white-space:nowrap;">
            <div id="tconn-actions-${c.id}">
              <button
                class="btn btn-info"
                style="font-size:0.78em; padding:5px 12px; margin-right:6px;"
                onclick="adminStartEditTeacherConnection(${c.id})"
              >✏️ Edit</button>
              <button
                class="btn btn-warning"
                style="font-size:0.78em; padding:5px 12px;"
                onclick="adminDeleteTeacherConnection(${c.id}, '${c.studentName}')"
              >🗑️ Disconnect</button>
            </div>
            <div id="tconn-save-actions-${c.id}" style="display:none;">
              <button
                class="btn btn-success"
                style="font-size:0.78em; padding:5px 12px; margin-right:6px;"
                onclick="adminSaveEditTeacherConnection(${c.id})"
              >💾 Save</button>
              <button
                class="btn"
                style="font-size:0.78em; padding:5px 12px; background:#e0e0e0; color:#333;"
                onclick="adminCancelEditTeacherConnection(${c.id}, '${c.teacherEmail}', '${c.teacherName || ''}')"
              >✕ Cancel</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    container.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.9em;">
          <thead>
            <tr style="background:#f5f7ff; text-align:left;">
              <th style="padding:10px 8px; color:#444;">Student</th>
              <th style="padding:10px 8px; color:#444; text-align:center;">Grade</th>
              <th style="padding:10px 8px; color:#444; text-align:center;">Score</th>
              <th style="padding:10px 8px; color:#444;">Linked Teacher</th>
              <th style="padding:10px 8px; color:#444; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:8px; font-size:0.8em; color:#aaa; text-align:right;">
        ${connections.length} connection${connections.length !== 1 ? "s" : ""} total
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="history-empty">Error loading teacher connections: ${err.message}</div>`;
  }
}

function adminStartEditTeacherConnection(id) {
  document.getElementById(`tconn-display-${id}`).style.display = "none";
  document.getElementById(`tconn-edit-${id}`).style.display = "block";
  document.getElementById(`tconn-actions-${id}`).style.display = "none";
  document.getElementById(`tconn-save-actions-${id}`).style.display = "block";
  document.getElementById(`tconn-edit-input-${id}`).focus();
}

function adminCancelEditTeacherConnection(id, originalEmail, originalName) {
  document.getElementById(`tconn-display-${id}`).style.display = "block";
  document.getElementById(`tconn-edit-${id}`).style.display = "none";
  document.getElementById(`tconn-actions-${id}`).style.display = "block";
  document.getElementById(`tconn-save-actions-${id}`).style.display = "none";
  document.getElementById(`tconn-edit-input-${id}`).value = originalEmail;
}

async function adminSaveEditTeacherConnection(id) {
  const newTeacherEmail = document.getElementById(`tconn-edit-input-${id}`).value.trim().toLowerCase();
  if (!newTeacherEmail) {
    alert("Please enter a valid teacher email.");
    return;
  }

  const saveBtn = document.querySelector(`#tconn-save-actions-${id} button`);
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }

  try {
    await apiRequest(`/api/admin/teacher-connections/${id}`, {
      method: "PUT",
      body: JSON.stringify({ teacherEmail: newTeacherEmail })
    });
    alert("✅ Teacher connection updated!");
    await adminLoadTeacherConnections();
  } catch (err) {
    alert("❌ Error: " + (err.message || "Could not update teacher connection."));
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "💾 Save"; }
  }
}

async function adminDeleteTeacherConnection(id, studentName) {
  if (!confirm(`Disconnect "${studentName}" from their teacher?`)) {
    return;
  }

  try {
    await apiRequest(`/api/admin/teacher-connections/${id}`, { method: "DELETE" });
    alert(`✅ ${studentName} disconnected from teacher.`);
    await adminLoadTeacherConnections();
  } catch (err) {
    alert("❌ Error: " + (err.message || "Could not disconnect."));
  }
}

// ─── Student ↔ Parent CRUD ─────────────────────────────────────────────────

// CREATE — connect student to parent
async function adminConnectStudentParent() {
  const studentEmail = document.getElementById("admin-student-email-connect").value.trim().toLowerCase();
  const parentEmail = document.getElementById("admin-parent-email").value.trim().toLowerCase();

  if (!studentEmail || !parentEmail) {
    alert("Please enter both Student Email and Parent Email.");
    return;
  }

  const btn = document.getElementById("admin-connect-btn");
  btn.disabled = true;
  btn.textContent = "Connecting...";

  try {
    await apiRequest("/api/admin/connect-student-parent", {
      method: "POST",
      body: JSON.stringify({ studentEmail, parentEmail })
    });
    document.getElementById("admin-student-email-connect").value = "";
    document.getElementById("admin-parent-email").value = "";
    showConnectionFeedback("✅ Connected successfully!", "success");
    await adminLoadConnections();
  } catch (err) {
    showConnectionFeedback("❌ " + (err.message || "Could not connect."), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "➕ Connect";
  }
}

function showConnectionFeedback(msg, type) {
  const el = document.getElementById("admin-connections-list");
  const banner = document.createElement("div");
  banner.style.cssText = `
    padding:10px 14px; border-radius:6px; margin-bottom:10px;
    background:${type === "success" ? "#e8f5e9" : "#ffebee"};
    color:${type === "success" ? "#2e7d32" : "#c62828"};
    border:1px solid ${type === "success" ? "#c8e6c9" : "#ffcdd2"};
    font-weight:600; font-size:0.9em;
  `;
  banner.textContent = msg;
  el.prepend(banner);
  setTimeout(() => banner.remove(), 4000);
}

// READ — load and render all connections
async function adminLoadConnections() {
  const container = document.getElementById("admin-connections-list");
  container.innerHTML = `<div style="color:#aaa; text-align:center; padding:16px;">Loading...</div>`;

  try {
    const data = await apiRequest("/api/admin/connections");
    const connections = data.connections;

    if (!connections.length) {
      container.innerHTML = `
        <div style="text-align:center; color:#aaa; padding:24px;">
          <div style="font-size:2em; margin-bottom:8px;">🔗</div>
          No student-parent connections yet. Use the form above to create one.
        </div>`;
      return;
    }

    const rows = connections.map(c => {
      const riskBadge = c.needsHelp
        ? `<span style="background:#ffebee;color:#c62828;padding:2px 8px;border-radius:999px;font-size:0.78em;font-weight:600;">⚠️ At Risk</span>`
        : `<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:999px;font-size:0.78em;font-weight:600;">✅ On Track</span>`;

      return `
        <tr id="conn-row-${c.id}" style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 8px;">
            <div style="font-weight:600;">${c.studentName}</div>
            <div style="font-size:0.8em;color:#888;">${c.studentEmail || "—"}</div>
          </td>
          <td style="padding:10px 8px; text-align:center; font-size:0.88em;">Grade ${c.grade}</td>
          <td style="padding:10px 8px; text-align:center;">${c.score}% ${riskBadge}</td>
          <td style="padding:10px 8px;">
            <div id="conn-display-${c.id}">
              <div style="font-weight:600;">${c.parentName || "—"}</div>
              <div style="font-size:0.8em;color:#888;">${c.parentEmail}</div>
            </div>
            <div id="conn-edit-${c.id}" style="display:none;">
              <input
                id="conn-edit-input-${c.id}"
                type="email"
                value="${c.parentEmail}"
                placeholder="New parent email"
                class="auth-input compact-input"
                style="width:100%; font-size:0.85em;"
              >
            </div>
          </td>
          <td style="padding:10px 8px; text-align:right; white-space:nowrap;">
            <div id="conn-actions-${c.id}">
              <button
                class="btn btn-info"
                style="font-size:0.78em; padding:5px 12px; margin-right:6px;"
                onclick="adminStartEditConnection(${c.id})"
              >✏️ Edit</button>
              <button
                class="btn btn-warning"
                style="font-size:0.78em; padding:5px 12px;"
                onclick="adminDeleteConnection(${c.id}, '${c.studentName}')"
              >🗑️ Disconnect</button>
            </div>
            <div id="conn-save-actions-${c.id}" style="display:none;">
              <button
                class="btn btn-success"
                style="font-size:0.78em; padding:5px 12px; margin-right:6px;"
                onclick="adminSaveEditConnection(${c.id})"
              >💾 Save</button>
              <button
                class="btn"
                style="font-size:0.78em; padding:5px 12px; background:#e0e0e0; color:#333;"
                onclick="adminCancelEditConnection(${c.id}, '${c.parentEmail}', '${c.parentName || ''}')"
              >✕ Cancel</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    container.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.9em;">
          <thead>
            <tr style="background:#f5f7ff; text-align:left;">
              <th style="padding:10px 8px; color:#444;">Student</th>
              <th style="padding:10px 8px; color:#444; text-align:center;">Grade</th>
              <th style="padding:10px 8px; color:#444; text-align:center;">Score</th>
              <th style="padding:10px 8px; color:#444;">Linked Parent</th>
              <th style="padding:10px 8px; color:#444; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:8px; font-size:0.8em; color:#aaa; text-align:right;">
        ${connections.length} connection${connections.length !== 1 ? "s" : ""} total
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="history-empty">Error loading connections: ${err.message}</div>`;
  }
}

// UPDATE — start editing a connection row
function adminStartEditConnection(id) {
  document.getElementById(`conn-display-${id}`).style.display = "none";
  document.getElementById(`conn-edit-${id}`).style.display = "block";
  document.getElementById(`conn-actions-${id}`).style.display = "none";
  document.getElementById(`conn-save-actions-${id}`).style.display = "block";
  document.getElementById(`conn-edit-input-${id}`).focus();
}

// UPDATE — cancel editing
function adminCancelEditConnection(id, originalEmail, originalName) {
  document.getElementById(`conn-display-${id}`).style.display = "block";
  document.getElementById(`conn-edit-${id}`).style.display = "none";
  document.getElementById(`conn-actions-${id}`).style.display = "block";
  document.getElementById(`conn-save-actions-${id}`).style.display = "none";
  document.getElementById(`conn-edit-input-${id}`).value = originalEmail;
}

// UPDATE — save the edited parent email
async function adminSaveEditConnection(id) {
  const newParentEmail = document.getElementById(`conn-edit-input-${id}`).value.trim().toLowerCase();
  if (!newParentEmail) {
    alert("Please enter a valid parent email.");
    return;
  }

  const saveBtn = document.querySelector(`#conn-save-actions-${id} button`);
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }

  try {
    await apiRequest(`/api/admin/connections/${id}`, {
      method: "PUT",
      body: JSON.stringify({ parentEmail: newParentEmail })
    });
    showConnectionFeedback("✅ Connection updated!", "success");
    await adminLoadConnections();
  } catch (err) {
    alert("❌ Error: " + (err.message || "Could not update connection."));
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "💾 Save"; }
  }
}

// DELETE — disconnect student from parent
async function adminDeleteConnection(id, studentName) {
  if (!confirm(`Disconnect "${studentName}" from their parent? The parent will no longer see this student's progress.`)) {
    return;
  }

  try {
    await apiRequest(`/api/admin/connections/${id}`, { method: "DELETE" });
    showConnectionFeedback(`✅ ${studentName} disconnected from parent.`, "success");
    await adminLoadConnections();
  } catch (err) {
    alert("❌ Error: " + (err.message || "Could not disconnect."));
  }
}

// ─── Expose to global scope ─────────────────────────────────────────────────
window.loadAdminOverview = loadAdminOverview;
window.adminLoadUsers = adminLoadUsers;
window.adminConnectTeacherStudent = adminConnectTeacherStudent;
window.adminConnectStudentParent = adminConnectStudentParent;
window.adminLoadConnections = adminLoadConnections;
window.adminStartEditConnection = adminStartEditConnection;
window.adminCancelEditConnection = adminCancelEditConnection;
window.adminSaveEditConnection = adminSaveEditConnection;
window.adminDeleteConnection = adminDeleteConnection;
window.adminLoadTeacherConnections = adminLoadTeacherConnections;
window.adminStartEditTeacherConnection = adminStartEditTeacherConnection;
window.adminCancelEditTeacherConnection = adminCancelEditTeacherConnection;
window.adminSaveEditTeacherConnection = adminSaveEditTeacherConnection;
window.adminDeleteTeacherConnection = adminDeleteTeacherConnection;
window.adminToggleCreateUser = adminToggleCreateUser;
window.adminCreateUser = adminCreateUser;
window.adminStartEditUser = adminStartEditUser;
window.adminCancelEditUser = adminCancelEditUser;
window.adminSaveEditUser = adminSaveEditUser;
window.adminDeleteUser = adminDeleteUser;
