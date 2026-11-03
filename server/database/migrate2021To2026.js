const bcrypt = require("bcrypt");
const model = require("./mongo/model");
const constants = require("../constants");
const { DEFAULT_TEMPLATES } = require("../mail/templates");

const ADMIN_USER_ID = "B00000000";

// First deployment on an empty database needs an admin to log in. Existing
// admins are never modified, so this is safe to run on every deploy.
const ensureAdmin = async () => {
  const hasAdmin = await model.Student.exists({
    authority: { $gte: constants.AUTHORITY_ADMIN },
  });
  if (hasAdmin) return "existing";
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password) {
    console.warn("No admin account found and ADMIN_INITIAL_PASSWORD is not set.");
    return "missing";
  }
  await model.Student.create({
    userID: ADMIN_USER_ID,
    grade: 2,
    name: "Admin",
    authority: constants.AUTHORITY_ADMIN,
    password: await bcrypt.hash(password, 10),
  });
  return "created";
};

const DIGITAL_LAB_OPTION = {
  name: "數電實驗",
  limit: 36,
  priority_type: "none",
  priority_value: 0,
};

const migrate = async () => {
  if (model.conn.readyState !== 1) {
    await new Promise((resolve, reject) => {
      model.conn.once("open", resolve);
      model.conn.once("error", reject);
    });
  }

  for (const template of DEFAULT_TEMPLATES) {
    await model.EmailTemplate.updateOne(
      { key: template.key },
      { $setOnInsert: template },
      { upsert: true, runValidators: true }
    );
  }

  // The 2021 production course data predates three-person Digital Lab groups.
  // Keep the migration idempotent while enabling the new API on restored data.
  await model.Course.updateMany(
    {
      type: "Ten-Select-Two",
      options: { $not: { $elemMatch: { name: DIGITAL_LAB_OPTION.name } } },
    },
    { $push: { options: DIGITAL_LAB_OPTION } },
    { runValidators: true }
  );

  const models = [
    model.Course,
    model.Student,
    model.Selection,
    model.SelectionCheckpoint,
    model.DigitalLabGroup,
    model.Preselect,
    model.OpenTime,
    model.Result,
    model.EmailTemplate,
    model.EmailJob,
  ];
  for (const collectionModel of models) await collectionModel.createIndexes();

  const admin = await ensureAdmin();

  const counts = {};
  for (const collectionModel of models) {
    counts[collectionModel.collection.collectionName] = await collectionModel.countDocuments({});
  }
  if (counts.emailtemplates < DEFAULT_TEMPLATES.length) {
    throw new Error(`Expected at least ${DEFAULT_TEMPLATES.length} email templates`);
  }

  console.log(JSON.stringify({ migrated: true, admin, counts }, null, 2));
};

migrate()
  .then(() => model.conn.close())
  .catch(async (error) => {
    console.error(error);
    await model.conn.close().catch(() => {});
    process.exitCode = 1;
  });
