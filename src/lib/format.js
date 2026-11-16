export function formatPrice(value) {
  if (value === null || value === undefined || value === 0) return "Za darmo";
  return `${new Intl.NumberFormat("pl-PL").format(value)} zł`;
}

export function formatNumber(value) {
  if (!value && value !== 0) return "0";
  return new Intl.NumberFormat("pl-PL").format(value);
}

export function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "teraz";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} godz.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} dni`;
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "short" });
}

export function ageLabel(months) {
  if (!months && months !== 0) return null;
  if (months < 12) return `${months} mies.`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} lata ${rest} mies.` : `${years} lata`;
}

export function levelFor(xp = 0) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 120)) + 1);
}

export function xpForNextLevel(level) {
  return Math.round(120 * level ** 2);
}
