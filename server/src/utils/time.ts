export const DEFAULT_TIMEZONE = "Asia/Shanghai";

export function formatRadioDate(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  // Use en-CA for YYYY-MM-DD format
  return date.toLocaleDateString("en-CA", { timeZone });
}

export function formatRadioDateTime(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const datePart = formatRadioDate(date, timeZone);
  // Use en-GB to get HH:mm 24-hour format
  const timePart = date.toLocaleTimeString("en-GB", { timeZone, hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${timePart} ${timeZone}`;
}

export function getRadioMinutesOfDay(date: Date, timeZone: string = DEFAULT_TIMEZONE): number {
  const timeStr = date.toLocaleTimeString("en-GB", { timeZone, hour: '2-digit', minute: '2-digit' });
  const [hours, minutes] = timeStr.split(":");
  return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
}