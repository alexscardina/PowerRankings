const express = require("express");
const serverless = require("serverless-http");
const { connectLambda } = require("@netlify/blobs");
const leagueRouter = require("../../router");

const app = express();
app.use(express.json({ limit: "1mb" }));
// Netlify rewrites /api/* here and preserves the /api prefix for Express
app.use("/api", leagueRouter);

const expressHandler = serverless(app);

exports.handler = async (event, context) => {
  // Required so @netlify/blobs can resolve site credentials in Functions
  try {
    connectLambda(event);
  } catch (error) {
    console.error("connectLambda failed:", error.message);
  }
  return expressHandler(event, context);
};
