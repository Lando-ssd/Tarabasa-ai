window.addEventListener("DOMContentLoaded", async () => {
  const session = await getSession();
  if (!session || !session.role) {
    window.location.href = "index.html";
    return;
  }

  showRoleDashboard(session.role);
  if (session.role === "teacher") {
    await renderClassOverview();
    await renderStudentList();
    await refreshProgressTracking();
    initTeacherRealtimeDashboard();
  } else if (session.role === "parent") {
    await renderParentDashboard();
    await parentLoadStudents();
  } else if (session.role === "student") {
    await initActionVerbLibrary();
    await refreshProgressTracking();
  } else if (session.role === "admin") {
    await loadAdminOverview();
    await adminLoadUsers();
    await adminLoadConnections();
    if (typeof adminLoadTeacherConnections === 'function') {
      await adminLoadTeacherConnections();
    }
    if (typeof adminLoadPendingStudents === 'function') {
      await adminLoadPendingStudents();
    }
    if (typeof adminLoadDeletionRequests === 'function') {
      await adminLoadDeletionRequests();
    }
  }
});
