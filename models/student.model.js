const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("Student", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  grade: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "1"
  },
  studentEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    field: "student_email",
    validate: {
      isEmail: true
    }
  },
  parentName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: "parent_name"
  },
  parentPhone: {
    type: DataTypes.STRING,
    allowNull: true,
    field: "parent_phone"
  },
  parentEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    field: "parent_email",
    validate: {
      isEmail: true
    }
  },
  score: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0,
      max: 100
    }
  },
  needsHelp: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: "needs_help"
  },
  lastActiveAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: "last_active_at"
  },
  teacherId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: "teacher_id"
  }
}, {
  tableName: "teacher_students",
  timestamps: false
});
