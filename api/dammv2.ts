import { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log(req.body)
  console.log(req.headers.authorization);
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { userId, content } = req.body

  const { error } = await supabase.from("messages").insert([
    { user_id: userId, content }
  ])

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  res.status(200).json({ success: true })
}