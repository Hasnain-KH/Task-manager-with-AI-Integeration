import mongoose from "mongoose";

const taskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, "Title is required"],
        trim: true
    },
    description: {
        type: String,
        default: "",
        trim: true
    },
    status: {
        type: String,
        enum: {
            values: ["pending", "in-progress", "completed"],
            message: "Status must be pending, in-progress, or completed"
        },
        default: "pending"
    },
    dueDate: {
        type: Date,
        default: null
    }
});

const Task = mongoose.model("Task", taskSchema);

export default Task;
