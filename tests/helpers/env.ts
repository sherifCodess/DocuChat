import dotenv from "dotenv";

// Load the test environment before anything imports config.ts.
// dotenv never overrides variables that are already set, so these values win over .env.
dotenv.config({ path: ".env.test", quiet: true });
process.env.NODE_ENV = "test";

// Safety: never let tests touch the development database.
if (!process.env.DATABASE_URL?.includes("test")) {
  throw new Error(
    "Tests must run against a test database. Create .env.test with DATABASE_URL=file:./test.db",
  );
}
