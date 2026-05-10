const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { Op } = require("sequelize");
const {
  sequelize,
  User,
  Student,
  Score,
  VerbActivity,
  PasswordResetToken,
  VoiceAttempt
} = require("./models");

const app = express();
const PORT = 8000;
const VALID_ROLES = new Set(["teacher", "student", "parent"]);
const ACTION_VERBS = [
  "run", "jump", "walk", "read", "write", "sing", "dance", "eat", "drink", "sleep",
  "talk", "listen", "draw", "paint", "build", "play", "clap", "laugh", "smile", "swim",
  "kick", "throw", "catch", "open", "close", "push", "pull", "carry", "wash", "clean",
  "cook", "bake", "drive", "ride", "learn", "teach", "help", "share", "count", "think",
  "watch", "create", "explore", "climb", "crawl", "skip", "hop", "whisper", "shout", "point",
  "fold", "plant", "dig", "arrange", "measure", "discover"
];

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `pbkdf2$${salt}$${hash}`;
}

function verifyPassword(rawPassword, storedPassword) {
  if (!storedPassword.includes("$")) {
    return rawPassword === storedPassword;
  }

  const parts = storedPassword.split("$");
  if (parts.length !== 3 || parts[0] !== "pbkdf2") return false;
  const [, salt, originalHash] = parts;
  const hash = crypto.pbkdf2Sync(rawPassword, salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(originalHash, "hex"));
}

async function getUserByHeader(req) {
  const email = String(req.headers["x-user-email"] || "").trim().toLowerCase();
  if (!email) return null;
  return User.findOne({
    where: { email },
    attributes: ["id", "name", "email", "role"]
  });
}

async function initDb() {
  const shouldAlterSchema = String(process.env.DB_ALTER || "").toLowerCase() === "true";

  if (shouldAlterSchema) {
    try {
      await sequelize.sync({ alter: true });
    } catch (error) {
      // SQLite alter can fail if a stale backup table already has duplicate PK values.
      if (error?.original?.code === "SQLITE_CONSTRAINT") {
        await sequelize.sync();
      } else {
        throw error;
      }
    }
  } else {
    await sequelize.sync();
  }

  const studentCount = await Student.count();
  if (studentCount === 0) {
    await Student.bulkCreate([
      {
        name: "Juan Dela Cruz",
        grade: "3",
        parentName: "Ana Dela Cruz",
        parentPhone: "+63 900 111 2233",
        parentEmail: "parent.test@example.com",
        score: 86,
        needsHelp: false,
        lastActiveAt: new Date()
      },
      {
        name: "Maria Reyes",
        grade: "2",
        parentName: "Celia Reyes",
        parentPhone: "+63 900 111 2244",
        parentEmail: "parent.test@example.com",
        score: 62,
        needsHelp: true,
        lastActiveAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
      },
      {
        name: "Pedro Garcia",
        grade: "3",
        parentName: "Luis Garcia",
        parentPhone: "+63 900 111 2255",
        parentEmail: "other.parent@example.com",
        score: 93,
        needsHelp: false,
        lastActiveAt: new Date()
      }
    ]);
  }

  const activityCount = await VerbActivity.count();
  if (activityCount === 0) {
    await VerbActivity.bulkCreate([
      { title: "Read Story", category: "reading", description: "Weekly guided reading" },
      { title: "Letter Sounds", category: "phonics", description: "Practice letter sounds" },
      { title: "Thinking Games", category: "logic", description: "Critical thinking activities" }
    ]);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/session", async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    const user = await User.findOne({
      where: { email },
      attributes: ["name", "email", "role"]
    });
    if (!user) return res.status(404).json({ error: "Session user not found." });
    return res.json(user.toJSON());
  } catch {
    return res.status(500).json({ error: "Could not load session." });
  }
});

app.post("/api/signup", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "").trim();

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Please complete all fields." });
  }
  if (!VALID_ROLES.has(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    const existing = await User.findOne({ where: { email }, attributes: ["id"] });
    if (existing) return res.status(409).json({ error: "This email is already registered." });

    await User.create({ name, email, password: hashPassword(password), role });
    return res.status(201).json({ name, email, role });
  } catch {
    return res.status(500).json({ error: "Sign up failed." });
  }
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  try {
    const user = await User.findOne({
      where: { email },
      attributes: ["id", "name", "email", "role", "password"]
    });
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (!user.password.includes("$")) {
      await user.update({ password: hashPassword(password) });
    }

    return res.json({ name: user.name, email: user.email, role: user.role });
  } catch {
    return res.status(500).json({ error: "Login failed." });
  }
});

app.post("/api/password-reset/request", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Email is required." });

  try {
    const user = await User.findOne({ where: { email }, attributes: ["id"] });
    if (!user) return res.json({ message: "If the email exists, a reset code was generated." });

    const token = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 15 * 60 * 1000;
    await PasswordResetToken.upsert({ email, token, expiresAt });
    // Demo only: returns the reset code directly (no email provider configured).
    return res.json({ message: "Reset code generated.", resetCode: token });
  } catch {
    return res.status(500).json({ error: "Could not request password reset." });
  }
});

app.post("/api/password-reset/confirm", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const token = String(req.body?.token || "").trim();
  const newPassword = String(req.body?.newPassword || "");
  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: "Email, code, and new password are required." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    const record = await PasswordResetToken.findOne({
      where: { email },
      attributes: ["token", "expiresAt"]
    });
    if (!record || record.token !== token || Number(record.expiresAt) < Date.now()) {
      return res.status(400).json({ error: "Invalid or expired reset code." });
    }

    await User.update({ password: hashPassword(newPassword) }, { where: { email } });
    await PasswordResetToken.destroy({ where: { email } });
    return res.json({ message: "Password reset successful." });
  } catch {
    return res.status(500).json({ error: "Could not reset password." });
  }
});

app.get("/api/teacher-students", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "teacher") {
    return res.status(403).json({ error: "Teacher access required." });
  }

  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    const grade = String(req.query.grade || "").trim();
    const atRisk = String(req.query.atRisk || "").trim().toLowerCase();
    const where = {};
    if (q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { parentName: { [Op.like]: `%${q}%` } }
      ];
    }
    if (grade) {
      where.grade = grade;
    }
    if (atRisk === "true") {
      where.needsHelp = true;
    } else if (atRisk === "false") {
      where.needsHelp = false;
    }

    const students = await Student.findAll({
      where,
      order: [["id", "ASC"]],
      attributes: [
        "id",
        "name",
        "grade",
        "parentName",
        "parentPhone",
        "parentEmail",
        "score",
        "needsHelp",
        "lastActiveAt"
      ]
    });
    return res.json(students.map((student) => student.toJSON()));
  } catch {
    return res.status(500).json({ error: "Could not load students." });
  }
});

app.post("/api/teacher-students", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "teacher") {
    return res.status(403).json({ error: "Teacher access required." });
  }

  const name = String(req.body?.name || "").trim();
  const grade = String(req.body?.grade || "").trim() || "1";
  const parentName = String(req.body?.parentName || "").trim();
  const parentPhone = String(req.body?.parentPhone || "").trim();
  const parentEmailRaw = String(req.body?.parentEmail || "").trim().toLowerCase();
  const parentEmail = parentEmailRaw || null;
  const score = Number(req.body?.score);
  const scoreInt = Math.round(score);
  const isActiveToday = Boolean(req.body?.isActiveToday);
  const lastActiveAt = isActiveToday ? new Date() : null;

  if (!name || Number.isNaN(scoreInt) || scoreInt < 0 || scoreInt > 100) {
    return res.status(400).json({ error: "Invalid student data." });
  }

  const needsHelp = scoreInt < 75 ? 1 : 0;
  try {
    const created = await Student.create({
      name,
      grade,
      parentName: parentName || null,
      parentPhone: parentPhone || null,
      parentEmail,
      score: scoreInt,
      needsHelp: Boolean(needsHelp),
      lastActiveAt
    });
    return res.status(201).json(created.toJSON());
  } catch {
    return res.status(500).json({ error: "Could not save student." });
  }
});

app.put("/api/teacher-students/:id", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "teacher") {
    return res.status(403).json({ error: "Teacher access required." });
  }

  const id = Number(req.params.id);
  const name = String(req.body?.name || "").trim();
  const grade = String(req.body?.grade || "").trim() || "1";
  const parentName = String(req.body?.parentName || "").trim();
  const parentPhone = String(req.body?.parentPhone || "").trim();
  const parentEmailRaw = String(req.body?.parentEmail || "").trim().toLowerCase();
  const parentEmail = parentEmailRaw || null;
  const score = Number(req.body?.score);
  const scoreInt = Math.round(score);
  const isActiveToday = Boolean(req.body?.isActiveToday);

  if (!id || !name || Number.isNaN(scoreInt) || scoreInt < 0 || scoreInt > 100) {
    return res.status(400).json({ error: "Invalid student data." });
  }

  try {
    const student = await Student.findByPk(id);
    if (!student) return res.status(404).json({ error: "Student not found." });

    await student.update({
      name,
      grade,
      parentName: parentName || null,
      parentPhone: parentPhone || null,
      parentEmail,
      score: scoreInt,
      needsHelp: scoreInt < 75,
      lastActiveAt: isActiveToday ? new Date() : null
    });
    return res.json(student.toJSON());
  } catch {
    return res.status(500).json({ error: "Could not update student." });
  }
});

app.delete("/api/teacher-students/:id", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "teacher") {
    return res.status(403).json({ error: "Teacher access required." });
  }

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid student id." });
  try {
    const deleted = await Student.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ error: "Student not found." });
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: "Could not delete student." });
  }
});

app.post("/api/teacher-students/import-csv", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "teacher") {
    return res.status(403).json({ error: "Teacher access required." });
  }

  const csv = String(req.body?.csv || "");
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return res.status(400).json({ error: "CSV must include header and rows." });
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const required = ["name", "grade", "parentphone", "parentemail", "score"];
  if (!required.every((key) => headers.includes(key))) {
    return res.status(400).json({ error: "CSV headers must include name, grade, parentPhone, parentEmail, score." });
  }

  const getValue = (parts, key) => {
    const idx = headers.indexOf(key);
    return idx >= 0 ? String(parts[idx] || "").trim() : "";
  };

  const rows = lines.slice(1).map((line) => line.split(","));
  const createPayload = rows.map((parts) => {
    const score = Math.round(Number(getValue(parts, "score")));
    return {
      name: getValue(parts, "name"),
      grade: getValue(parts, "grade") || "1",
      parentName: getValue(parts, "parentname") || null,
      parentPhone: getValue(parts, "parentphone") || null,
      parentEmail: getValue(parts, "parentemail") || null,
      score: Number.isNaN(score) ? 0 : Math.max(0, Math.min(100, score)),
      needsHelp: Number.isNaN(score) ? true : score < 75,
      lastActiveAt: new Date()
    };
  }).filter((row) => row.name);

  if (!createPayload.length) {
    return res.status(400).json({ error: "No valid student rows found." });
  }

  try {
    const created = await Student.bulkCreate(createPayload);
    return res.status(201).json({ imported: created.length });
  } catch {
    return res.status(500).json({ error: "Could not import CSV." });
  }
});

app.get("/api/teacher/overview", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "teacher") {
    return res.status(403).json({ error: "Teacher access required." });
  }

  try {
    const students = await Student.findAll({ attributes: ["score", "needsHelp", "lastActiveAt"] });
    const totalStudents = students.length;
    const atRiskCount = students.filter((s) => s.needsHelp).length;
    const averageScore = totalStudents
      ? Math.round(students.reduce((sum, s) => sum + Number(s.score || 0), 0) / totalStudents)
      : 0;
    const activeToday = students.filter((s) => {
      if (!s.lastActiveAt) return false;
      const d = new Date(s.lastActiveAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    return res.json({
      totalStudents,
      atRiskCount,
      averageScore,
      activeToday
    });
  } catch {
    return res.status(500).json({ error: "Could not load class overview." });
  }
});

app.get("/api/parent/overview", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "parent") {
    return res.status(403).json({ error: "Parent access required." });
  }

  try {
    const children = await Student.findAll({
      where: { parentEmail: authUser.email },
      attributes: ["id", "name", "grade", "score", "needsHelp"]
    });
    const childIds = children.map((child) => child.id);
    const scores = childIds.length
      ? await Score.findAll({
        where: { studentId: { [Op.in]: childIds } },
        attributes: ["id", "studentId", "points", "notes", "createdAt"]
      })
      : [];

    const weeklyActivities = scores
      .filter((s) => Date.now() - new Date(s.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000)
      .length;
    const avgChildScore = children.length
      ? Math.round(children.reduce((sum, child) => sum + Number(child.score || 0), 0) / children.length)
      : 0;
    const badges = [];
    if (avgChildScore >= 90) badges.push("Gold Reader");
    if (weeklyActivities >= 3) badges.push("Weekly Streak");
    if (!badges.length) badges.push("Getting Started");

    return res.json({
      children: children.map((c) => ({
        id: c.id,
        name: c.name,
        currentLevel: `Grade ${c.grade}`,
        score: c.score,
        atRisk: c.needsHelp
      })),
      weeklyReport: {
        weeklyActivities,
        averageScore: avgChildScore
      },
      activityChecklist: [
        { label: "Read one story", done: weeklyActivities >= 1 },
        { label: "Practice verb activity", done: weeklyActivities >= 2 },
        { label: "Complete weekly quiz", done: weeklyActivities >= 3 }
      ],
      badges
    });
  } catch {
    return res.status(500).json({ error: "Could not load parent overview." });
  }
});

app.get("/api/action-verbs", async (_req, res) => {
  const cards = ACTION_VERBS.map((verb) => ({
    verb,
    image: `https://placehold.co/220x140?text=${encodeURIComponent(verb)}`,
    lessonText: `Practice saying "${verb}" clearly in different tenses.`
  }));
  return res.json(cards);
});

app.post("/api/voice-attempts", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "student") {
    return res.status(403).json({ error: "Student access required." });
  }

  const verb = String(req.body?.verb || "").trim().toLowerCase();
  const tense = String(req.body?.tense || "").trim().toLowerCase();
  const transcript = String(req.body?.transcript || "").trim();
  const pronunciationScore = Math.round(Number(req.body?.pronunciationScore));
  const fluencyScore = Math.round(Number(req.body?.fluencyScore));
  const accuracyScore = Math.round(Number(req.body?.accuracyScore));
  const overallScore = Math.round(Number(req.body?.overallScore));
  const passed = Boolean(req.body?.passed);

  if (!verb || !tense || Number.isNaN(pronunciationScore) || Number.isNaN(fluencyScore) || Number.isNaN(accuracyScore) || Number.isNaN(overallScore)) {
    return res.status(400).json({ error: "Invalid attempt payload." });
  }

  try {
    const studentMatch = await Student.findOne({
      where: {
        [Op.or]: [
          { parentEmail: authUser.email },
          { name: authUser.name }
        ]
      },
      attributes: ["id", "score"]
    });

    const created = await VoiceAttempt.create({
      studentEmail: authUser.email,
      studentName: authUser.name,
      studentId: studentMatch?.id || null,
      verb,
      tense,
      transcript,
      pronunciationScore: Math.max(0, Math.min(100, pronunciationScore)),
      fluencyScore: Math.max(0, Math.min(100, fluencyScore)),
      accuracyScore: Math.max(0, Math.min(100, accuracyScore)),
      overallScore: Math.max(0, Math.min(100, overallScore)),
      passed
    });

    return res.status(201).json(created.toJSON());
  } catch {
    return res.status(500).json({ error: "Could not save voice attempt." });
  }
});

app.get("/api/voice-attempts/student", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "student") {
    return res.status(403).json({ error: "Student access required." });
  }

  try {
    const attempts = await VoiceAttempt.findAll({
      where: { studentEmail: authUser.email },
      order: [["createdAt", "DESC"]],
      limit: 100
    });
    return res.json(attempts.map((attempt) => attempt.toJSON()));
  } catch {
    return res.status(500).json({ error: "Could not load student voice history." });
  }
});

app.get("/api/voice-attempts/teacher", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "teacher") {
    return res.status(403).json({ error: "Teacher access required." });
  }

  try {
    const attempts = await VoiceAttempt.findAll({
      order: [["createdAt", "DESC"]],
      limit: 200
    });
    return res.json(attempts.map((attempt) => attempt.toJSON()));
  } catch {
    return res.status(500).json({ error: "Could not load class voice history." });
  }
});

app.get("/api/teacher/at-risk-alerts", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "teacher") {
    return res.status(403).json({ error: "Teacher access required." });
  }

  try {
    const attempts = await VoiceAttempt.findAll({
      order: [["createdAt", "DESC"]],
      attributes: ["studentEmail", "studentName", "overallScore", "verb", "createdAt"]
    });
    const grouped = attempts.reduce((acc, attempt) => {
      const key = attempt.studentEmail;
      if (!acc[key]) acc[key] = [];
      acc[key].push(attempt.toJSON());
      return acc;
    }, {});

    const alerts = Object.values(grouped).map((rows) => {
      const sorted = rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      let failCount = 0;
      for (const row of sorted) {
        if (row.overallScore < 75) failCount += 1;
        else break;
      }
      const latest = sorted[0];
      return {
        studentEmail: latest.studentEmail,
        studentName: latest.studentName,
        consecutiveFails: failCount,
        latestVerb: latest.verb,
        latestScore: latest.overallScore,
        atRisk: failCount >= 3
      };
    });

    return res.json({
      alerts: alerts.filter((a) => a.atRisk),
      updatedAt: new Date().toISOString()
    });
  } catch {
    return res.status(500).json({ error: "Could not load at-risk alerts." });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://127.0.0.1:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database initialization failed.", err);
    process.exit(1);
  });
