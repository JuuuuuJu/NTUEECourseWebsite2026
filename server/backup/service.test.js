const fs = require("fs");
const os = require("os");
const path = require("path");

describe("backup service", () => {
  let directory;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "course-backup-"));
    process.env.BACKUP_DIR = directory;
    jest.resetModules();
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  test("creates, lists, reads and deletes a gzip JSON backup", async () => {
    const service = require("./service");
    const connection = {
      name: "course-test",
      db: {
        collections: async () => [
          { collectionName: "students", find: () => ({ toArray: async () => [{ userID: "B1" }] }) },
          { collectionName: "courses", find: () => ({ toArray: async () => [{ id: "C1" }, { id: "C2" }] }) },
        ],
      },
    };
    const created = await service.createBackup(connection);
    expect(created.collectionCounts).toEqual({ students: 1, courses: 2 });
    expect((await service.listBackups())[0].filename).toBe(created.filename);
    expect((await service.readBackup(created.filename)).payload.collections.students[0].userID).toBe("B1");
    expect(await service.deleteBackup(created.filename)).toEqual({
      filename: created.filename,
      deletedSize: created.fileSize,
    });
    expect(await service.listBackups()).toEqual([]);
  });

  test("rejects path traversal", () => {
    const service = require("./service");
    expect(() => service.safePath("../secret.json.gz")).toThrow("Invalid backup filename");
  });
});
