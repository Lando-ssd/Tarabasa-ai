const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("User", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM("teacher", "student", "parent", "admin"),
    allowNull: false
  }
}, {
  tableName: "users",
  timestamps: false
});
