const nodemailer = require("nodemailer");

const getEnrollmentYear = (userid) => {
  const match = /^[A-Za-z](\d{2})/.exec(userid || "");
  return match ? Number(match[1]) : null;
};

const createTransport = ({ userid, password }) => {
  const username = String(userid || "").replace(/@ntu\.edu\.tw$/i, "");
  const year = getEnrollmentYear(username);
  if (year === null || typeof password !== "string" || !password) {
    throw new Error("Invalid SMTP userid or password.");
  }

  if (year >= 9) {
    return nodemailer.createTransport({
      host: "smtps.ntu.edu.tw",
      port: 465,
      secure: true,
      auth: { user: username, pass: password },
      connectionTimeout: 10000,
    });
  }

  return nodemailer.createTransport({
    host: "mail.ntu.edu.tw",
    port: 587,
    secure: false,
    requireTLS: false,
    auth: { user: username, pass: password },
    connectionTimeout: 10000,
  });
};

const sendRenderedEmail = ({
  transport,
  smtpUserid,
  senderName,
  to,
  rendered,
}) =>
  transport.sendMail({
    from: {
      name: senderName,
      address: `${String(smtpUserid).replace(
        /@ntu\.edu\.tw$/i,
        ""
      )}@ntu.edu.tw`,
    },
    to,
    subject: rendered.subject,
    html: rendered.html,
  });

const sendRenderedBccEmail = ({
  transport,
  smtpUserid,
  senderName,
  bcc,
  rendered,
}) =>
  transport.sendMail({
    from: {
      name: senderName,
      address: `${String(smtpUserid).replace(
        /@ntu\.edu\.tw$/i,
        ""
      )}@ntu.edu.tw`,
    },
    bcc,
    subject: rendered.subject,
    html: rendered.html,
  });

module.exports = { createTransport, getEnrollmentYear, sendRenderedBccEmail, sendRenderedEmail };
