const NEON_OUTBOX_INTERVAL_HOURS = 3;

// The cron fires every 5 minutes, but Neon only scales to zero after 5 idle minutes.
// Touching it on every tick keeps the compute awake 24/7, so the outbox is drained every 3h.
export function isNeonOutboxSlot(scheduledAt: Date): boolean {
  return scheduledAt.getUTCMinutes() === 0 && scheduledAt.getUTCHours() % NEON_OUTBOX_INTERVAL_HOURS === 0;
}
