import React, { useEffect, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  makeStyles,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@material-ui/core";
import { Alert } from "@material-ui/lab";
import GetAppIcon from "@material-ui/icons/GetApp";
import SaveIcon from "@material-ui/icons/Save";
import DeleteIcon from "@material-ui/icons/Delete";

import { BackupAPI } from "../../api";

const useStyles = makeStyles((theme) => ({
  root: { maxWidth: 1100, margin: "auto" },
  section: { padding: theme.spacing(3) },
  description: { marginBottom: theme.spacing(3) },
  actions: { display: "flex", alignItems: "center", marginBottom: theme.spacing(3) },
  spinner: { marginLeft: theme.spacing(2) },
  empty: { padding: theme.spacing(3), textAlign: "center" },
  detail: { marginBottom: theme.spacing(1) },
  counts: { margin: 0, paddingLeft: theme.spacing(3) },
}));

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const errorMessage = (error, fallback) =>
  (error.response && error.response.data && error.response.data.error) ||
  error.message ||
  fallback;

export default function Maintenance() {
  const classes = useStyles();
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ open: false });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const showAlert = (severity, message) =>
    setAlert({ open: true, severity, message });

  const loadBackups = async () => {
    setBusy(true);
    try {
      const { data } = await BackupAPI.list();
      setBackups(data);
    } catch (error) {
      showAlert("error", errorMessage(error, "無法讀取 DB 備份清單。"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createBackup = async () => {
    setBusy(true);
    try {
      const { data } = await BackupAPI.create();
      setBackups((current) => [
        data,
        ...current.filter((item) => item.filename !== data.filename),
      ]);
      showAlert("success", `DB 備份完成：${data.filename}`);
    } catch (error) {
      showAlert("error", errorMessage(error, "DB 備份失敗。"));
    } finally {
      setBusy(false);
    }
  };

  const downloadBackup = async (backup) => {
    setBusy(true);
    try {
      const { data } = await BackupAPI.download(backup.filename);
      const url = window.URL.createObjectURL(
        new Blob([data], { type: "application/gzip" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = backup.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      showAlert("error", errorMessage(error, "下載 DB 備份失敗。"));
    } finally {
      setBusy(false);
    }
  };

  const deleteBackup = async () => {
    if (!deleteTarget) return;
    const filename = deleteTarget.filename;
    setBusy(true);
    try {
      const { data } = await BackupAPI.remove(filename);
      setDeleteTarget(null);
      const response = await BackupAPI.list();
      setBackups(response.data);
      window.dispatchEvent(new Event("db-backups-changed"));
      showAlert(
        "success",
        `已刪除 DB 備份：${data.filename}（${formatSize(data.deletedSize)}）`
      );
    } catch (error) {
      showAlert("error", errorMessage(error, "刪除 DB 備份失敗。"));
    } finally {
      setBusy(false);
    }
  };

  const closeAlert = () =>
    setAlert((current) => ({ ...current, open: false }));

  return (
    <div className={classes.root}>
      <Paper className={classes.section}>
        <Typography variant="h4" gutterBottom>
          系統維護
        </Typography>
        <Typography color="textSecondary" className={classes.description}>
          建立並下載完整 MongoDB 備份。備份不會刪除或修改目前的資料。
        </Typography>
        <div className={classes.actions}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            disabled={busy}
            onClick={createBackup}
          >
            備份 DB
          </Button>
          {busy && <CircularProgress size={24} className={classes.spinner} />}
        </div>

        <Typography variant="h6" gutterBottom>
          DB 備份
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>建立時間</TableCell>
                <TableCell>資料庫</TableCell>
                <TableCell>檔案名稱</TableCell>
                <TableCell align="right">大小</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.filename}>
                  <TableCell>
                    {new Date(backup.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>{backup.database}</TableCell>
                  <TableCell>{backup.filename}</TableCell>
                  <TableCell align="right">
                    {formatSize(backup.fileSize)}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      color="primary"
                      startIcon={<GetAppIcon />}
                      disabled={busy}
                      onClick={() => downloadBackup(backup)}
                    >
                      下載 DB 備份
                    </Button>
                    <Button
                      style={{ color: "#d32f2f" }}
                      startIcon={<DeleteIcon />}
                      disabled={busy}
                      onClick={() => setDeleteTarget(backup)}
                    >
                      刪除
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!busy && backups.length === 0 && (
          <Typography color="textSecondary" className={classes.empty}>
            尚無 DB 備份。
          </Typography>
        )}
      </Paper>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => !busy && setDeleteTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>確認刪除 DB 備份</DialogTitle>
        <DialogContent dividers>
          {deleteTarget && (
            <>
              <Typography className={classes.detail}>
                <strong>檔案名稱：</strong>
                {deleteTarget.filename}
              </Typography>
              <Typography className={classes.detail}>
                <strong>建立時間：</strong>
                {new Date(deleteTarget.createdAt).toLocaleString()}
              </Typography>
              <Typography className={classes.detail}>
                <strong>檔案大小：</strong>
                {formatSize(deleteTarget.fileSize)}
              </Typography>
              <Typography className={classes.detail}>
                <strong>資料庫：</strong>
                {deleteTarget.database}
              </Typography>
              <Typography className={classes.detail}>
                <strong>Collection 筆數：</strong>
              </Typography>
              {Object.keys(deleteTarget.collectionCounts || {}).length > 0 ? (
                <ul className={classes.counts}>
                  {Object.entries(deleteTarget.collectionCounts).map(
                    ([name, count]) => (
                      <li key={name}>
                        {name}: {count}
                      </li>
                    )
                  )}
                </ul>
              ) : (
                <Typography color="textSecondary">無 collection 資訊</Typography>
              )}
              <Alert severity="warning" style={{ marginTop: 16 }}>
                此操作只會刪除這個備份檔案及其登記資料，且無法復原。
              </Alert>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setDeleteTarget(null)}>
            取消
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<DeleteIcon />}
            disabled={busy}
            onClick={deleteBackup}
          >
            確認刪除
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={alert.open} autoHideDuration={6000} onClose={closeAlert}>
        <Alert
          elevation={6}
          variant="filled"
          severity={alert.severity || "info"}
          onClose={closeAlert}
        >
          {alert.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
