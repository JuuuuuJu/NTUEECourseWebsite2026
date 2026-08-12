const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, "../../tmp/db-backups"));

const ensureDirectory = () => fs.promises.mkdir(BACKUP_DIR, { recursive: true });

const safePath = (filename) => {
  if (
    typeof filename !== "string" ||
    path.basename(filename) !== filename ||
    !filename.endsWith(".json.gz")
  ) {
    throw Object.assign(new Error("Invalid backup filename."), { status: 400 });
  }
  return path.join(BACKUP_DIR, filename);
};

const metadata = (payload, filename, fileSize) => ({
  filename,
  database: payload.database,
  createdAt: payload.createdAt,
  fileSize,
  collectionCounts: Object.fromEntries(
    Object.entries(payload.collections || {}).map(([name, documents]) => [
      name,
      Array.isArray(documents) ? documents.length : 0,
    ])
  ),
});

const createBackup = async (connection) => {
  await ensureDirectory();
  const collections = await connection.db.collections();
  const data = {};
  for (const collection of collections) {
    if (collection.collectionName.startsWith("system.")) continue;
    data[collection.collectionName] = await collection.find({}).toArray();
  }
  const createdAt = new Date().toISOString();
  const database = connection.name;
  const stamp = createdAt.replace(/[-:]/g, "").replace(/.d{3}Z$/, "Z");
  const filename = `${database}-${stamp}.json.gz`;
  const payload = { version: 1, database, createdAt, collections: data };
  const compressed = await gzip(Buffer.from(JSON.stringify(payload)));
  const destination = safePath(filename);
  const temporary = `${destination}.tmp-${process.pid}`;
  await fs.promises.writeFile(temporary, compressed, { flag: "wx" });
  await fs.promises.rename(temporary, destination);
  return metadata(payload, filename, compressed.length);
};

const readBackup = async (filename) => {
  const file = safePath(filename);
  const [compressed, stat] = await Promise.all([
    fs.promises.readFile(file),
    fs.promises.stat(file),
  ]);
  const payload = JSON.parse((await gunzip(compressed)).toString("utf8"));
  return { payload, info: metadata(payload, filename, stat.size), file };
};

const listBackups = async () => {
  await ensureDirectory();
  const filenames = (await fs.promises.readdir(BACKUP_DIR)).filter((name) =>
    name.endsWith(".json.gz")
  );
  const results = [];
  for (const filename of filenames) {
    try {
      results.push((await readBackup(filename)).info);
    } catch (error) {
      console.error(`Skipping invalid DB backup ${filename}: ${error.message}`);
    }
  }
  return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const deleteBackup = async (filename) => {
  const { info, file } = await readBackup(filename);
  await fs.promises.unlink(file);
  return { filename: info.filename, deletedSize: info.fileSize };
};

module.exports = {
  BACKUP_DIR,
  createBackup,
  listBackups,
  readBackup,
  deleteBackup,
  safePath,
};
