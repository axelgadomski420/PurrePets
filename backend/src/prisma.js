import { PrismaClient } from "@prisma/client";

// Single PrismaClient instance shared by the whole process.
// - connection_limit + pool_timeout: stabilne pod PM2 (brak wyczerpania połączeń),
// - error/warn logging: natychmiastowa diagnostyka błędów uprawnień (42501),
// - pgbouncer-friendly (jeśli kiedyś dojdzie PgBouncer — transaction mode).
const url = process.env.DATABASE_URL ?? "";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
  datasources: {
    db: {
      url: url.includes("connection_limit")
        ? url
        : url + (url.includes("?") ? "&" : "?") + "connection_limit=10&pool_timeout=20",
    },
  },
});

// Wyraźny komunikat przy błędach uprawnień PostgreSQL (SQLSTATE 42501) —
// zamiast surowego "permission denied for schema public" operator dostaje instrukcję naprawy.
