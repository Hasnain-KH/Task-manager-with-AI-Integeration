import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import dbConnect from "./config/db.js";
import taskRouter from "./routes/task.js";
import aiRouter from "./routes/ai.js";
import { resolve } from "node:path";

const PORT = process.env.PORT || 5000;
const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        callback(null, !origin || allowedOrigins.includes(origin));
    }
}));
app.use(express.json({ limit: "10kb" }));

app.get("/api", (req, res) => {
    res.json({ success: true, message: "Task Manager API is running" });
});

app.use("/api/tasks", taskRouter);
app.use("/api/ai", aiRouter);

app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ success: false, message: "Request body contains invalid JSON" });
    }
    if (err.type === "entity.too.large") {
        return res.status(413).json({ success: false, message: "Request body must be 10kb or smaller" });
    }

    console.error("Unhandled API error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
});

export { app };

export const startServer = async () => {
    try {
        await dbConnect();
        return await new Promise((resolveServer, rejectServer) => {
            const server = app.listen(PORT, () => {
                console.log(`Server is running on port ${PORT}`);
                resolveServer(server);
            });
            server.once("error", rejectServer);
        });
    } catch (err) {
        try {
            await mongoose.disconnect();
        } catch (disconnectError) {
            console.error("Database cleanup failed:", disconnectError.name);
        }
        throw err;
    }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    startServer().catch((err) => {
        console.error("Server startup failed:", err.name, "- check MONGO_URI and PORT configuration");
        process.exitCode = 1;
    });
}
