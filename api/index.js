import dbConnect from "../config/db.js";
import { app } from "../server.js";

export default async function handler(req, res) {
    try {
        await dbConnect();
    } catch (err) {
        console.error("Serverless database connection failed:", err.name);
        return res.status(503).json({
            success: false,
            message: "Database is temporarily unavailable"
        });
    }

    return app(req, res);
}
