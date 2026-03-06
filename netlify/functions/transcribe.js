exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const body = JSON.parse(event.body);
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return { statusCode: 500, body: JSON.stringify({ error: "GROQ_API_KEY not set in Netlify environment." }) };

    const audioBuffer = Buffer.from(body.audioBase64, "base64");
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    const fileName = body.fileName || "call.wav";
    const mimeType = body.mimeType || "audio/wav";

    // Manually build multipart/form-data
    const beforeFile = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const modelPart = Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\ntext\r\n--${boundary}--\r\n`
    );
    const formBody = Buffer.concat([beforeFile, audioBuffer, modelPart]);

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: formBody,
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: "Groq error: " + err }) };
    }

    const transcript = await groqRes.text();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ transcript }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
