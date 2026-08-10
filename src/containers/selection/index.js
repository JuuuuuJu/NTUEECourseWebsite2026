import React, { useEffect, useState } from "react";
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
  Snackbar,
} from "@material-ui/core";
import MuiAlert from "@material-ui/lab/Alert";
// import initialData from "./initial-data";
import MDEditor from "@uiw/react-md-editor";
import Column from "./column";
import { SelectAPI } from "../../api";
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
    flexWrap: "wrap",
    gap: theme.spacing(1),
    margin: theme.spacing(2, "auto", 0),
    width: "80%",
    [theme.breakpoints.down("sm")]: {
      width: "95%",
    },
  },
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
  const [busy, setBusy] = useState(false);
  const classes = useStyles();
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
      setData((state) => ({ ...state, ...res.data.selections }));
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
          <div className={classes.actions}>
            <Button
              variant="contained"
              color="primary"
              disabled={busy}
              onClick={handleSubmit}
            >
              儲存選課
            </Button>
            <Button
              variant="outlined"
              color="primary"
              disabled={busy}
              onClick={handleBackup}
            >
              備份
            </Button>
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() => setRestoreDialogOpen(true)}
            >
              恢復還原點
            </Button>
          </div>
          <DragDropContext onDragEnd={onDragEnd}>
            <div className={classes.styledColumns}>
              <Column
                title="已選課程"
                droppableId="selected"
                column={data.selected}
              />
              <Column
                title="未選課程"
                droppableId="unselected"
                column={data.unselected}
              />
            </div>
          </DragDropContext>
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
