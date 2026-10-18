import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "child_process";

const BASE = "http://localhost:5000";
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

    const exit = async (code) => {
        if (child) child.kill();
        if (globalThis.mongod) await globalThis.mongod.stop();
        process.exit(code);
    };

    (async () => {
        console.log("Starting in-memory MongoDB...");
        globalThis.mongod = await MongoMemoryServer.create();
        const uri = globalThis.mongod.getUri();
        console.log(`In-memory MongoDB ready at ${uri.replace(/\/\/.*@/, "//***@")}`);

        console.log("Starting API server...");
        child = spawn("node", ["server.js"], {
            env: { ...process.env, MONGO_URI: uri, GROQ_API_KEY: process.env.GROQ_API_KEY || "", PORT: "5000" },
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

        // 10/12. Real AI plan (only if key present)
        if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) {
            r = await req("POST", "/api/ai/plan-task", {
                description: "I need to build a portfolio website within three days."
            });
            const plan = r.json?.plan;
            check("10. Generate a real AI task plan (200, valid plan)",
                r.status === 200 && typeof plan?.summary === "string" &&
                ["low", "medium", "high"].includes(plan?.priority) &&
                typeof plan?.estimatedHours === "number" && plan?.estimatedHours > 0 &&
                Array.isArray(plan?.steps) && plan?.steps.length > 0,
                `status=${r.status}, body=${JSON.stringify(r.json).slice(0, 300)}`);
        } else {
            console.log("SKIP  10. Real AI plan -- GROQ_API_KEY not set");
            r = await req("POST", "/api/ai/plan-task", { description: "test" });
            check("12a. AI without key returns meaningful 500", r.status === 500, `status=${r.status}`);
        }

        console.log(`\nResult: ${passed} passed, ${failed} failed`);
        await exit(failed > 0 ? 1 : 0);
    })().catch(async (err) => {
        console.error("Harness error:", err);
        await exit(1);
    });
};

main();
