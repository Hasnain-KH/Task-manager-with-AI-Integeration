const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT = `You are a task planning assistant.
Given a task description, create a practical plan.

Respond with ONLY a valid JSON object using exactly this structure:
{
  "summary": "a short one-sentence summary of the task",
  "priority": "low" | "medium" | "high",
  "estimatedHours": a positive number,
  "steps": ["actionable step 1", "actionable step 2", ...]
}

Rules:
- "priority" must be exactly one of: low, medium, high.
- "estimatedHours" must be a positive number.
- "steps" must contain between 2 and 6 short, actionable strings.
- Do not wrap the JSON in markdown code fences.
- Do not add any text outside the JSON object.`;

const isValidPlan = (plan) => {
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) return false;
    const requiredKeys = ["summary", "priority", "estimatedHours", "steps"];
    if (Object.keys(plan).length !== requiredKeys.length ||
        Object.keys(plan).some((key) => !requiredKeys.includes(key))) return false;
    if (typeof plan.summary !== "string" || !plan.summary.trim()) return false;
    if (!["low", "medium", "high"].includes(plan.priority)) return false;
    if (typeof plan.estimatedHours !== "number" || !Number.isFinite(plan.estimatedHours) || plan.estimatedHours <= 0) return false;
    if (!Array.isArray(plan.steps) || plan.steps.length < 2 || plan.steps.length > 6) return false;
    if (!plan.steps.every((step) => typeof step === "string" && step.trim())) return false;
    return true;
};

const stripCodeFences = (text) => {
    const trimmed = text.trim();
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    return match ? match[1] : trimmed;
};

// POST /api/ai/plan-task
export const planTask = async (req, res) => {
    const { description } = req.body ?? {};

    if (typeof description !== "string" || !description.trim()) {
        return res.status(400).json({
            success: false,
            message: "Please provide a non-empty task description"
        });
    }

    if (description.trim().length > 5_000) {
        return res.status(400).json({
            success: false,
            message: "Task description must be 5000 characters or fewer"
        });
    }

    if (!process.env.GROQ_API_KEY?.trim()) {
        return res.status(500).json({
            success: false,
            message: "AI planning is not configured on the server"
        });
    }

    try {
        const response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                temperature: 0.3,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: description.trim() }
                ]
            }),
            signal: AbortSignal.timeout(GROQ_TIMEOUT_MS)
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                return res.status(502).json({
                    success: false,
                    message: "Groq API rejected the server API key or permissions"
                });
            }
            if (response.status === 429) {
                return res.status(429).json({
                    success: false,
                    message: "Groq API rate limit reached, please try again later"
                });
            }
            return res.status(502).json({
                success: false,
                message: `Groq AI request failed with status ${response.status}`
            });
        }

        const completion = await response.json();
        const content = completion?.choices?.[0]?.message?.content;

        if (typeof content !== "string" || !content.trim()) {
            return res.status(502).json({
                success: false,
                message: "AI returned an empty response"
            });
        }

        let plan;
        try {
            plan = JSON.parse(stripCodeFences(content));
        } catch {
            return res.status(502).json({
                success: false,
                message: "AI returned invalid JSON"
            });
        }

        if (!isValidPlan(plan)) {
            return res.status(502).json({
                success: false,
                message: "AI returned a plan with an unexpected structure"
            });
        }

        return res.status(200).json({
            success: true,
            plan: {
                summary: plan.summary.trim(),
                priority: plan.priority,
                estimatedHours: plan.estimatedHours,
                steps: plan.steps.map((step) => step.trim())
            }
        });
    } catch (err) {
        if (err.name === "TimeoutError" || err.name === "AbortError") {
            return res.status(504).json({
                success: false,
                message: "Groq AI request timed out, please try again"
            });
        }
        return res.status(502).json({
            success: false,
            message: "Could not reach the Groq AI service"
        });
    }
};
