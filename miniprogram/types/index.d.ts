interface IAppOption {
  globalData: { apiBaseUrl: string; requestTimeoutMs: number; loginTimeoutMs: number; accessToken: string; accessTokenExpiresAt: number; userId: string; profileToken: string; profileTokenExpiresAt: number; accountDeleted: boolean; authGeneration: number; loginPromise: Promise<void> | null };
  ensureLogin(force?: boolean): Promise<void>;
    loginWithWechat(phoneCode?: string): Promise<void>;
  uploadProfileAvatar(filePath: string): Promise<string>;
  completeWechatProfile(input: { nickname?: string; phoneCode?: string }): Promise<void>;
  markAccountDeleted(): void;
  createNewAccount(): Promise<void>;
}
