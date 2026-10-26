import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createTask, updateTask } from "../controllers/taskController.js";
import { planTask } from "../controllers/aiController.js";

const makeResponse = () => ({
    statusCode: 200,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    }
});

const validPlan = {
    summary: "Prepare the project launch",
    priority: "medium",
    estimatedHours: 3,
    steps: ["Review the requirements", "Prepare the release"]
};

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.GROQ_API_KEY;

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
        delete process.env.GROQ_API_KEY;
    } else {
        process.env.GROQ_API_KEY = originalApiKey;
    }
});

test("task endpoints return JSON validation errors for missing or non-object bodies", async () => {
    for (const body of [undefined, null, [], "not an object"]) {
        const response = makeResponse();
        await createTask({ body }, response);
        assert.equal(response.statusCode, 400);
        assert.equal(response.body.success, false);
        assert.match(response.body.message, /JSON object/);
    }

    const response = makeResponse();
    await updateTask({ params: { id: "507f1f77bcf86cd799439011" }, body: undefined }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
});

test("AI plan accepts the exact contract with two through six steps", async () => {
    process.env.GROQ_API_KEY = "test-key";
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(validPlan) } }] })
    });

    const response = makeResponse();
    await planTask({ body: { description: "Prepare for launch" } }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.plan, validPlan);
});

test("AI plan rejects too few steps and unexpected fields", async () => {
    process.env.GROQ_API_KEY = "test-key";
    for (const plan of [
        { ...validPlan, steps: ["Only one step"] },
        { ...validPlan, steps: Array(7).fill("A valid step") },
        { ...validPlan, extra: "not allowed" }
    ]) {
        globalThis.fetch = async () => ({
            ok: true,
            json: async () => ({ choices: [{ message: { content: JSON.stringify(plan) } }] })
        });
        const response = makeResponse();
        await planTask({ body: { description: "Prepare for launch" } }, response);
        assert.equal(response.statusCode, 502);
        assert.equal(response.body.success, false);
    }
});

test("AI planner validates missing bodies and oversized descriptions before making requests", async () => {
    process.env.GROQ_API_KEY = "test-key";
    globalThis.fetch = async () => {
        throw new Error("AI must not be called for invalid input");
    };
    for (const body of [undefined, {}, { description: " " }, { description: "x".repeat(5001) }]) {
        const response = makeResponse();
        await planTask({ body }, response);
        assert.equal(response.statusCode, 400);
        assert.equal(response.body.success, false);
    }
});
