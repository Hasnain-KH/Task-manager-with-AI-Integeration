import mongoose from "mongoose";

const dbConnect = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Database connected!");
    } catch (err) {
        console.log(err);
        console.log("Database connection failed");
        process.exit(1);
    }
};

export default dbConnect;
