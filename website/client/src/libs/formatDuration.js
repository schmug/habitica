// Formats a duration in minutes as a short label such as "25m", "2h" or "1h 30m"
export default function formatDuration (minutes, $t) {
  const total = Math.round(Number(minutes));
  if (!Number.isFinite(total) || total <= 0) return '';
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return $t('minutesShort', { minutes: rest });
  if (rest === 0) return $t('hoursShort', { hours });
  return $t('hoursMinutesShort', { hours, minutes: rest });
}
