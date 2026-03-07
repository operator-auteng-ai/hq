import { NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"

export async function GET() {
  const db = getDb()
  const rows = db.select().from(schema.deployEvents).all()
  return NextResponse.json(rows)
}
