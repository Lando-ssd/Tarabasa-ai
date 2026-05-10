function showRoleDashboard(role) {
  const ids = ["teacher-dashboard", "student-home", "parent-dashboard", "admin-dashboard"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
  });

  if (role === "teacher") document.getElementById("teacher-dashboard").classList.add("active");
  else if (role === "student") document.getElementById("student-home").classList.add("active");
  else if (role === "parent") document.getElementById("parent-dashboard").classList.add("active");
  else if (role === "admin") document.getElementById("admin-dashboard").classList.add("active");
  else {
    clearSession();
    window.location.href = "index.html";
  }
}

function logoutUser() {
  clearSession();
  window.location.href = "index.html";
}

window.logoutUser = logoutUser;
window.showRoleDashboard = showRoleDashboard;
