import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, isModerator } from "../lib/auth.js";
import { optionalAuth } from "../lib/auth.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/errors.js";

// MODUŁ E — konta zwierząt. Dedykowane endpointy z weryfikacją właściciela/opiekuna.
// Generyczny /api/entities/Pet zostaje dla feedu/list; tu są dane wrażliwe (E1/E8).

export const petsRouter = Router();

const dateStr = z.string().datetime().or(z.string().min(4).max(30)); // ISO lub "YYYY-MM-DD"

const petPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  species: z.enum(["dog", "cat"]).optional(),
  breed: z.string().trim().max(120).optional(),
  birth_date: dateStr.nullable().optional(),
  adoption_date: dateStr.nullable().optional(),
  sex: z.enum(["male", "female"]).nullable().optional(),
  color: z.string().trim().max(120).nullable().optional(),
  microchip: z.string().trim().max(40).nullable().optional(),
  pedigree_no: z.string().trim().max(80).nullable().optional(),
  origin_country: z.string().trim().max(80).nullable().optional(),
  origin_kennel: z.string().trim().max(120).nullable().optional(),
  mother_name: z.string().trim().max(120).nullable().optional(),
  father_name: z.string().trim().max(120).nullable().optional(),
  siblings: z.string().trim().max(1000).nullable().optional(),
  temperament: z.string().trim().max(500).nullable().optional(),
  interests: z.string().trim().max(500).nullable().optional(),
  special_needs: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["active", "deceased", "rehomed", "memorial"]).optional(),
  is_public: z.boolean().optional(),
  bio: z.string().trim().max(3000).nullable().optional(),
  photos: z.array(z.string().trim().max(500)).max(24).optional(),
  pedigree: z.boolean().optional(),
  city: z.string().trim().max(80).nullable().optional(),
});

const healthSchema = z.object({
  kind: z.enum(["vaccine", "deworming", "flea_tick", "test", "visit", "treatment", "allergy", "illness", "medication", "note"]).default("note"),
  title: z.string().trim().min(1).max(160),
  date: dateStr.nullable().optional(),
  next_date: dateStr.nullable().optional(),
  details: z.string().trim().max(2000).nullable().optional(),
  vet_name: z.string().trim().max(120).nullable().optional(),
  attachment_url: z.string().trim().max(500).nullable().optional(),
});

const eventSchema = z.object({
  kind: z.enum(["vaccine", "deworming", "grooming", "bath", "nails", "birthday", "adoption", "show", "training", "vet", "medication", "breeding", "other"]).default("other"),
  title: z.string().trim().min(1).max(160),
  date: dateStr,
  repeat: z.enum(["none", "weekly", "monthly", "yearly"]).default("none"),
  remind_days_before: z.number().int().min(0).max(30).default(3),
  note: z.string().trim().max(1000).nullable().optional(),
});

const measurementSchema = z.object({
  weight_kg: z.number().min(0).max(300).nullable().optional(),
  height_cm: z.number().min(0).max(300).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  measured_at: dateStr.optional(),
});

const achievementSchema = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.enum(["birthday", "show", "sport", "training", "breeding", "community", "custom"]).default("custom"),
  date: dateStr.nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  image_url: z.string().trim().max(500).nullable().optional(),
  organizer: z.string().trim().max(120).nullable().optional(),
});

const caregiverSchema = z.object({
  user_id: z.string().trim().min(1).max(64),
  role: z.enum(["co_owner", "caregiver"]).default("caregiver"),
});

function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function userIdOf(req) {
  return req.user?.id || req.user?.sub || null;
}

// Zwierzak dostępny dla właściciela, opiekuna (E9) albo moderatora/admina.
async function loadPetForEditor(req, id) {
  const pet = await prisma.pet.findUnique({ where: { id } });
  if (!pet) throw notFound("Nie znaleziono zwierzaka");
  if (pet.owner_id === userIdOf(req)) return pet;
  if (isModerator(req)) return pet;
  const caregiver = await prisma.petCaregiver.findFirst({
    where: { pet_id: id, user_id: userIdOf(req), status: "active" },
  });
  if (caregiver) return pet;
  throw forbidden("Tylko właściciel, opiekun lub moderator");
}

// Widok publiczny (E8): mikroczip i numer rodowodu NIGDY poza właścicielem/opiekunem/moderatorem.
function publicPet(pet, isEditor) {
  if (isEditor) return pet;
  const { microchip, pedigree_no, ...rest } = pet;
  return rest;
}

async function isEditorOf(req, pet) {
  if (!req.user) return false;
  if (pet.owner_id === userIdOf(req)) return true;
  if (isModerator(req)) return true;
  const caregiver = await prisma.petCaregiver.findFirst({
    where: { pet_id: pet.id, user_id: userIdOf(req), status: "active" },
  });
  return Boolean(caregiver);
}

// GET /api/pets/mine — moje zwierzaki + te, którymi się opiekuję (E9).
petsRouter.get("/mine", requireAuth, asyncHandler(async (req, res) => {
  const uid = userIdOf(req);
  const own = await prisma.pet.findMany({ where: { owner_id: uid }, orderBy: { created_date: "asc" } });
  const shared = await prisma.petCaregiver.findMany({ where: { user_id: uid, status: "active" } });
  const sharedIds = shared.map((c) => c.pet_id);
  const sharedPets = sharedIds.length
    ? await prisma.pet.findMany({ where: { id: { in: sharedIds } } })
    : [];
  res.json({ items: [...own, ...sharedPets] });
}));


// ---------------------------------------------------------
// PRZYPOMNIENIA PET — właściciele i aktywni opiekunowie
// ---------------------------------------------------------

async function collectUpcomingPetReminders(uid) {
  if (!uid) return [];

  const [owned, caregiverLinks] = await Promise.all([
    prisma.pet.findMany({
      where: { owner_id: uid },
      select: { id: true },
    }),

    prisma.petCaregiver.findMany({
      where: {
        user_id: uid,
        status: "active",
      },
      select: {
        pet_id: true,
      },
    }),
  ]);

  const petIds = [
    ...new Set([
      ...owned.map((pet) => pet.id),
      ...caregiverLinks.map((item) => item.pet_id),
    ]),
  ];

  if (petIds.length === 0) return [];

  const pets = await prisma.pet.findMany({
    where: {
      id: { in: petIds },
    },
    select: {
      id: true,
      name: true,
      birth_date: true,
      adoption_date: true,
    },
  });

  const petById = new Map(
    pets.map((pet) => [pet.id, pet])
  );

  const now = new Date();

  const in7Days = new Date(
    now.getTime() + 7 * 24 * 60 * 60 * 1000
  );

  const overdueLimit = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000
  );

  const [events, healthRecords] = await Promise.all([
    prisma.petCalendarEvent.findMany({
      where: {
        pet_id: { in: petIds },
        done: false,
        date: {
          gte: overdueLimit,
          lte: in7Days,
        },
      },
      orderBy: {
        date: "asc",
      },
    }),

    prisma.petHealthRecord.findMany({
      where: {
        pet_id: { in: petIds },
        next_date: {
          not: null,
          gte: overdueLimit,
          lte: in7Days,
        },
      },
      orderBy: {
        next_date: "asc",
      },
    }),
  ]);

  const items = [];

  for (const event of events) {
    const pet = petById.get(event.pet_id);

    items.push({
      id: event.id,
      source: "calendar",
      kind: event.kind,
      title: event.title,
      pet_id: event.pet_id,
      pet_name: pet?.name ?? null,
      date: event.date,
      remind_days_before: event.remind_days_before ?? 3,
      overdue: new Date(event.date) < now,
      done: event.done,
    });
  }

  for (const record of healthRecords) {
    const pet = petById.get(record.pet_id);

    items.push({
      id: record.id,
      source: "health",
      kind: record.kind,
      title: record.title,
      pet_id: record.pet_id,
      pet_name: pet?.name ?? null,
      date: record.next_date,
      next_date: record.next_date,
      remind_days_before: 3,
      overdue: new Date(record.next_date) < now,
      vet_name: record.vet_name,
    });
  }

  // Urodziny i rocznice adopcji.
  // Termin obliczany jest jako najbliższa przyszła rocznica.

  function anniversary(base, kind, pet) {
    if (!base) return null;

    const original = new Date(base);

    if (Number.isNaN(original.getTime())) {
      return null;
    }

    const today = new Date();

    const todayUtc = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate()
    );

    let next = new Date(Date.UTC(
      today.getUTCFullYear(),
      original.getUTCMonth(),
      original.getUTCDate()
    ));

    if (next.getTime() < todayUtc) {
      next = new Date(Date.UTC(
        today.getUTCFullYear() + 1,
        original.getUTCMonth(),
        original.getUTCDate()
      ));
    }

    const days = Math.floor(
      (next.getTime() - todayUtc) /
      (24 * 60 * 60 * 1000)
    );

    if (days > 14) return null;

    return {
      id:
        kind +
        ":" +
        pet.id +
        ":" +
        next.toISOString().slice(0, 10),

      source: "anniversary",
      kind,

      title:
        (kind === "birthday"
          ? "Urodziny: "
          : "Rocznica adopcji: ") +
        pet.name,

      pet_id: pet.id,
      pet_name: pet.name,
      date: next.toISOString(),
      remind_days_before: 3,
      overdue: false,
    };
  }

  for (const pet of pets) {
    const birthday = anniversary(
      pet.birth_date,
      "birthday",
      pet
    );

    const adoption = anniversary(
      pet.adoption_date,
      "adoption",
      pet
    );

    if (birthday) items.push(birthday);
    if (adoption) items.push(adoption);
  }

  items.sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  return items.slice(0, 50);
}


function reminderDaysUntil(value) {
  const due = new Date(value);

  if (Number.isNaN(due.getTime())) {
    return Infinity;
  }

  const today = new Date();

  const dueDay = Date.UTC(
    due.getUTCFullYear(),
    due.getUTCMonth(),
    due.getUTCDate()
  );

  const todayDay = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );

  return Math.round(
    (dueDay - todayDay) / (24 * 60 * 60 * 1000)
  );
}


// GET /api/pets/reminders/upcoming
petsRouter.get(
  "/reminders/upcoming",
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = userIdOf(req);

    const items = await collectUpcomingPetReminders(uid);

    res.json({ items });
  })
);


// POST /api/pets/reminders/sync
// Powiadomienia są deduplikowane deterministycznym ID.
// Nie wymaga migracji bazy danych.

petsRouter.post(
  "/reminders/sync",
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = userIdOf(req);

    const items = await collectUpcomingPetReminders(uid);

    const dueItems = items.filter((item) => {
      const daysBefore = Number(
        item.remind_days_before ?? 3
      );

      if (!Number.isFinite(daysBefore) || daysBefore <= 0) {
        return false;
      }

      return reminderDaysUntil(item.date) <= daysBefore;
    });

    const notifications = dueItems.map((item) => {
      const dueDate = new Date(item.date)
        .toISOString()
        .slice(0, 10);

      const key = [
        uid,
        item.source,
        item.id,
        dueDate,
      ].join(":");

      const id =
        "petrem_" +
        createHash("sha256")
          .update(key)
          .digest("hex")
          .slice(0, 32);

      const dateLabel = new Date(
        item.date
      ).toLocaleDateString("pl-PL");

      return {
        id,
        user_id: uid,
        type: "system",

        title: (
          "Przypomnienie: " + item.title
        ).slice(0, 160),

        body: (
          (item.pet_name || "Zwierzę") +
          " — termin: " +
          dateLabel +
          (item.overdue ? " (po terminie)" : "")
        ).slice(0, 1000),

        link:
          "/pets/" +
          encodeURIComponent(item.pet_id),

        read: false,
        created_by_id: uid,
      };
    });

    // Upsert zamiast createMany(skipDuplicates):
    // unikamy zależności od obsługi skipDuplicates
    // przez konkretny provider bazy danych.

    let synced = 0;

    for (const notification of notifications) {
      await prisma.notification.upsert({
        where: {
          id: notification.id,
        },

        create: notification,

        // Nie resetujemy statusu przeczytania.
        update: {},
      });

      synced += 1;
    }

    res.json({
      synced,
      items,
    });
  })
);


// GET /api/pets/:id — publiczny lub prywatny widok (E8). Prywatny profil: 404 dla obcych.
petsRouter.get("/:id", optionalAuth, asyncHandler(async (req, res) => {
  const pet = await prisma.pet.findUnique({ where: { id: req.params.id } });
  if (!pet) throw notFound("Nie znaleziono zwierzaka");
  const editor = await isEditorOf(req, pet);
  if (!pet.is_public && !editor) throw notFound("Nie znaleziono zwierzaka");
  res.json(publicPet(pet, editor));
}));

// PATCH /api/pets/:id — edycja karty (tylko właściciel/opiekun).
petsRouter.patch("/:id", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const data = petPatchSchema.parse(req.body ?? {});
  const payload = {};
  for (const [key, value] of Object.entries(data)) {
    if (["birth_date", "adoption_date"].includes(key)) payload[key] = toDate(value);
    else payload[key] = value;
  }
  const updated = await prisma.pet.update({ where: { id: pet.id }, data: payload });
  res.json(publicPet(updated, true));
}));

// ---------------------------------------------------------------- Zdrowie (E2)
petsRouter.get("/:id/health", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const items = await prisma.petHealthRecord.findMany({ where: { pet_id: pet.id }, orderBy: [{ date: "desc" }, { created_date: "desc" }] });
  res.json({ items });
}));

petsRouter.post("/:id/health", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const data = healthSchema.parse(req.body ?? {});
  const record = await prisma.petHealthRecord.create({
    data: {
      pet_id: pet.id,
      kind: data.kind,
      title: data.title,
      date: toDate(data.date),
      next_date: toDate(data.next_date),
      details: data.details ?? null,
      vet_name: data.vet_name ?? null,
      attachment_url: data.attachment_url ?? null,
      created_by_id: userIdOf(req),
    },
  });
  res.status(201).json(record);
}));

petsRouter.delete("/:id/health/:recordId", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const record = await prisma.petHealthRecord.findFirst({ where: { id: req.params.recordId, pet_id: pet.id } });
  if (!record) throw notFound();
  await prisma.petHealthRecord.delete({ where: { id: record.id } });
  res.json({ success: true });
}));

// ---------------------------------------------------------------- Kalendarz (E3)
petsRouter.get("/:id/calendar", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const items = await prisma.petCalendarEvent.findMany({ where: { pet_id: pet.id }, orderBy: { date: "asc" } });
  res.json({ items });
}));

petsRouter.post("/:id/calendar", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const data = eventSchema.parse(req.body ?? {});
  const date = toDate(data.date);
  if (!date) throw badRequest("Termin (date) jest wymagany");
  const event = await prisma.petCalendarEvent.create({
    data: {
      pet_id: pet.id,
      kind: data.kind,
      title: data.title,
      date,
      repeat: data.repeat,
      remind_days_before: data.remind_days_before,
      note: data.note ?? null,
      created_by_id: userIdOf(req),
    },
  });
  res.status(201).json(event);
}));

petsRouter.patch("/:id/calendar/:eventId", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const event = await prisma.petCalendarEvent.findFirst({ where: { id: req.params.eventId, pet_id: pet.id } });
  if (!event) throw notFound();
  const done = Boolean(req.body?.done);
  const updated = await prisma.petCalendarEvent.update({ where: { id: event.id }, data: { done } });
  res.json(updated);
}));

petsRouter.delete("/:id/calendar/:eventId", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const event = await prisma.petCalendarEvent.findFirst({ where: { id: req.params.eventId, pet_id: pet.id } });
  if (!event) throw notFound();
  await prisma.petCalendarEvent.delete({ where: { id: event.id } });
  res.json({ success: true });
}));

// ---------------------------------------------------------------- Waga i rozwój (E5)
petsRouter.get("/:id/measurements", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const items = await prisma.petMeasurement.findMany({ where: { pet_id: pet.id }, orderBy: { measured_at: "asc" } });
  res.json({ items });
}));

petsRouter.post("/:id/measurements", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const data = measurementSchema.parse(req.body ?? {});
  if (data.weight_kg == null && data.height_cm == null) throw badRequest("Podaj wagę lub wzrost");
  const measurement = await prisma.petMeasurement.create({
    data: {
      pet_id: pet.id,
      weight_kg: data.weight_kg ?? null,
      height_cm: data.height_cm ?? null,
      note: data.note ?? null,
      measured_at: toDate(data.measured_at) ?? new Date(),
      created_by_id: userIdOf(req),
    },
  });
  res.status(201).json(measurement);
}));

petsRouter.delete("/:id/measurements/:measurementId", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const m = await prisma.petMeasurement.findFirst({ where: { id: req.params.measurementId, pet_id: pet.id } });
  if (!m) throw notFound();
  await prisma.petMeasurement.delete({ where: { id: m.id } });
  res.json({ success: true });
}));

// ---------------------------------------------------------------- Osiągnięcia (E6)
petsRouter.get("/:id/achievements", optionalAuth, asyncHandler(async (req, res) => {
  const pet = await prisma.pet.findUnique({ where: { id: req.params.id } });
  if (!pet) throw notFound("Nie znaleziono zwierzaka");
  const editor = await isEditorOf(req, pet);
  if (!pet.is_public && !editor) throw notFound("Nie znaleziono zwierzaka");
  const items = await prisma.petAchievement.findMany({ where: { pet_id: pet.id }, orderBy: [{ date: "desc" }, { created_date: "desc" }] });
  res.json({ items: editor ? items : items.filter((a) => !a.official || a.confirmed) });
}));

petsRouter.post("/:id/achievements", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const data = achievementSchema.parse(req.body ?? {});
  // Własne osiągnięcia: official=false zawsze — oficjalne wyróżnienia potwierdza moderator (E6).
  const achievement = await prisma.petAchievement.create({
    data: {
      pet_id: pet.id,
      title: data.title,
      category: data.category,
      date: toDate(data.date),
      description: data.description ?? null,
      image_url: data.image_url ?? null,
      organizer: data.organizer ?? null,
      official: false,
      confirmed: false,
      created_by_id: userIdOf(req),
    },
  });
  res.status(201).json(achievement);
}));

petsRouter.delete("/:id/achievements/:achievementId", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const a = await prisma.petAchievement.findFirst({ where: { id: req.params.achievementId, pet_id: pet.id } });
  if (!a) throw notFound();
  await prisma.petAchievement.delete({ where: { id: a.id } });
  res.json({ success: true });
}));

// ---------------------------------------------------------------- Opiekunowie (E9)
petsRouter.get("/:id/caregivers", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  const items = await prisma.petCaregiver.findMany({ where: { pet_id: pet.id } });
  res.json({ items });
}));

petsRouter.post("/:id/caregivers", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  if (pet.owner_id !== userIdOf(req)) throw forbidden("Tylko właściciel zarządza opiekunami");
  const data = caregiverSchema.parse(req.body ?? {});
  const caregiver = await prisma.petCaregiver.create({
    data: { pet_id: pet.id, user_id: data.user_id, role: data.role, status: "active", invited_by: userIdOf(req), created_by_id: userIdOf(req) },
  });
  res.status(201).json(caregiver);
}));

petsRouter.delete("/:id/caregivers/:userId", requireAuth, asyncHandler(async (req, res) => {
  const pet = await loadPetForEditor(req, req.params.id);
  if (pet.owner_id !== userIdOf(req)) throw forbidden("Tylko właściciel zarządza opiekunami");
  const c = await prisma.petCaregiver.findFirst({ where: { pet_id: pet.id, user_id: req.params.userId } });
  if (!c) throw notFound();
  await prisma.petCaregiver.delete({ where: { id: c.id } });
  res.json({ success: true });
}));
