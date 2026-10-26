import mongoose from "mongoose";

const dbConnect = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is not configured");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("Database connected");
};

export default dbConnect;
