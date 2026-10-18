import express from "express";
import { planTask } from "../controllers/aiController.js";

const router = express.Router();

router.post("/plan-task", planTask);

export default router;
