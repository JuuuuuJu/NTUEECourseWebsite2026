import React from "react";
import { List, ListItem, ListItemText, Typography } from "@material-ui/core";
import { Droppable } from "react-beautiful-dnd";
import PropTypes from "prop-types";
import { makeStyles } from "@material-ui/core/styles";
import Course from "./course";

const useStyles = makeStyles({
  styledColumn1: {
    padding: "4px 0", //12px 0
    display: "flex",
    flexDirection: "column",
    marginTop: 2, //8
    textAlign: "center",
    fontFamily: "Arial, serif", //"Gill Sans, sans-serif",
    fontWeight: 100,
  },
  styledList: {
    backgroundColor: "rgba(0, 0, 0, 0.5)", // #ddd B4F8C8
    //opacity: .9,
    borderRadius: 5, //8
    padding: 16,
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    marginTop: 4,
    textAlign: "center",
    border: 4,
    borderColor: "pink",
  },
  fixedCourse: {
    border: "2px solid rgba(255, 193, 7, 0.7)",
    borderRadius: 3,
    marginTop: 8,
    color: "white",
  },
});
const Column = (props) => {
  const { title, column, droppableId, fixedCourse } = props;
  const classes = useStyles();
  return (
    <Droppable droppableId={droppableId}>
      {(provided) => (
        <div className={classes.styledColumn1}>
          <Typography variant="h6">{title}</Typography>
          <List // h2(replace typography)
            className={classes.styledList}
            {...provided.droppableProps}
            ref={provided.innerRef}
          >
            {fixedCourse && (
              <ListItem className={classes.fixedCourse}>
                <ListItemText
                  primary={`1. ${fixedCourse}`}
                  secondary="三人小組已完成；此志願固定且另行抽籤"
                />
              </ListItem>
            )}
            {column
              ? column.map((element, index) => (
                  <Course
                    key={element}
                    course={element}
                    index={index}
                    rankOffset={fixedCourse ? 1 : 0}
                  />
                ))
              : null}
            {provided.placeholder}
          </List>
        </div>
      )}
    </Droppable>
  );
};

Column.propTypes = {
  column: PropTypes.arrayOf(PropTypes.string).isRequired,
  title: PropTypes.string.isRequired,
  droppableId: PropTypes.string.isRequired,
  fixedCourse: PropTypes.string,
};

Column.defaultProps = { fixedCourse: "" };

export default Column;
