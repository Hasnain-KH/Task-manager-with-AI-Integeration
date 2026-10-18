import dotenv from "dotenv";
dotenv.config();

import express from "express";
import dbConnect from "./config/db.js";
import taskRouter from "./routes/task.js";
import aiRouter from "./routes/ai.js";

const PORT = process.env.PORT || 5000;
const app = express();

dbConnect();

app.use(express.json());

app.get("/api", (req, res) => {
    res.json({ success: true, message: "Task Manager API is running" });
});

app.use("/api/tasks", taskRouter);
app.use("/api/ai", aiRouter);

app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
