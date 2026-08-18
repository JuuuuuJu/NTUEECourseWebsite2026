import React, { useEffect, useRef, useState } from "react";
import { useHistory } from "react-router";
import { DragDropContext } from "react-beautiful-dnd";
import { useParams } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import Breadcrumbs from "@material-ui/core/Breadcrumbs";
import Link from "@material-ui/core/Link";
import HomeIcon from "@material-ui/icons/Home";
import ClassIcon from "@material-ui/icons/Class";
import ViewCarouselIcon from "@material-ui/icons/ViewCarousel";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Paper,
  Snackbar,
  TextField,
} from "@material-ui/core";
import MuiAlert from "@material-ui/lab/Alert";
// import initialData from "./initial-data";
import MDEditor from "@uiw/react-md-editor";
import Column from "./column";
import { DigitalLabAPI, SelectAPI } from "../../api";
import Loading from "../../components/loading";

// MdEditor

const useStyles = makeStyles((theme) => ({
  styledColumns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    margin: "5vh auto",
    width: "80%",
    height: "80vh",
    gap: "8px",
    [theme.breakpoints.down("sm")]: {
      margin: "1vh auto",
      width: "95%",
      paddingLeft: "0px",
      paddingRight: "0px",
    },
    [theme.breakpoints.down("phone")]: {
      gridTemplateColumns: "minmax(0, 1fr)",
      height: "auto",
      minHeight: "80vh",
    },
  },
  link: {
    display: "flex",
  },
  icon: {
    marginRight: theme.spacing(0.5),
    width: 20,
    height: 20,
  },
  actions: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing(2),
    margin: theme.spacing(2, "auto", 0),
    width: "80%",
    background: "transparent",
    boxShadow: "none",
    "& .MuiButton-root": { minWidth: 160 },
    [theme.breakpoints.down("sm")]: {
      width: "95%",
      gap: theme.spacing(1),
      "& .MuiButton-root": {
        width: "100%",
        minWidth: 0,
      },
    },
  },
  digitalLab: {
    width: "80%",
    margin: theme.spacing(2, "auto"),
    padding: theme.spacing(2),
    [theme.breakpoints.down("sm")]: { width: "95%" },
  },
  groupActions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing(1),
    marginTop: theme.spacing(2),
  },
  groupCode: { maxWidth: 240 },
}));
const Selection = () => {
  // const selected = courseName.selected;
  // const unselected = courseName.unselected;
  // const handleSelectCourse = (selectedID) => {
  //   setSelectedCourse(courses.find(({ courseID }) => courseID === selectedID));
  // };
  const history = useHistory();
  const { courseId } = useParams();
  const [data, setData] = useState(null);
  const [alert, setAlert] = useState({
    open: false,
    severity: "success",
    message: "",
  });
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [digitalLabGroup, setDigitalLabGroup] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const selectionSaveQueue = useRef(Promise.resolve());
  const classes = useStyles();
  const courseType = data ? data.type : null;
  useEffect(() => {
    const loadSelections = async () => {
      try {
        const res = await SelectAPI.getSelections(courseId);
        if (res) setData(res.data);
      } catch (err) {
        console.error(err);
        showAlert("error", "無法載入選課資料，請稍後再試。");
      }
    };
    loadSelections();
  }, [courseId]);
  useEffect(() => {
    if (courseType !== "Ten-Select-Two") return;
    DigitalLabAPI.getGroup(courseId)
      .then((res) => setDigitalLabGroup(res.data.group))
      .catch((err) => {
        console.error(err);
        showAlert("error", "無法載入數電實驗組隊資料。");
      });
  }, [courseId, courseType]);
  function Alert(props) {
    return <MuiAlert elevation={6} variant="filled" {...props} />;
  }
  function showAlert(severity, message) {
    setAlert({ open: true, severity, message });
  }
  function handleClose(event, reason) {
    if (reason === "clickaway") {
      return;
    }
    setAlert((state) => ({ ...state, open: false }));
  }
  function handleHomeClick() {
    history.push(``);
    // event.preventDefault();
    // console.info('You clicked a breadcrumb.');
  }
  function handleCoursesClick() {
    history.push(`/courses`);
  }

  async function handleSubmit() {
    setBusy(true);
    try {
      await SelectAPI.putSelections(courseId, data.selected);
      showAlert("success", "選課志願序已正式儲存。");
    } catch (err) {
      console.error(err);
      showAlert("error", "儲存選課志願序失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function handleBackup() {
    setBusy(true);
    try {
      await SelectAPI.putSelectionCheckpoint(courseId, {
        selected: data.selected,
        unselected: data.unselected,
      });
      showAlert("success", "目前排序已備份為還原點。");
    } catch (err) {
      console.error(err);
      showAlert("error", "備份失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setRestoreDialogOpen(false);
    setBusy(true);
    try {
      const res = await SelectAPI.getSelectionCheckpoint(courseId);
      setData((state) => {
        const selections = res.data.selections;
        if (state.type !== "Ten-Select-Two") return { ...state, ...selections };
        return {
          ...state,
          selected: selections.selected.filter((name) => name !== "數電實驗"),
          unselected: selections.unselected.filter(
            (name) => name !== "數電實驗"
          ),
        };
      });
      showAlert("success", "已恢復還原點；請按「儲存選課」才會正式提交。");
    } catch (err) {
      console.error(err);
      if (err.response && err.response.status === 404) {
        showAlert("info", "這門課目前沒有可用的還原點。");
      } else {
        showAlert("error", "恢復還原點失敗，請稍後再試。");
      }
    } finally {
      setBusy(false);
    }
  }

  async function updateDigitalLabGroup(action, successMessage) {
    setBusy(true);
    try {
      const res = await action();
      setDigitalLabGroup(res && res.data ? res.data.group : null);
      setJoinCode("");
      showAlert("success", successMessage);
    } catch (err) {
      console.error(err);
      showAlert(
        "error",
        err.response?.data?.error || "數電實驗組隊操作失敗，請稍後再試。"
      );
    } finally {
      setBusy(false);
    }
  }

  const leaveDigitalLabGroup = async () => {
    setBusy(true);
    try {
      await DigitalLabAPI.leaveGroup(courseId);
      setDigitalLabGroup(null);
      showAlert("success", "已退出數電實驗小組。");
    } catch (err) {
      console.error(err);
      showAlert("error", err.response?.data?.error || "無法退出小組。");
    } finally {
      setBusy(false);
    }
  };
  // const { name, type, description, selected, unselected } = data;
  // return (
  //   <>
  //     {data ? (
  //       <div>
  //         <h1>Thisa is course Selection page</h1>
  //         {courseId}
  //         {data.description}
  //         {data.name}
  //         {data.selected}
  //         {}
  //       </div>
  //     ) : (
  //       Loading
  //     )}
  //   </>
  // );

  // function handleSelection(course) {
  //   setColumns((state) => [
  //     {
  //       ...state[0],
  //       // optionIds: state.courses.find(({ id }) => id === selectedID)
  //       //   .optionIds,
  //     },
  //     {
  //       ...state[1],
  //       optionIds: course.unselected,
  //     },
  //   ]);
  // }
  // // console.log(data);
  // handleSelection(data);

  const onDragEnd = (result) => {
    const { destination, source } = result;

    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }
    const newSelection = {
      selected: [...data.selected],
      unselected: [...data.unselected],
    };
    const [remove] = newSelection[source.droppableId].splice(source.index, 1);
    newSelection[destination.droppableId].splice(destination.index, 0, remove);
    setData((state) => ({
      ...state,
      selected: newSelection.selected,
      unselected: newSelection.unselected,
    }));
    selectionSaveQueue.current = selectionSaveQueue.current
      .catch(() => undefined)
      .then(() => SelectAPI.putSelections(courseId, newSelection.selected))
      .then(() => showAlert("success", "志願序已自動儲存。"))
      .catch((err) => {
        console.error(err);
        showAlert("error", "自動儲存志願序失敗，請按「正式儲存」重試。");
      });
  };

  return (
    <>
      {data ? (
        <Breadcrumbs aria-label="breadcrumb">
          <Link
            component="button"
            color="inherit"
            // href="/"
            onClick={handleHomeClick}
            className={classes.link}
          >
            <HomeIcon className={classes.icon} />
            <Typography>Main</Typography>
          </Link>
          <Link
            component="button"
            color="inherit"
            // href="/courses"
            onClick={handleCoursesClick}
            className={classes.link}
          >
            <ClassIcon className={classes.icon} />
            <Typography>Courses</Typography>
          </Link>
          <Typography color="textPrimary" className={classes.link}>
            <ViewCarouselIcon className={classes.icon} />
            {data.name}
          </Typography>
        </Breadcrumbs>
      ) : (
        ""
      )}
      {data && data.description && (
        <div
          style={{
            width: "90%",
            padding: "10px",
            marginTop: "15px",
            marginLeft: "auto",
            marginRight: "auto",
            marginBottom: "10px",
            border: "1px white solid",
            borderRadius: "4px",
          }}
        >
          <h2 style={{ marginTop: "0px" }}>Introduction</h2>
          <MDEditor.Markdown
            source={data.description}
            style={{ color: "inherit", backgroundColor: "inherit" }}
          />
        </div>
      )}
      <Snackbar open={alert.open} autoHideDuration={6000} onClose={handleClose}>
        <Alert onClose={handleClose} severity={alert.severity}>
          {alert.message}
        </Alert>
      </Snackbar>
      {data ? (
        <>
          {data.type === "Ten-Select-Two" && (
            <Paper className={classes.digitalLab}>
              <Typography variant="h6">數電實驗三人組隊</Typography>
              <Typography color="textSecondary">
                每組必須恰好三人。完整小組會登記參加獨立抽籤；數電實驗固定為第一志願，不能拖曳排序。
              </Typography>
              {digitalLabGroup ? (
                <>
                  <Typography>組隊代碼：{digitalLabGroup.code}</Typography>
                  <Typography>
                    狀態：
                    {digitalLabGroup.status === "forming" &&
                      "尚缺組員（不可登記）"}
                    {digitalLabGroup.status === "registered" &&
                      "三人完整，已登記抽籤"}
                    {digitalLabGroup.status === "selected" && "已抽中數電實驗"}
                    {digitalLabGroup.status === "rejected" && "未抽中數電實驗"}
                  </Typography>
                  <Divider />
                  {digitalLabGroup.members.map((member) => (
                    <Typography key={member.userID}>
                      {member.userID}　{member.name}（{member.grade} 年級）
                      {member.userID === digitalLabGroup.leaderUserID
                        ? " — 組長"
                        : ""}
                    </Typography>
                  ))}
                  {["forming", "registered"].includes(
                    digitalLabGroup.status
                  ) && (
                    <div className={classes.groupActions}>
                      <Button
                        variant="outlined"
                        disabled={busy}
                        onClick={() =>
                          updateDigitalLabGroup(
                            () => DigitalLabAPI.getGroup(courseId),
                            "小組狀態已更新。"
                          )
                        }
                      >
                        更新小組狀態
                      </Button>
                      <Button
                        variant="outlined"
                        color="secondary"
                        disabled={busy}
                        onClick={leaveDigitalLabGroup}
                      >
                        退出小組
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className={classes.groupActions}>
                  <Button
                    variant="contained"
                    color="primary"
                    disabled={busy}
                    onClick={() =>
                      updateDigitalLabGroup(
                        () => DigitalLabAPI.createGroup(courseId),
                        "已建立小組，請將組隊代碼交給另外兩位同學。"
                      )
                    }
                  >
                    建立小組
                  </Button>
                  <TextField
                    className={classes.groupCode}
                    variant="outlined"
                    size="small"
                    label="輸入 8 碼組隊代碼"
                    value={joinCode}
                    onChange={(event) =>
                      setJoinCode(event.target.value.toUpperCase())
                    }
                    inputProps={{ maxLength: 8 }}
                  />
                  <Button
                    variant="outlined"
                    color="primary"
                    disabled={busy || joinCode.length !== 8}
                    onClick={() =>
                      updateDigitalLabGroup(
                        () => DigitalLabAPI.joinGroup(courseId, joinCode),
                        "已加入數電實驗小組。"
                      )
                    }
                  >
                    加入小組
                  </Button>
                </div>
              )}
            </Paper>
          )}
          <DragDropContext onDragEnd={onDragEnd}>
            <div className={classes.styledColumns}>
              <Column
                title="已選課程"
                droppableId="selected"
                column={data.selected}
                fixedCourse={
                  digitalLabGroup &&
                  ["registered", "selected"].includes(digitalLabGroup.status)
                    ? "數電實驗"
                    : ""
                }
              />
              <Column
                title="未選課程"
                droppableId="unselected"
                column={data.unselected}
              />
            </div>
          </DragDropContext>
          <div className={classes.actions}>
            <Button size="large" variant="contained" color="primary" disabled={busy} onClick={handleSubmit}>
              正式儲存並提交選課
            </Button>
            <Button size="large" variant="outlined" color="primary" disabled={busy} onClick={handleBackup}>
              備份還原點
            </Button>
            <Button size="large" variant="outlined" disabled={busy} onClick={() => setRestoreDialogOpen(true)}>
              恢復還原點
            </Button>
          </div>
          <Dialog
            open={restoreDialogOpen}
            onClose={() => setRestoreDialogOpen(false)}
          >
            <DialogTitle>恢復還原點？</DialogTitle>
            <DialogContent>
              <DialogContentText>
                這會覆蓋目前畫面上尚未儲存的排序。恢復後不會自動正式提交選課結果。
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setRestoreDialogOpen(false)}
                color="primary"
              >
                取消
              </Button>
              <Button onClick={handleRestore} color="primary" autoFocus>
                確認恢復
              </Button>
            </DialogActions>
          </Dialog>
        </>
      ) : (
        <Loading />
      )}
    </>
  );
};
export default Selection;
