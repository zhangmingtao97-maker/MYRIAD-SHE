interface IAppOption {
  globalData: { apiBaseUrl: string; requestTimeoutMs: number; accessToken: string; accessTokenExpiresAt: number; userId: string; accountDeleted: boolean; authGeneration: number; loginPromise: Promise<void> | null };
  ensureLogin(force?: boolean): Promise<void>;
  markAccountDeleted(): void;
  createNewAccount(): Promise<void>;
}
