const express = require("express");
const serverless = require("serverless-http");
const leagueRouter = require("../../router");

const app = express();
app.use(express.json());
// Netlify rewrites /api/* here and preserves the /api prefix for Express
app.use("/api", leagueRouter);

exports.handler = serverless(app);
