import mongoose from "mongoose";
import Task from "../models/Task.js";

const isValidId = (id) => mongoose.isObjectIdOrHexString(id);

const validateTaskFields = (body, { requireTitle }) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "Request body must be a JSON object";
    }

    const { title, description, status, dueDate } = body;

    if (requireTitle) {
        if (title === undefined) {
            return "Title is required";
        }
        if (typeof title !== "string" || !title.trim()) {
            return "Title must be a non-empty string";
        }
    } else if (title !== undefined && (typeof title !== "string" || !title.trim())) {
        return "Title must be a non-empty string";
    }

    if (description !== undefined && typeof description !== "string") {
        return "Description must be a string";
    }

    const allowedStatuses = ["pending", "in-progress", "completed"];
    if (status !== undefined) {
        if (typeof status !== "string" || !allowedStatuses.includes(status)) {
            return "Status must be one of: pending, in-progress, completed";
        }
    }

    if (dueDate !== undefined && dueDate !== null) {
        if (typeof dueDate !== "string" || isNaN(Date.parse(dueDate))) {
            return "dueDate must be a valid date string";
        }
    }

    return null;
};

// POST /api/tasks
export const createTask = async (req, res) => {
    const error = validateTaskFields(req.body, { requireTitle: true });
    if (error) {
        return res.status(400).json({ success: false, message: error });
    }

    try {
        const { title, description, status, dueDate } = req.body;

        const task = await Task.create({
            title: title.trim(),
            description: description ?? "",
            status: status ?? "pending",
            dueDate: dueDate || null
        });

        return res.status(201).json({
            success: true,
            message: "Task created successfully",
            data: task
        });
    } catch (err) {
        if (err.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: Object.values(err.errors).map((e) => e.message).join(", ")
            });
        }
        console.error("Failed to create task:", err.name);
        return res.status(500).json({ success: false, message: "Server error while creating task" });
    }
};

// GET /api/tasks
export const getTasks = async (req, res) => {
    try {
        const tasks = await Task.find();

        return res.status(200).json({
            success: true,
            message: "Tasks fetched successfully",
            data: tasks
        });
    } catch (err) {
        console.error("Failed to fetch tasks:", err.name);
        return res.status(500).json({ success: false, message: "Server error while fetching tasks" });
    }
};

// GET /api/tasks/:id
export const getTaskById = async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
        return res.status(400).json({ success: false, message: "Invalid task ID" });
    }

    try {
        const task = await Task.findById(id);

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Task fetched successfully",
            data: task
        });
    } catch (err) {
        console.error("Failed to fetch task:", err.name);
        return res.status(500).json({ success: false, message: "Server error while fetching task" });
    }
};

// PUT /api/tasks/:id
export const updateTask = async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
        return res.status(400).json({ success: false, message: "Invalid task ID" });
    }

    const error = validateTaskFields(req.body, { requireTitle: true });
    if (error) {
        return res.status(400).json({ success: false, message: error });
    }

    try {
        const { title, description, status, dueDate } = req.body;

        const task = await Task.findByIdAndUpdate(
            id,
            {
                title: title.trim(),
                description: description ?? "",
                status: status ?? "pending",
                dueDate: dueDate || null
            },
            { returnDocument: "after", runValidators: true }
        );

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Task updated successfully",
            data: task
        });
    } catch (err) {
        if (err.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: Object.values(err.errors).map((e) => e.message).join(", ")
            });
        }
        console.error("Failed to update task:", err.name);
        return res.status(500).json({ success: false, message: "Server error while updating task" });
    }
};

// DELETE /api/tasks/:id
export const deleteTask = async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
        return res.status(400).json({ success: false, message: "Invalid task ID" });
    }

    try {
        const task = await Task.findByIdAndDelete(id);

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Task deleted successfully",
            data: task
        });
    } catch (err) {
        console.error("Failed to delete task:", err.name);
        return res.status(500).json({ success: false, message: "Server error while deleting task" });
    }
};
