import React from "react";
import Top from "./TopSection";
//import Login from "../login";
import Explanation from "./ExplanationSection";
import Usage from "./UsageSection";
import Footer from "./Footer.js";
export default function Main() {
  return (
    <div>
      <Top />
      <Explanation />
      <div style={{ height: "clamp(40px, 8vw, 100px)" }} />
      <Usage />
      <Footer />
    </div>
  );
}
