import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { optionalAuth, requireAuth, isAdmin } from "../lib/auth.js";
import { buildWhere, buildSort, parsePageOptions } from "../lib/query.js";
import { getEntity } from "../lib/entities.js";
import { asyncHandler, forbidden, notFound, unauthorized } from "../lib/errors.js";

export const entitiesRouter = Router();

const pageSchema = z
  .object({
    sort: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    skip: z.coerce.number().int().min(0).optional(),
  })
  .passthrough();

const querySchema = z.object({
  where: z.record(z.any()).optional(),
  sort: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

function userIdOf(req) {
  return req.user?.id || req.user?.userId || req.user?.sub || null;
}

function resolve(req) {
  const entity = getEntity(req.params.entity);
  if (!entity) throw notFound(`Unknown entity "${req.params.entity}"`);
  return entity;
}

function ownerIdOf(entity, row) {
  switch (entity.delegate) {
    case "profile": return row.user_id || row.created_by_id;
    case "listing": return row.seller_id || row.created_by_id;
    case "post": return row.author_id || row.created_by_id;
    case "pet": return row.owner_id || row.created_by_id;
    case "comment": return row.author_id || row.created_by_id;
    case "like": return row.user_id || row.created_by_id;
    case "follow": return row.follower_id || row.created_by_id;
    case "event": return row.organizer_id || row.created_by_id;
    default: return row.created_by_id;
  }
}

function canWrite(entity, req, row) {
  if (isAdmin(req)) return true;
  switch (entity.write) {
    case "ownerOrAdmin":
      return ownerIdOf(entity, row) === userIdOf(req);
    case "memberOrAdmin":
      return Array.isArray(row.members) && row.members.includes(userIdOf(req));
    case "adminOnly":
    case "serviceOnly":
      return false;
    default:
      return false;
  }
}

// FIX: przyjmowało req z zewnątrz (ReferenceError → 500 na stronie startowej).
async function ensureWalletFor(userId) {
  if (!userId) return null;
  const existing = await prisma.wallet.findUnique({ where: { user_id: userId } });
  if (existing) return existing;
  return prisma.wallet.create({
    data: { user_id: userId, coins: 0, xp: 0, level: 1, badges: [], extra_media: 0 },
  });
}

// Wallet.filter({ user_id: me }) musi działać jak helper loadWallet z Base44:
// zwraca portfel, tworząc domyślny, gdy nie istnieje. Błąd portfela NIGDY nie może
// wywalić zapytania (awaria bazy ≠ awaria feedu).
async function maybeEnsureWallet(entity, req, where) {
  if (entity.delegate !== "wallet" || !req.user) return;
  try {
    const branches = [where, ...(Array.isArray(where.AND) ? where.AND : [])];
    const myId = userIdOf(req);
    const mentionsMe = branches.some(
      (branch) =>
        branch?.user_id === myId ||
        (Array.isArray(branch?.user_id?.in) && branch.user_id.in.includes(myId))
    );
    if (mentionsMe) await ensureWalletFor(myId);
  } catch (err) {
    console.error("wallet ensure failed (nieprzerywające):", err?.message);
  }
}

function baseReadWhere(entity, req) {
  if (entity.authRead && !req.user) throw unauthorized();
  if (!entity.readScope) return {};
  // Returned as an AND-branch so client filters can never override the scope.
  return { AND: [entity.readScope(req.user, isAdmin(req))] };
}

// GET /api/entities/:entity/list?sort=&limit=&offset=
entitiesRouter.get(
  "/:entity/list",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const entity = resolve(req);
    const page = pageSchema.parse(req.query);
    const where = baseReadWhere(entity, req);
    await maybeEnsureWallet(entity, req, where);
    const items = await prisma[entity.delegate].findMany({
      where,
      orderBy: buildSort(page.sort),
      ...parsePageOptions(page),
    });
    res.json({ items });
  })
);

// POST /api/entities/:entity/query  { where, sort, limit, offset } → { items }
entitiesRouter.post(
  "/:entity/query",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const entity = resolve(req);
    const body = querySchema.parse(req.body ?? {});
    const scope = baseReadWhere(entity, req);
    const where = { ...scope, AND: [...(scope.AND ?? []), buildWhere(body.where, entity.delegate)] };
    await maybeEnsureWallet(entity, req, where);
    const items = await prisma[entity.delegate].findMany({
      where,
      orderBy: buildSort(body.sort),
      ...parsePageOptions(body),
    });
    res.json({ items });
  })
);

// POST /api/entities/:entity/count  { where } → number
entitiesRouter.post(
  "/:entity/count",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const entity = resolve(req);
    const body = querySchema.pick({ where: true }).parse(req.body ?? {});
    const scope = baseReadWhere(entity, req);
    const where = { ...scope, AND: [...(scope.AND ?? []), buildWhere(body.where, entity.delegate)] };
    const count = await prisma[entity.delegate].count({ where });
    res.json(count);
  })
);

// GET /api/entities/:entity/:id
entitiesRouter.get(
  "/:entity/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const entity = resolve(req);
    const where = baseReadWhere(entity, req);
    const row = await prisma[entity.delegate].findFirst({ where: { ...where, id: req.params.id } });
    if (!row) throw notFound();
    res.json(row);
  })
);

// POST /api/entities/:entity — create
entitiesRouter.post(
  "/:entity",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entity = resolve(req);
    if (entity.write === "serviceOnly") {
      throw forbidden(`"${req.params.entity}" records are created by dedicated endpoints`);
    }
    const data = { ...(req.body ?? {}) };
    delete data.id;
    delete data.created_date;
    delete data.updated_date;
    delete data.created_by_id;
    Object.assign(data, entity.forcedCreate ? entity.forcedCreate(req.user) : {});
    if (req.params.entity === "Message") {
      const members = Array.isArray(data.members) ? data.members : [];
      if (!members.includes(userIdOf(req))) throw forbidden("Sender must be a conversation member");
    }
    const row = await prisma[entity.delegate].create({ data: { ...data, created_by_id: userIdOf(req) } });
    if (entity.afterCreate) await entity.afterCreate(row, req.user);
    res.status(201).json(row);
  })
);

// PATCH /api/entities/:entity/:id — partial update (PUT works the same)
async function updateHandler(req, res) {
  const entity = resolve(req);
  if (entity.write === "serviceOnly") {
    throw forbidden(`"${req.params.entity}" records are updated by dedicated endpoints`);
  }
  const existing = await prisma[entity.delegate].findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound();
  if (!canWrite(entity, req, existing)) throw forbidden();
  const data = { ...(req.body ?? {}) };
  delete data.id;
  delete data.created_date;
  delete data.updated_date;
  delete data.created_by_id;
  // Admin-only fields on Profile (Base44 rls): followers, verified.
  if (req.params.entity === "Profile" && !isAdmin(req)) {
    delete data.followers;
    delete data.verified;
  }
  const row = await prisma[entity.delegate].update({ where: { id: req.params.id }, data });
  res.json(row);
}

entitiesRouter.patch("/:entity/:id", requireAuth, asyncHandler(updateHandler));
entitiesRouter.put("/:entity/:id", requireAuth, asyncHandler(updateHandler));

// DELETE /api/entities/:entity/:id
entitiesRouter.delete(
  "/:entity/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entity = resolve(req);
    const existing = await prisma[entity.delegate].findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound();
    const rule = entity.delete ?? entity.write;
    if (rule === "serviceOnly") throw forbidden(`"${req.params.entity}" records cannot be deleted directly`);
    if (rule === "adminOnly") {
      if (!isAdmin(req)) throw forbidden();
    } else if (!canWrite(entity, req, existing)) {
      throw forbidden();
    }
    await prisma[entity.delegate].delete({ where: { id: req.params.id } });
    if (entity.afterDelete) await entity.afterDelete(existing, req.user);
    res.json({ success: true });
  })
);
