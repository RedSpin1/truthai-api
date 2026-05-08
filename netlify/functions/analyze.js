export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "https://truthai.online",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Missing GEMINI_API_KEY in Netlify" })
    };
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid request body" })
    };
  }

  const text = body.text;

  if (!text) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "No text provided" })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (idToken) {
    try {
      const verifyResponse = await fetch(
        "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyBTfH0NhDeTmxjhwjxYgr7YzK4V4zQrcI4",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ idToken })
        }
      );

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyData.users?.length) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: "Invalid login session" })
        };
      }

      const user = verifyData.users[0];
      const providers = user.providerUserInfo || [];
      const signedInWithGoogle = providers.some(
        provider => provider.providerId === "google.com"
      );

      if (!signedInWithGoogle && !user.emailVerified) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: "Email verification required" })
        };
      }
    } catch {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Could not verify login session" })
      };
    }
  }

  try {
    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Act as a forensic writing expert.

Analyze this text for signs of AI generation.

Return raw JSON only. Do not use markdown code blocks.

Use this exact JSON format:

{
  "title": "2 to 4 word scan title",
  "result": "**Verdict:** <Human or AI>\\n\\n**Likelihood:** <percentage>\\n\\n**Justification:** <one sentence explanation>"
}

Rules:
- The title must be 2 to 4 words.
- The title should describe the topic of the text.
- Do not mention the title inside the result.
- Do not return anything outside the JSON.
- The result must stay simple and easy to understand.
- The likelihood must include a percentage.

Text:
${text}`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      return {
        statusCode: geminiResponse.status,
        headers,
        body: JSON.stringify({
          error: data.error?.message || "Gemini API error"
        })
      };
    }

    const rawText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const cleanedText = rawText
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(cleanedText);
    } catch {
      parsed = {
        title: "Untitled Scan",
        result: cleanedText || rawText || "Error retrieving analysis."
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        title: parsed.title || "Untitled Scan",
        result: parsed.result || "Error retrieving analysis."
      })
    };
  } catch {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server failed to contact Gemini" })
    };
  }
}
