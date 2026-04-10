import { expirePendingLinks } from "./paymentLinkService";

const INTERVAL_MS = 60 * 1000; // Check every minute

export function startExpirationJob(): void {
  setInterval(async () => {
    try {
      const expired = await expirePendingLinks();
      if (expired > 0) {
        console.log(`Expired ${expired} payment link(s)`);
      }
    } catch (err) {
      console.error("Expiration job error:", err);
    }
  }, INTERVAL_MS);

  console.log("Payment expiration job started");
}
