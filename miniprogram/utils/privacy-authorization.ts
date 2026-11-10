export function ensurePrivacyAuthorized() {
  if (typeof wx.requirePrivacyAuthorize !== 'function') return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    wx.requirePrivacyAuthorize({
      success: () => resolve(true),
      fail: () => resolve(false),
    });
  });
}
