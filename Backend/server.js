const path = require("path");
const express = require("express");
const cors = require("cors");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "Frontend")));

// Disable caching for API responses to ensure fresh data after create/update/delete
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path === "/register" || req.path === "/login") {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

app.post("/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password, and role are required." });
  }

  // Only allow Teacher and Parent roles
  if (role !== "Teacher" && role !== "Parent") {
    return res.status(400).json({ error: "Invalid role. Only 'Teacher' or 'Parent' are allowed." });
  }

  const query = `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`;
  db.run(query, [name, email, password, role], function onInsert(err) {
    if (err) {
      if (err.message.includes("CHECK constraint failed")) {
        return res.status(400).json({ error: "Invalid role. Use Teacher, Student, or Parent." });
      }
      if (err.message.includes("UNIQUE constraint failed")) {
        return res.status(409).json({ error: "Email is already registered." });
      }
      return res.status(500).json({ error: err.message });
    }

    return res.status(201).json({
      message: "User registered successfully.",
      user: { id: this.lastID, name, email, role }
    });
  });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required." });
  }

  db.get(`SELECT id, name, email, password, role FROM users WHERE email = ?`, [email], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: "User not found." });
    if (user.password !== password) return res.status(401).json({ error: "Invalid password." });

    return res.json({
      message: "Login successful.",
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  });
});

app.post("/students", (req, res) => {
  const { first_name, last_name, grade, parent_name } = req.body;
  if (!first_name || !last_name) {
    return res.status(400).json({ error: "first_name and last_name are required." });
  }

  const query = `INSERT INTO students (first_name, last_name, grade, parent_name) VALUES (?, ?, ?, ?)`;
  db.run(query, [first_name, last_name, grade || null, parent_name || null], function onInsert(err) {
    if (err) return res.status(500).json({ error: err.message });
    return res.status(201).json({
      message: "Student created.",
      student: { id: this.lastID, first_name, last_name, grade: grade || null, parent_name: parent_name || null }
    });
  });
});

app.get("/students", (_, res) => {
  db.all(`SELECT * FROM students ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    return res.json(rows);
  });
});

app.get("/students/:id", (req, res) => {
  db.get(`SELECT * FROM students WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Student not found." });
    return res.json(row);
  });
});

app.put("/students/:id", (req, res) => {
  const { first_name, last_name, grade, parent_name } = req.body;
  if (!first_name || !last_name) {
    return res.status(400).json({ error: "first_name and last_name are required." });
  }

  const query = `
    UPDATE students
    SET first_name = ?, last_name = ?, grade = ?, parent_name = ?
    WHERE id = ?
  `;
  db.run(query, [first_name, last_name, grade || null, parent_name || null, req.params.id], function onUpdate(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Student not found." });
    return res.json({ message: "Student updated successfully." });
  });
});

app.delete("/students/:id", (req, res) => {
  db.run(`DELETE FROM students WHERE id = ?`, [req.params.id], function onDelete(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Student not found." });
    return res.json({ message: "Student deleted successfully." });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
