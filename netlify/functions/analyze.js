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
          headers: { "Content-Type": "application/json" },
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
      const signedInWithGoogle = providers.some(provider => provider.providerId === "google.com");

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
                  text: `Act as a forensic writing expert. Analyze this text for signs of AI generation. Provide a verdict (Human or AI), a percentage likelihood, and a one-sentence justification:\n\n${text}`
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server failed to contact Gemini" })
    };
  }
}
