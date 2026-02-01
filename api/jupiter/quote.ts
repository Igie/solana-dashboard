import type { VercelRequest, VercelResponse } from "@vercel/node";

const JUPITER_BASE_URL = "https://api.jup.ag/swap/v1/quote";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    const url = new URL(`${JUPITER_BASE_URL}`);

    // Forward all query params from client to Jupiter
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === "string") {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        "x-api-key": `${process.env.JUPITER_API_KEY}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).send(text);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error("Jupiter quote proxy error:", err);
    res.status(500).json({ error: "Internal proxy error" });
  }
}
