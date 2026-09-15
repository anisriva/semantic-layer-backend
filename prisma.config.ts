import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://semantic_user:semantic_password@localhost:5432/semantic_layer",
  },
});
