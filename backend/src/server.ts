import "reflect-metadata";
import express from "express";
import cors from "cors";

import { initializeDataSource } from "./config/database.js";
import apiRoutes from "./api/routes/index.js";
import { errorHandler } from "./api/middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.raw({ type: "application/octet-stream", limit: "25mb" }));
app.use(express.json());

app.use("/api/v1", apiRoutes);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use(errorHandler);

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test") {
  initializeDataSource()
    .then(() => {
      app.listen(port, () => {
        console.log(`Backend listening on port ${port}`);
      });
    })
    .catch((error) => {
      console.error("Failed to initialize data source", error);
      process.exit(1);
    });
}

export default app;
