const KEY = "purre_care_events";

export const CARE_TYPES = [
  { id: "vaccine", label: "Szczepienie", color: "text-aura" },
  { id: "deworm", label: "Odrobaczanie", color: "text-violet" },
  { id: "vet", label: "Wizyta u weta", color: "text-chart-4" },
  { id: "other", label: "Inne", color: "text-muted-foreground" },
];

export function loadCareEvents() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveCareEvents(events) {
  localStorage.setItem(KEY, JSON.stringify(events));
}

export function addCareEvent(event) {
  const list = loadCareEvents();
  const row = {
    id: crypto.randomUUID?.() || String(Date.now()),
    created_at: new Date().toISOString(),
    ...event,
  };
  list.unshift(row);
  saveCareEvents(list);
  return row;
}

export function removeCareEvent(id) {
  saveCareEvents(loadCareEvents().filter((e) => e.id !== id));
}

export function upcoming(events, days = 60) {
  const now = Date.now();
  const limit = now + days * 86400000;
  return events
    .filter((e) => {
      const t = new Date(e.due_date).getTime();
      return t >= now - 86400000 && t <= limit;
    })
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
}
