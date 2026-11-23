/** Enlace wa.me; asume celular ecuatoriano si hay 9–10 dígitos sin código de país. */
export function buildWhatsAppHref(phone: string, message: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = `593${digits.slice(1)}`;
  } else if (digits.length === 9) {
    digits = `593${digits}`;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function membershipExpiryWhatsAppMessage(
  memberName: string,
  endDateLabel: string,
  daysLeft: number
): string {
  const first = memberName.trim().split(/\s+/)[0] ?? memberName;
  const days =
    daysLeft <= 0
      ? "hoy"
      : daysLeft === 1
        ? "1 día"
        : `${daysLeft} días`;
  return [
    `¡Hola ${first}! 💪`,
    "",
    "Te escribimos de tu gym con mucho gusto 🏋️",
    "",
    `Queríamos avisarte con cariño que tu membresía culmina el *${endDateLabel}* ⏰`,
    `(en estos momentos faltan *${days}*).`,
    "",
    "Ha sido un gusto verte entrenar con nosotros — ¡sigue dándole con toda! 🔥",
    "",
    "Con aprecio,",
    "Tu equipo del gym 🤝💚",
  ].join("\n");
}