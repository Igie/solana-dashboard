import type { VercelRequest, VercelResponse } from '@vercel/node';

export async function dammv2Handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  console.log("Helius DAMMv2 webhook payload:", req.body);

  res.status(200).json({ received: true });
}