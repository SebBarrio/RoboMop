import "reflect-metadata";
import express from "express";
import cors from "cors";

import apiRoutes from "./api/routes/index.js";
import { errorHandler } from "./api/middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/v1", apiRoutes);

app.use(errorHandler);

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });
}

export default app;
