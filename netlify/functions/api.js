const express = require("express");
const serverless = require("serverless-http");
const leagueRouter = require("../../router");

const app = express();
app.use(express.json());
app.use(leagueRouter);

module.exports.handler = serverless(app);
