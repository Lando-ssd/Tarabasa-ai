const apiBase = "http://localhost:3000";

async function request(path, method, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

const registerForm = document.getElementById("register-form");
if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
      role: document.getElementById("role").value
    };

    const status = document.getElementById("status");
    try {
      const result = await request("/register", "POST", payload);
      status.textContent = result.message;
      status.style.color = "green";
    } catch (error) {
      status.textContent = error.message;
      status.style.color = "crimson";
    }
  });
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value
    };

    const status = document.getElementById("status");
    try {
      const result = await request("/login", "POST", payload);
      status.textContent = `${result.message} (${result.user.role})`;
      status.style.color = "green";

      if (result.user.role === "Teacher") {
        window.location.href = "/teacher-dashboard.html";
      } else if (result.user.role === "Parent") {
        window.location.href = "/parent-dashboard.html";
      }
    } catch (error) {
      status.textContent = error.message;
      status.style.color = "crimson";
    }
  });
}
