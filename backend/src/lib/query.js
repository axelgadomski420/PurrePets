import { badRequest } from "./errors.js";

// Fields that hold arrays of strings. For those, a plain equality value means
// "array contains value" (Base44 semantics: Conversation.filter({ members: me.id })).
const ARRAY_FIELDS = new Set([
  "species", "breeds", // Profile
  "image_urls", // Listing
  "photos", // Pet
  "tags", // Post
  "members", "member_names", // Conversation / Message
  "badges", // Wallet
]);

function valueToPrisma(field, value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const out = {};
    for (const [op, opValue] of Object.entries(value)) {
      switch (op) {
        case "$in":
          if (!Array.isArray(opValue)) throw badRequest(`$in on "${field}" expects an array`);
          out.in = opValue;
          break;
        case "$nin":
          if (!Array.isArray(opValue)) throw badRequest(`$nin on "${field}" expects an array`);
          out.notIn = opValue;
          break;
        case "$regex":
          out.contains = String(opValue);
          break;
        case "$ne":
          out.not = ARRAY_FIELDS.has(field) ? { has: opValue } : opValue;
          break;
        case "$gt": out.gt = opValue; break;
        case "$gte": out.gte = opValue; break;
        case "$lt": out.lt = opValue; break;
        case "$lte": out.lte = opValue; break;
        default:
          throw badRequest(`Unsupported filter operator "${op}" on "${field}"`);
      }
    }
    return out;
  }
  if (ARRAY_FIELDS.has(field)) return { has: value };
  return value;
}

// Base44-style where → Prisma where. Supports $or / $and at any level.
export function buildWhere(where) {
  if (!where || typeof where !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(where)) {
    if (key === "$or") {
      if (!Array.isArray(value)) throw badRequest("$or expects an array");
      out.OR = value.map((sub) => buildWhere(sub));
      continue;
    }
    if (key === "$and") {
      if (!Array.isArray(value)) throw badRequest("$and expects an array");
      out.AND = value.map((sub) => buildWhere(sub));
      continue;
    }
    if (key.startsWith("$")) throw badRequest(`Unsupported filter operator "${key}"`);
    out[key] = valueToPrisma(key, value);
  }
  return out;
}

// "-created_date" → { created_date: "desc" }, "price" → { price: "asc" }.
const SORTABLE = new Set([
  "created_date", "updated_date", "price", "followers", "score", "last_message_at", "title", "coins",
]);

export function buildSort(sort) {
  if (!sort) return [{ created_date: "desc" }];
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  if (!SORTABLE.has(field)) throw badRequest(`Cannot sort by "${field}"`);
  return [{ [field]: desc ? "desc" : "asc" }];
}

export function parsePageOptions(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const offset = Math.max(Number(opts.offset ?? opts.skip) || 0, 0);
  return { take: limit, skip: offset };
}
