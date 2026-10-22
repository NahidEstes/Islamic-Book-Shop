import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectStore, seedMongo } from "./store";
dotenv.config({ path: [".env.local", ".env"], quiet: true });
async function main() {
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI in .env.local before seeding.");
  await connectStore(process.env.MONGODB_URI, true);
  await seedMongo();
  console.log("Inserted missing sample books; existing products were preserved.");
  await mongoose.disconnect();
}
main().catch(async (error) => { console.error(error.message); await mongoose.disconnect(); process.exit(1); });
