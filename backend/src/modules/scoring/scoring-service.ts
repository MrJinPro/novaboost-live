export type PriorityScoreInput = {
  activeBoost: number;
  liveViewers: number;
  engagementRate: number;
  referralStrength: number;
  retentionSignal: number;
  platformSignal: number;
};

export class ScoringService {
  calculatePriorityScore(input: PriorityScoreInput) {
    return (
      input.activeBoost +
      input.liveViewers * 0.2 +
      input.engagementRate * 20 +
      input.referralStrength * 10 +
      input.retentionSignal * 15 +
      input.platformSignal
    );
  }

  getHealth() {
    return {
      service: "scoring",
      status: "planned",
      formula: "boost + live + engagement + referral + retention + platform_signal",
    };
  }
}