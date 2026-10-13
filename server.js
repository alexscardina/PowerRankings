require("dotenv").config();

const express = require("express");
const leagueRouter = require("./router");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use("/api", leagueRouter);

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
