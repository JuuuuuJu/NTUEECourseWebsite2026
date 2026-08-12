const express = require("express");
const asyncHandler = require("express-async-handler");

module.exports = ({ connection, adminRequired, service }) => {
  const router = express.Router();

  router.get(
    "/db-backups",
    adminRequired,
    asyncHandler(async (req, res) => {
      res.send(await service.listBackups());
    })
  );

  router.post(
    "/db-backups",
    adminRequired,
    asyncHandler(async (req, res) => {
      res.status(201).send(await service.createBackup(connection));
    })
  );

  router.get(
    "/db-backups/:filename/download",
    adminRequired,
    asyncHandler(async (req, res, next) => {
      try {
        const { file, info } = await service.readBackup(req.params.filename);
        res.download(file, info.filename);
      } catch (error) {
        if (error.code === "ENOENT") return res.status(404).send({ error: "Backup not found." });
        next(error);
      }
    })
  );

  router.delete(
    "/db-backups/:filename",
    adminRequired,
    asyncHandler(async (req, res, next) => {
      try {
        res.send(await service.deleteBackup(req.params.filename));
      } catch (error) {
        if (error.code === "ENOENT") return res.status(404).send({ error: "Backup not found." });
        next(error);
      }
    })
  );

  return router;
};
