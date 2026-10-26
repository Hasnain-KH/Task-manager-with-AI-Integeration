import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";

let BASE;
let passed = 0;
let failed = 0;
let createdId = null;

const check = (name, condition, detail) => {
    if (condition) {
        passed++;
        console.log(`PASS  ${name}`);
    } else {
        failed++;
        console.log(`FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
    }
};

const req = async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-json */ }
    return { status: res.status, json };
};

const reqAt = async (base, method, path, body) => {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-json */ }
    return { status: res.status, json };
};

const rawReq = async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-json */ }
    return { status: res.status, json };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const waitForServer = async () => {
    for (let i = 0; i < 30; i++) {
        try {
            const r = await fetch(`${BASE}/api`);
            if (r.ok) return true;
        } catch { /* not up yet */ }
        await sleep(500);
    }
    return false;
};

const main = () => {
    let child = null;
    let serverlessServer = null;

    const exit = async (code) => {
        if (child) child.kill();
        if (serverlessServer) {
            await new Promise((resolve) => serverlessServer.close(resolve));
        }
        await mongoose.disconnect();
        if (globalThis.mongod) await globalThis.mongod.stop();
        process.exit(code);
    };

    (async () => {
        console.log("Starting in-memory MongoDB...");
        globalThis.mongod = await MongoMemoryServer.create();
        const uri = globalThis.mongod.getUri();
        console.log(`In-memory MongoDB ready at ${uri.replace(/\/\/.*@/, "//***@")}`);

        process.env.MONGO_URI = uri;
        process.env.GROQ_API_KEY = " ";
        const { default: serverlessHandler } = await import("./api/index.js");
        serverlessServer = createServer((req, res) => {
            serverlessHandler(req, res).catch((err) => {
                console.error("Serverless handler test failed:", err);
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false }));
            });
        });
        await new Promise((resolve, reject) => {
            serverlessServer.once("error", reject);
            serverlessServer.listen(0, "127.0.0.1", resolve);
        });
        const serverlessBase = `http://127.0.0.1:${serverlessServer.address().port}`;
        const vercelConfig = JSON.parse(await readFile(new URL("./vercel.json", import.meta.url), "utf8"));
        check("Vercel config rewrites /api and nested API paths",
            vercelConfig.rewrites?.some((rewrite) => rewrite.source === "/api" && rewrite.destination === "/api/index.js") &&
            vercelConfig.rewrites?.some((rewrite) => rewrite.source === "/api/:path*" && rewrite.destination === "/api/index.js"));

        const [health, taskList] = await Promise.all([
            reqAt(serverlessBase, "GET", "/api"),
            reqAt(serverlessBase, "GET", "/api/tasks")
        ]);
        check("Serverless entry point connects to MongoDB and serves /api",
            health.status === 200 && health.json?.success === true,
            `status=${health.status}`);
        check("Serverless entry point serves nested task routes",
            taskList.status === 200 && Array.isArray(taskList.json?.data),
            `status=${taskList.status}`);

        let serverlessTask = await reqAt(serverlessBase, "POST", "/api/tasks", {
            title: "Serverless handler smoke test"
        });
        const serverlessTaskId = serverlessTask.json?.data?._id;
        check("Serverless entry point supports task creation",
            serverlessTask.status === 201 && Boolean(serverlessTaskId),
            `status=${serverlessTask.status}`);
        if (serverlessTaskId) {
            serverlessTask = await reqAt(serverlessBase, "DELETE", `/api/tasks/${serverlessTaskId}`);
            check("Serverless entry point supports task deletion",
                serverlessTask.status === 200,
                `status=${serverlessTask.status}`);
        }

        const serverlessAi = await reqAt(serverlessBase, "POST", "/api/ai/plan-task", { description: "" });
        check("Serverless entry point preserves the AI planner route",
            serverlessAi.status === 400 && serverlessAi.json?.success === false,
            `status=${serverlessAi.status}`);

        const portProbe = createServer();
        await new Promise((resolve, reject) => {
            portProbe.once("error", reject);
            portProbe.listen(0, "127.0.0.1", resolve);
        });
        const testPort = portProbe.address().port;
        await new Promise((resolve) => portProbe.close(resolve));
        BASE = `http://127.0.0.1:${testPort}`;

        console.log("Starting API server...");
        child = spawn("node", ["server.js"], {
            env: { ...process.env, MONGO_URI: uri, GROQ_API_KEY: " ", PORT: String(testPort) },
            stdio: ["ignore", "pipe", "pipe"]
        });
        child.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
        child.stderr.on("data", (d) => process.stdout.write(`[server-err] ${d}`));
        child.on("exit", (code) => {
            console.log(`Server exited with code ${code}`);
        });

        const up = await waitForServer();
        if (!up) {
            console.log("FAIL  server did not start");
            return exit(1);
        }

        const preflight = await fetch(`${BASE}/api/ai/plan-task`, {
            method: "OPTIONS",
            headers: {
                Origin: "http://localhost:5173",
                "Access-Control-Request-Method": "POST"
            }
        });
        check("0a. Frontend CORS preflight is allowed",
            preflight.status === 204 &&
            preflight.headers.get("access-control-allow-origin") === "http://localhost:5173",
            `status=${preflight.status}`);

        const blockedOrigin = await fetch(`${BASE}/api`, {
            headers: { Origin: "https://untrusted.example" }
        });
        check("0b. Unconfigured browser origin is not allowed",
            !blockedOrigin.headers.has("access-control-allow-origin"),
            `allow-origin=${blockedOrigin.headers.get("access-control-allow-origin")}`);

        // 1. Create a task successfully
        let r = await req("POST", "/api/tasks", {
            title: "Build portfolio website",
            description: "Create a personal portfolio website",
            status: "pending",
            dueDate: "2026-10-25"
        });
        check("1. Create task successfully (201)",
            r.status === 201 && r.json?.success === true && r.json?.data?._id,
            `status=${r.status}`);
        createdId = r.json?.data?._id;

        // 2. Retrieve all tasks
        r = await req("GET", "/api/tasks");
        check("2. Retrieve all tasks (200, array)",
            r.status === 200 && Array.isArray(r.json?.data) && r.json.data.length >= 1,
            `status=${r.status}`);

        // 3. Retrieve one task by ID
        r = await req("GET", `/api/tasks/${createdId}`);
        check("3. Retrieve one task by ID (200)",
            r.status === 200 && r.json?.data?._id === createdId && r.json?.data?.title === "Build portfolio website",
            `status=${r.status}`);

        // 4. Update a task
        r = await req("PUT", `/api/tasks/${createdId}`, {
            title: "Build portfolio website",
            description: "Updated description",
            status: "in-progress",
            dueDate: "2026-10-26"
        });
        check("4. Update a task (200, status=in-progress)",
            r.status === 200 && r.json?.data?.status === "in-progress" && r.json?.data?.description === "Updated description",
            `status=${r.status}, got=${JSON.stringify(r.json?.data?.status)}`);

        // 9 (before delete). 404 for nonexistent task
        r = await req("GET", "/api/tasks/000000000000000000000000");
        check("9a. 404 for nonexistent task (GET)", r.status === 404, `status=${r.status}`);
        r = await req("PUT", "/api/tasks/000000000000000000000000", {
            title: "x", description: "", status: "pending", dueDate: null
        });
        check("9b. 404 for nonexistent task (PUT)", r.status === 404, `status=${r.status}`);

        // 5. Delete a task
        r = await req("DELETE", `/api/tasks/${createdId}`);
        check("5. Delete a task (200)", r.status === 200 && r.json?.success === true, `status=${r.status}`);
        r = await req("GET", `/api/tasks/${createdId}`);
        check("5b. Deleted task now returns 404", r.status === 404, `status=${r.status}`);

        // 6. Reject a missing title
        r = await req("POST", "/api/tasks", { description: "no title here" });
        check("6. Reject missing title (400)", r.status === 400, `status=${r.status}`);
        r = await req("POST", "/api/tasks", { title: "   ", description: "blank title" });
        check("6b. Reject blank title (400)", r.status === 400, `status=${r.status}`);
        r = await req("POST", "/api/tasks");
        check("6c. Reject missing task body (400 JSON)", r.status === 400 && r.json?.success === false, `status=${r.status}`);
        r = await req("POST", "/api/tasks", []);
        check("6d. Reject non-object task body (400 JSON)", r.status === 400 && r.json?.success === false, `status=${r.status}`);
        r = await rawReq("POST", "/api/tasks", "{\"title\":");
        check("6e. Reject malformed JSON (400 JSON)", r.status === 400 && r.json?.success === false, `status=${r.status}`);
        r = await req("POST", "/api/tasks", { title: "Bad date", dueDate: "not-a-date" });
        check("6f. Reject invalid due date (400)", r.status === 400, `status=${r.status}`);
        r = await rawReq("POST", "/api/tasks", JSON.stringify({ title: "x".repeat(12_000) }));
        check("6g. Reject oversized JSON body (413)", r.status === 413, `status=${r.status}`);

        // 7. Reject an invalid status
        r = await req("POST", "/api/tasks", { title: "Valid title", status: "done" });
        check("7. Reject invalid status (400)", r.status === 400, `status=${r.status}`);

        // 8. Handle an invalid MongoDB ID
        r = await req("GET", "/api/tasks/not-a-valid-id");
        check("8a. Handle invalid ID on GET (400)", r.status === 400, `status=${r.status}`);
        r = await req("PUT", "/api/tasks/123", { title: "x", status: "pending" });
        check("8b. Handle invalid ID on PUT (400)", r.status === 400, `status=${r.status}`);
        r = await req("DELETE", "/api/tasks/abc");
        check("8c. Handle invalid ID on DELETE (400)", r.status === 400, `status=${r.status}`);

        // 11. Handle an empty AI description
        r = await req("POST", "/api/ai/plan-task", { description: "" });
        check("11. Handle empty AI description (400)", r.status === 400, `status=${r.status}`);
        r = await req("POST", "/api/ai/plan-task", {});
        check("11b. Handle missing AI description (400)", r.status === 400, `status=${r.status}`);

        r = await req("POST", "/api/ai/plan-task", { description: "test" });
        check("12a. AI without key returns meaningful 500", r.status === 500 && r.json?.success === false, `status=${r.status}`);
        let rateLimited = false;
        for (let i = 0; i < 21; i++) {
            r = await req("POST", "/api/ai/plan-task", { description: "" });
            if (r.status === 429) rateLimited = true;
        }
        check("12b. AI endpoint enforces rate limit (429)", rateLimited, `last status=${r.status}`);

        console.log(`\nResult: ${passed} passed, ${failed} failed`);
        await exit(failed > 0 ? 1 : 0);
    })().catch(async (err) => {
        console.error("Harness error:", err);
        await exit(1);
    });
};

main();
