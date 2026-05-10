const API_BASE = (() => {
  if (window.location.protocol === "file:") {
    return "http://127.0.0.1:8000";
  }
  const host = window.location.hostname;
  const port = window.location.port;
  const isLocal = host === "127.0.0.1" || host === "localhost";
  if (!isLocal) return "";
  // Static dev servers (no API on this port) — TaraBasa API defaults to port 8000.
  const staticOnlyPorts = new Set(["5500", "5173", "4173"]);
  if (staticOnlyPorts.has(port)) {
    return "http://127.0.0.1:8000";
  }
  return "";
})();

async function apiRequest(path, options = {}) {
  const session = JSON.parse(localStorage.getItem("tb_session") || "null");
  const incomingHeaders = options.headers || {};
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...incomingHeaders,
        ...(session?.email ? { "x-user-email": session.email } : {})
      },
      ...options
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Cannot connect to the TaraBasa server. Start it first with: npm start"
      );
    }
    throw error;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Request failed.");
  }
  return response.status === 204 ? null : response.json();
}

function setSession(user) {
  localStorage.setItem("tb_session", JSON.stringify({
    name: user.name,
    email: user.email,
    role: user.role
  }));
}

async function getSession() {
  const localSession = JSON.parse(localStorage.getItem("tb_session") || "null");
  if (!localSession || !localSession.email) return null;
  try {
    return await apiRequest(`/api/session?email=${encodeURIComponent(localSession.email)}`);
  } catch (_) {
    clearSession();
    return null;
  }
}

function clearSession() {
  localStorage.removeItem("tb_session");
}

async function signupUser(user) {
  return apiRequest("/api/signup", {
    method: "POST",
    body: JSON.stringify(user)
  });
}

async function loginUser(email, password) {
  return apiRequest("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

async function requestPasswordReset(email) {
  return apiRequest("/api/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

async function confirmPasswordReset(email, token, newPassword) {
  return apiRequest("/api/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ email, token, newPassword })
  });
}

async function getTeacherStudents() {
  return apiRequest("/api/teacher-students");
}

async function addTeacherStudent(student) {
  return apiRequest("/api/teacher-students", {
    method: "POST",
    body: JSON.stringify(student)
  });
}

async function updateTeacherStudent(id, student) {
  return apiRequest(`/api/teacher-students/${id}`, {
    method: "PUT",
    body: JSON.stringify(student)
  });
}

async function deleteTeacherStudent(id) {
  return apiRequest(`/api/teacher-students/${id}`, {
    method: "DELETE"
  });
}

async function importTeacherStudentsCsv(csv) {
  return apiRequest("/api/teacher-students/import-csv", {
    method: "POST",
    body: JSON.stringify({ csv })
  });
}

async function getTeacherClassOverview() {
  return apiRequest("/api/teacher/overview");
}

async function getParentOverview() {
  return apiRequest("/api/parent/overview");
}

async function getActionVerbCards() {
  return apiRequest("/api/action-verbs");
}

async function saveVoiceAttempt(attempt) {
  return apiRequest("/api/voice-attempts", {
    method: "POST",
    body: JSON.stringify(attempt)
  });
}

async function getStudentVoiceAttempts() {
  return apiRequest("/api/voice-attempts/student");
}

async function getTeacherVoiceAttempts() {
  return apiRequest("/api/voice-attempts/teacher");
}

async function getTeacherAtRiskAlerts() {
  return apiRequest("/api/teacher/at-risk-alerts");
}
