import type { VercelRequest, VercelResponse } from "@vercel/node";
import dammv2Handler from "../src/webhookHandlers/dammv2Handler";

export default function handler(req: VercelRequest, res: VercelResponse) {
  dammv2Handler(req, res);
}