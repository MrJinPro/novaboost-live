import type { Logger } from "../../lib/logger.js";

export class TrackingService {
  constructor(private readonly logger: Logger) {}

  getHealth() {
    return {
      service: "tracking",
      status: "planned",
      capabilities: [
        "streamer live status polling",
        "tracking worker scheduling",
        "stream session lifecycle",
      ],
    };
  }

  scheduleRegisteredStreamers() {
    this.logger.info("Tracking scheduler tick", { mode: "dry-run" });
  }
}