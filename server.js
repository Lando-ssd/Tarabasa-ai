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
const PREFERRED_PORT = Number(process.env.PORT) || 8000;
const PORT_FALLBACK_TRIES = 30;

function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => resolve(server));
    server.once("error", reject);
  });
}
const VALID_ROLES = new Set(["teacher", "student", "parent", "admin"]);
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
  const fs = require("fs");
  const path = require("path");
  const dbPath = path.join(__dirname, "database");
  
  // Use alter: true to update schema without destroying data.
  // Only force-sync when the database file does not exist yet.
  const dbExists = fs.existsSync(dbPath);
  try {
    console.log("Database exists before sync:", dbExists);
    if (dbExists) {
      console.log("Syncing database with alter: true to preserve existing data");
      // Disable foreign key checks to allow ALTER TABLE operations
      await sequelize.query("PRAGMA foreign_keys = OFF;");
      try {
        await sequelize.sync({ alter: true });
        console.log("Database sync completed successfully (schema updated, data preserved)");
      } catch (alterErr) {
        console.warn("Alter sync failed, trying safe sync:", alterErr.message);
        // Fall back to just ensuring tables exist without altering
        await sequelize.sync();
        console.log("Database sync completed (safe mode, no schema changes)");
      }
      await sequelize.query("PRAGMA foreign_keys = ON;");
    } else {
      console.log("No database found — creating fresh database");
      await sequelize.sync({ force: true });
      console.log("Database created successfully with all tables");
    }
  } catch (error) {
    console.error("Database sync error:", error.message);
    throw error;
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

  // Create permanent admin account
  const adminCount = await User.count({ where: { role: "admin" } });
  if (adminCount === 0) {
    await User.create({
      name: "Admin",
      email: "admin@tarabasa.com",
      password: hashPassword("admin123"),
      role: "admin"
    });
    console.log("✅ Default admin account created: admin@tarabasa.com / admin123");
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
    const where = { teacherId: authUser.id };
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
      lastActiveAt,
      teacherId: authUser.id
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
    const student = await Student.findOne({ where: { id, teacherId: authUser.id } });
    if (!student) return res.status(404).json({ error: "Student not found or not assigned to you." });

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
    const deleted = await Student.destroy({ where: { id, teacherId: authUser.id } });
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
      lastActiveAt: new Date(),
      teacherId: authUser.id
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
    const students = await Student.findAll({ 
      where: { teacherId: authUser.id },
      attributes: ["score", "needsHelp", "lastActiveAt"] 
    });
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
      attributes: ["id", "name", "grade", "score", "needsHelp", "studentEmail", "lastActiveAt"]
    });

    // Collect all student emails linked to this parent's children
    const childStudentEmails = children
      .map((c) => c.studentEmail)
      .filter(Boolean);
    const childIds = children.map((child) => child.id);

    // Fetch voice attempts by student email (the real progress data)
    const voiceWhere = [];
    if (childStudentEmails.length) {
      voiceWhere.push({ studentEmail: { [Op.in]: childStudentEmails } });
    }
    if (childIds.length) {
      voiceWhere.push({ studentId: { [Op.in]: childIds } });
    }

    const voiceAttempts = voiceWhere.length
      ? await VoiceAttempt.findAll({
        where: { [Op.or]: voiceWhere },
        order: [["createdAt", "DESC"]],
        limit: 200
      })
      : [];

    const weeklyVoiceAttempts = voiceAttempts
      .filter((a) => Date.now() - new Date(a.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000);
    const totalWeeklyActivities = weeklyVoiceAttempts.length;

    const avgChildScore = children.length
      ? Math.round(children.reduce((sum, child) => sum + Number(child.score || 0), 0) / children.length)
      : 0;

    // Compute average voice score if there are voice attempts
    const avgVoiceScore = voiceAttempts.length
      ? Math.round(voiceAttempts.reduce((sum, a) => sum + Number(a.overallScore || 0), 0) / voiceAttempts.length)
      : 0;

    const badges = [
      {
        name: "⭐ Gold Reader",
        description: "Maintain an average score of 90% or higher.",
        earned: avgChildScore >= 90 || avgVoiceScore >= 90
      },
      {
        name: "🔥 Weekly Streak",
        description: "Complete 5 or more practice sessions in a single week.",
        earned: totalWeeklyActivities >= 5
      },
      {
        name: "🎯 Pronunciation Pro",
        description: "Successfully pass 10 or more voice practice sessions.",
        earned: voiceAttempts.filter((a) => a.passed).length >= 10
      },
      {
        name: "🏆 Dedicated Learner",
        description: "Complete 20 total practice attempts.",
        earned: voiceAttempts.length >= 20
      },
      {
        name: "🌱 Getting Started",
        description: "Begin your learning journey.",
        earned: true
      }
    ];

    // Build per-child progress data
    const childrenWithProgress = children.map((c) => {
      const childAttempts = voiceAttempts.filter(
        (a) => a.studentEmail === c.studentEmail || a.studentId === c.id
      );
      const recentAttempts = childAttempts.slice(0, 10).map((a) => ({
        verb: a.verb,
        tense: a.tense,
        pronunciationScore: a.pronunciationScore,
        fluencyScore: a.fluencyScore,
        accuracyScore: a.accuracyScore,
        overallScore: a.overallScore,
        passed: a.passed,
        feedback: a.feedback,
        date: a.createdAt
      }));

      const childAvgVoice = childAttempts.length
        ? Math.round(childAttempts.reduce((sum, a) => sum + Number(a.overallScore || 0), 0) / childAttempts.length)
        : null;

      const passedCount = childAttempts.filter((a) => a.passed).length;
      const failedCount = childAttempts.filter((a) => !a.passed).length;

      return {
        id: c.id,
        name: c.name,
        email: c.studentEmail || null,
        currentLevel: `Grade ${c.grade}`,
        score: c.score,
        atRisk: c.needsHelp,
        lastActive: c.lastActiveAt || (childAttempts.length ? childAttempts[0].createdAt : null),
        voiceProgress: {
          totalAttempts: childAttempts.length,
          passedCount,
          failedCount,
          averageScore: childAvgVoice,
          recentAttempts
        }
      };
    });

    return res.json({
      children: childrenWithProgress,
      weeklyReport: {
        weeklyActivities: totalWeeklyActivities,
        weeklyVoiceAttempts: weeklyVoiceAttempts.length,
        averageScore: avgChildScore,
        averageVoiceScore: avgVoiceScore
      },
      activityChecklist: [
        { label: "📖 Read one story", description: "Complete at least 1 voice practice session this week.", done: totalWeeklyActivities >= 1 },
        { label: "🗣️ Practice verb activity", description: "Complete at least 2 voice practice sessions this week.", done: totalWeeklyActivities >= 2 },
        { label: "📝 Complete weekly quiz", description: "Complete at least 3 voice practice sessions this week.", done: totalWeeklyActivities >= 3 },
        { label: "🔥 Daily streak", description: "Complete 5 or more voice practice sessions this week.", done: totalWeeklyActivities >= 5 },
        { label: "🏅 Weekly champion", description: "Complete 7 or more voice practice sessions this week.", done: totalWeeklyActivities >= 7 }
      ],
      badges
    });
  } catch (err) {
    console.error("Error loading parent overview:", err.message);
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
  const feedback = String(req.body?.feedback || "").trim();

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
      passed,
      feedback: feedback || null
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
  } catch (err) {
    console.error("Error loading student voice attempts:", err);
    return res.status(500).json({ error: "Could not load student voice history." });
  }
});

app.get("/api/voice-attempts/teacher", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "teacher") {
    return res.status(403).json({ error: "Teacher access required." });
  }

  try {
    const myStudents = await Student.findAll({ where: { teacherId: authUser.id }, attributes: ["id", "studentEmail"] });
    const myStudentIds = myStudents.map(s => s.id).filter(Boolean);
    const myStudentEmails = myStudents.map(s => s.studentEmail).filter(Boolean);
    
    const where = {};
    if (myStudentIds.length || myStudentEmails.length) {
      where[Op.or] = [];
      if (myStudentIds.length) where[Op.or].push({ studentId: { [Op.in]: myStudentIds } });
      if (myStudentEmails.length) where[Op.or].push({ studentEmail: { [Op.in]: myStudentEmails } });
    } else {
      return res.json([]);
    }

    const attempts = await VoiceAttempt.findAll({
      where,
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
    const myStudents = await Student.findAll({ where: { teacherId: authUser.id }, attributes: ["id", "studentEmail"] });
    const myStudentIds = myStudents.map(s => s.id).filter(Boolean);
    const myStudentEmails = myStudents.map(s => s.studentEmail).filter(Boolean);
    
    const where = {};
    if (myStudentIds.length || myStudentEmails.length) {
      where[Op.or] = [];
      if (myStudentIds.length) where[Op.or].push({ studentId: { [Op.in]: myStudentIds } });
      if (myStudentEmails.length) where[Op.or].push({ studentEmail: { [Op.in]: myStudentEmails } });
    } else {
      return res.json({ alerts: [], updatedAt: new Date().toISOString() });
    }

    const attempts = await VoiceAttempt.findAll({
      where,
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

// ADMIN ENDPOINTS
app.get("/api/admin/users", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  try {
    const users = await User.findAll({
      attributes: ["id", "name", "email", "role"]
    });
    const students = await Student.findAll({
      attributes: ["id", "name", "grade", "parentEmail", "score"]
    });
    return res.json({
      users: users.map((u) => u.toJSON()),
      students: students.map((s) => s.toJSON())
    });
  } catch (err) {
    console.error("Error loading admin users:", err.message);
    return res.status(500).json({ error: "Could not load users." });
  }
});

app.post("/api/admin/users", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "").trim().toLowerCase();

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Name, email, password, and role are required." });
  }

  try {
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: "A user with this email already exists." });
    }
    const created = await User.create({
      name,
      email,
      password: hashPassword(password),
      role
    });
    const userJson = created.toJSON();
    delete userJson.password;
    return res.status(201).json(userJson);
  } catch (err) {
    return res.status(500).json({ error: "Could not create user." });
  }
});

app.put("/api/admin/users/:id", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const id = Number(req.params.id);
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "").trim().toLowerCase();

  if (!id || !name || !email || !role) {
    return res.status(400).json({ error: "ID, name, email, and role are required." });
  }

  try {
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: "User not found." });

    if (email !== user.email) {
      const existing = await User.findOne({ where: { email } });
      if (existing) return res.status(400).json({ error: "Email is already in use." });
    }

    const updates = { name, email, role };
    if (password) updates.password = hashPassword(password);
    
    await user.update(updates);
    const userJson = user.toJSON();
    delete userJson.password;
    return res.json(userJson);
  } catch (err) {
    return res.status(500).json({ error: "Could not update user." });
  }
});

app.delete("/api/admin/users/:id", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "User ID is required." });

  if (id === authUser.id) {
    return res.status(400).json({ error: "Cannot delete your own admin account." });
  }

  try {
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: "User not found." });

    await user.destroy();
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Could not delete user." });
  }
});

app.post("/api/admin/connect-teacher-student", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const teacherEmail = String(req.body?.teacherEmail || "").trim().toLowerCase();
  const studentEmail = String(req.body?.studentEmail || "").trim().toLowerCase();

  if (!teacherEmail || !studentEmail) {
    return res.status(400).json({ error: "Teacher Email and Student Email are required." });
  }

  try {
    const teacher = await User.findOne({ where: { email: teacherEmail }, attributes: ["id", "role", "name", "email"] });
    if (!teacher) {
      return res.status(404).json({ error: `Teacher with email "${teacherEmail}" not found.` });
    }
    if (teacher.role !== "teacher") {
      return res.status(400).json({ error: `User "${teacherEmail}" (${teacher.name}) is a ${teacher.role}, not a teacher.` });
    }

    let student = await Student.findOne({ where: { studentEmail } });
    if (!student) {
      const studentUser = await User.findOne({ where: { email: studentEmail }, attributes: ["id", "role", "name"] });
      if (!studentUser) {
        return res.status(404).json({ error: `Student with email "${studentEmail}" not found in the system.` });
      }
      if (studentUser.role !== "student") {
        return res.status(400).json({ error: `User "${studentEmail}" is a ${studentUser.role}, not a student.` });
      }
      student = await Student.findOne({ where: { name: studentUser.name } });
      if (!student) {
         student = await Student.create({
           name: studentUser.name,
           studentEmail: studentEmail,
           score: 0,
           needsHelp: false
         });
      } else {
         await student.update({ studentEmail: studentEmail });
      }
    }

    await student.update({ teacherId: teacher.id });
    return res.json({ message: "Teacher connected to student.", student: student.toJSON() });
  } catch (err) {
    console.error("Error connecting teacher to student:", err.message);
    return res.status(500).json({ error: "Could not connect teacher to student." });
  }
});

app.post("/api/admin/connect-student-parent", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const studentEmail = String(req.body?.studentEmail || "").trim().toLowerCase();
  const parentEmail = String(req.body?.parentEmail || "").trim().toLowerCase();

  if (!studentEmail || !parentEmail) {
    return res.status(400).json({ error: "Student Email and Parent Email are required." });
  }

  try {
    // Validate student user
    const studentUser = await User.findOne({
      where: { email: studentEmail },
      attributes: ["id", "role", "name", "email"]
    });
    if (!studentUser) {
      return res.status(404).json({ error: `No user found with email "${studentEmail}".` });
    }
    if (studentUser.role !== "student") {
      return res.status(400).json({ error: `Email "${studentEmail}" belongs to a ${studentUser.role}, not a student.` });
    }

    // Validate parent user
    const parentUser = await User.findOne({
      where: { email: parentEmail },
      attributes: ["id", "role", "name", "email"]
    });
    
    if (!parentUser) {
      return res.status(404).json({ error: `No user found with email "${parentEmail}".` });
    }
    
    if (parentUser.role !== "parent") {
      return res.status(400).json({ error: `Email "${parentEmail}" belongs to a ${parentUser.role}, not a parent.` });
    }

    // Find or Create Student progress record
    let studentRecord = await Student.findOne({ where: { studentEmail } });
    if (!studentRecord) {
      studentRecord = await Student.findOne({ where: { name: studentUser.name } });
    }

    if (studentRecord) {
      await studentRecord.update({ studentEmail, parentEmail });
    } else {
      studentRecord = await Student.create({
        name: studentUser.name,
        studentEmail: studentEmail,
        parentEmail: parentEmail,
        score: 0,
        needsHelp: false
      });
    }

    return res.json({ message: "Parent connected to student.", student: studentRecord.toJSON() });
  } catch (err) {
    console.error("Error connecting parent to student:", err.message);
    return res.status(500).json({ error: "Could not connect parent to student." });
  }
});

// READ — List all student-parent connections
app.get("/api/admin/connections", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  try {
    const students = await Student.findAll({
      where: { parentEmail: { [Op.ne]: null } },
      attributes: ["id", "name", "grade", "studentEmail", "parentEmail", "score", "needsHelp"],
      order: [["id", "ASC"]]
    });

    // Enrich with parent user name
    const connections = [];
    for (const s of students) {
      let parentName = null;
      if (s.parentEmail) {
        const parentUser = await User.findOne({
          where: { email: s.parentEmail },
          attributes: ["name"]
        });
        parentName = parentUser ? parentUser.name : null;
      }
      connections.push({
        id: s.id,
        studentName: s.name,
        studentEmail: s.studentEmail || null,
        grade: s.grade,
        score: s.score,
        needsHelp: s.needsHelp,
        parentEmail: s.parentEmail,
        parentName
      });
    }

    return res.json({ connections });
  } catch (err) {
    console.error("Error loading connections:", err.message);
    return res.status(500).json({ error: "Could not load connections." });
  }
});

// UPDATE — Change the parent on an existing connection
app.put("/api/admin/connections/:id", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const id = Number(req.params.id);
  const newParentEmail = String(req.body?.parentEmail || "").trim().toLowerCase();

  if (!id || !newParentEmail) {
    return res.status(400).json({ error: "Student record ID and new Parent Email are required." });
  }

  try {
    const student = await Student.findByPk(id);
    if (!student) {
      return res.status(404).json({ error: "Student record not found." });
    }

    const parentUser = await User.findOne({
      where: { email: newParentEmail },
      attributes: ["id", "role", "name"]
    });
    if (!parentUser) {
      return res.status(404).json({ error: `No user found with email "${newParentEmail}".` });
    }
    if (parentUser.role !== "parent") {
      return res.status(400).json({ error: `Email "${newParentEmail}" belongs to a ${parentUser.role}, not a parent.` });
    }

    await student.update({ parentEmail: newParentEmail });
    return res.json({ message: "Connection updated.", student: student.toJSON() });
  } catch (err) {
    console.error("Error updating connection:", err.message);
    return res.status(500).json({ error: "Could not update connection." });
  }
});

// DELETE — Disconnect student from parent
app.delete("/api/admin/connections/:id", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid student record ID." });

  try {
    const student = await Student.findByPk(id);
    if (!student) {
      return res.status(404).json({ error: "Student record not found." });
    }

    await student.update({ parentEmail: null });
    return res.json({ message: "Student disconnected from parent." });
  } catch (err) {
    console.error("Error disconnecting:", err.message);
    return res.status(500).json({ error: "Could not disconnect student from parent." });
  }
});

// ─── TEACHER-STUDENT CONNECTIONS CRUD ───

// READ — List all teacher-student connections
app.get("/api/admin/teacher-connections", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  try {
    const students = await Student.findAll({
      where: { teacherId: { [Op.ne]: null } },
      attributes: ["id", "name", "grade", "studentEmail", "score", "needsHelp", "teacherId"],
      order: [["id", "ASC"]]
    });

    const connections = [];
    for (const s of students) {
      let teacherName = null;
      let teacherEmail = null;
      
      if (s.teacherId) {
        const teacherUser = await User.findByPk(s.teacherId, {
          attributes: ["name", "email"]
        });
        if (teacherUser) {
          teacherName = teacherUser.name;
          teacherEmail = teacherUser.email;
        }
      }
      
      connections.push({
        id: s.id,
        studentName: s.name,
        studentEmail: s.studentEmail || null,
        grade: s.grade,
        score: s.score,
        needsHelp: s.needsHelp,
        teacherEmail,
        teacherName
      });
    }

    return res.json({ connections });
  } catch (err) {
    console.error("Error loading teacher connections:", err.message);
    return res.status(500).json({ error: "Could not load teacher connections." });
  }
});

// UPDATE — Change the teacher on an existing connection
app.put("/api/admin/teacher-connections/:id", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const id = Number(req.params.id);
  const newTeacherEmail = String(req.body?.teacherEmail || "").trim().toLowerCase();

  if (!id || !newTeacherEmail) {
    return res.status(400).json({ error: "Student record ID and new Teacher Email are required." });
  }

  try {
    const student = await Student.findByPk(id);
    if (!student) {
      return res.status(404).json({ error: "Student record not found." });
    }

    const teacherUser = await User.findOne({
      where: { email: newTeacherEmail },
      attributes: ["id", "role", "name"]
    });
    if (!teacherUser) {
      return res.status(404).json({ error: `No user found with email "${newTeacherEmail}".` });
    }
    if (teacherUser.role !== "teacher") {
      return res.status(400).json({ error: `Email "${newTeacherEmail}" belongs to a ${teacherUser.role}, not a teacher.` });
    }

    await student.update({ teacherId: teacherUser.id });
    return res.json({ message: "Connection updated.", student: student.toJSON() });
  } catch (err) {
    console.error("Error updating teacher connection:", err.message);
    return res.status(500).json({ error: "Could not update connection." });
  }
});

// DELETE — Disconnect student from teacher
app.delete("/api/admin/teacher-connections/:id", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid student record ID." });

  try {
    const student = await Student.findByPk(id);
    if (!student) {
      return res.status(404).json({ error: "Student record not found." });
    }

    await student.update({ teacherId: null });
    return res.json({ message: "Student disconnected from teacher." });
  } catch (err) {
    console.error("Error disconnecting teacher:", err.message);
    return res.status(500).json({ error: "Could not disconnect student from teacher." });
  }
});

app.get("/api/admin/overview", async (req, res) => {
  const authUser = await getUserByHeader(req);
  if (!authUser || authUser.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  try {
    const teachers = await User.count({ where: { role: "teacher" } });
    const students = await User.count({ where: { role: "student" } });
    const parents = await User.count({ where: { role: "parent" } });
    const studentRecords = await Student.count();
    const voiceAttempts = await VoiceAttempt.count();

    const atRiskStudents = await Student.count({ where: { needsHelp: true } });
    const avgScore = await Student.findAll({ attributes: ["score"] }).then((records) =>
      records.length ? Math.round(records.reduce((sum, r) => sum + Number(r.score || 0), 0) / records.length) : 0
    );

    return res.json({
      totalUsers: teachers + students + parents,
      teachers,
      students,
      parents,
      studentRecords,
      voiceAttempts,
      atRiskStudents,
      averageScore: avgScore
    });
  } catch {
    return res.status(500).json({ error: "Could not load admin overview." });
  }
});

initDb()
  .then(async () => {
    let lastErr;
    for (let port = PREFERRED_PORT; port < PREFERRED_PORT + PORT_FALLBACK_TRIES; port++) {
      try {
        const server = await listenOnPort(port);
        server.on("error", (err) => {
          console.error("HTTP server error:", err);
        });
        if (port !== PREFERRED_PORT) {
          console.warn(`Port ${PREFERRED_PORT} was busy; using ${port} instead.`);
        }
        console.log(`Server running at http://127.0.0.1:${port}`);
        console.log(`Open the app: http://127.0.0.1:${port}/index.html`);
        return;
      } catch (err) {
        lastErr = err;
        if (err.code !== "EADDRINUSE") {
          console.error("Server failed to start.", err);
          process.exit(1);
        }
      }
    }
    console.error(
      `No free port from ${PREFERRED_PORT} to ${PREFERRED_PORT + PORT_FALLBACK_TRIES - 1}.`,
      "Close another program using those ports, or set PORT to a free value.",
      lastErr && lastErr.message ? `(${lastErr.message})` : ""
    );
    process.exit(1);
  })
  .catch((err) => {
    console.error("Database initialization failed.", err);
    process.exit(1);
  });
