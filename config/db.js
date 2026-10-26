import mongoose from "mongoose";

const cacheKey = Symbol.for("task-manager.mongoose");
const connectionCache = globalThis[cacheKey] ??= {
    promise: null,
    uri: null
};

const dbConnect = async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        throw new Error("MONGO_URI is not configured");
    }

    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (mongoose.connection.readyState === 2 &&
        connectionCache.uri === uri &&
        connectionCache.promise) {
        return connectionCache.promise;
    }

    connectionCache.uri = uri;
    connectionCache.promise = mongoose.connect(uri)
        .then((connection) => {
            console.log("Database connected");
            return connection;
        })
        .catch((err) => {
            connectionCache.promise = null;
            connectionCache.uri = null;
            throw err;
        });

    return connectionCache.promise;
};

export default dbConnect;
