const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("VoiceAttempt", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  studentEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    field: "student_email"
  },
  studentName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: "student_name"
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: "student_id"
  },
  verb: {
    type: DataTypes.STRING,
    allowNull: false
  },
  tense: {
    type: DataTypes.STRING,
    allowNull: false
  },
  transcript: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  pronunciationScore: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: "pronunciation_score",
    validate: { min: 0, max: 100 }
  },
  fluencyScore: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: "fluency_score",
    validate: { min: 0, max: 100 }
  },
  accuracyScore: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: "accuracy_score",
    validate: { min: 0, max: 100 }
  },
  overallScore: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: "overall_score",
    validate: { min: 0, max: 100 }
  },
  passed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  feedback: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null
  }
}, {
  tableName: "voice_attempts",
  timestamps: true,
  updatedAt: false
});
