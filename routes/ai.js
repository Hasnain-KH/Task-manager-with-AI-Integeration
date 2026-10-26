import express from "express";
import { rateLimit } from "express-rate-limit";
import { planTask } from "../controllers/aiController.js";

const router = express.Router();

const planTaskLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: "Too many AI planning requests. Please try again later."
        });
    }
});

router.post("/plan-task", planTaskLimiter, planTask);

export default router;
