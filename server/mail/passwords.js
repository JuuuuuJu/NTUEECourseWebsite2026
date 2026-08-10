const bcrypt = require("bcrypt");
const crypto = require("crypto");

const constants = require("../constants");
const model = require("../database/mongo/model");

const generatePassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(
    crypto.randomBytes(12),
    (byte) => alphabet[byte % alphabet.length]
  ).join("");
};

const updateStudentPassword = async (studentID, rawPassword) => {
  const hash = await bcrypt.hash(String(rawPassword), constants.SALT_ROUNDS);
  await model.Student.updateOne({ _id: studentID }, { password: hash });
};

module.exports = { generatePassword, updateStudentPassword };
