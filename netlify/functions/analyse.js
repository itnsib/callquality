exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const { transcript, agentName } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set in Netlify environment." }) };

    const prompt = `You are a senior QA evaluator for New Shield Insurance Brokers (NSIB), a UAE insurance brokerage. Evaluate the telesales call transcript below.

Return ONLY valid raw JSON — no markdown, no backticks, no text before or after:

{
  "overall_score": <number 0-100>,
  "grade": "<A|B|C|D|F>",
  "verdict": "<one sentence>",
  "summary": "<2-3 sentence assessment>",
  "agent_name": "<name from call or '${agentName||"Unknown"}'>",
  "sentiment": "<Positive|Neutral|Negative>",
  "call_outcome": "<Interested|Follow-up Needed|Not Interested|Sale Closed|Unknown>",
  "categories": {
    "greeting":           {"score":<0-10>,"max":10,"good":"<strength>","improve":"<improvement>"},
    "needs_discovery":    {"score":<0-20>,"max":20,"good":"<strength>","improve":"<improvement>"},
    "product_knowledge":  {"score":<0-20>,"max":20,"good":"<strength>","improve":"<improvement>"},
    "objection_handling": {"score":<0-20>,"max":20,"good":"<strength>","improve":"<improvement>"},
    "compliance":         {"score":<0-15>,"max":15,"good":"<strength>","improve":"<improvement>"},
    "closing":            {"score":<0-15>,"max":15,"good":"<strength>","improve":"<improvement>"}
  },
  "coaching_tips": ["<tip1>","<tip2>","<tip3>"],
  "red_flags": [],
  "best_moments": ["<moment1>","<moment2>"]
}

Scoring:
- Greeting (10): warm professional opening, stated name/company, positive tone
- Needs Discovery (20): open-ended questions, understood situation, identified insurance need
- Product Knowledge (20): accurate coverage/benefits/pricing, matched to customer need
- Objection Handling (20): empathetic responses, no pressure or manipulation
- Compliance (15): no false promises, disclosed exclusions/terms, ethical conduct
- Closing (15): summarized benefits, asked for commitment, set next steps

TRANSCRIPT:
${transcript}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const raw = data.content[0].text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(parsed),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
