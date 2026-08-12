const model = require("./mongo/model");
const { DEFAULT_TEMPLATES } = require("../mail/templates");

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

  const counts = {};
  for (const collectionModel of models) {
    counts[collectionModel.collection.collectionName] = await collectionModel.countDocuments({});
  }
  if (counts.emailtemplates < DEFAULT_TEMPLATES.length) {
    throw new Error(`Expected at least ${DEFAULT_TEMPLATES.length} email templates`);
  }

  console.log(JSON.stringify({ migrated: true, counts }, null, 2));
};

migrate()
  .then(() => model.conn.close())
  .catch(async (error) => {
    console.error(error);
    await model.conn.close().catch(() => {});
    process.exitCode = 1;
  });
