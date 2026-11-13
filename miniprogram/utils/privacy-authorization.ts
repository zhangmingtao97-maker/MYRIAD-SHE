export function ensurePrivacyAuthorized() {
  if (typeof wx.requirePrivacyAuthorize !== 'function') return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    wx.requirePrivacyAuthorize({
      success: () => resolve(true),
      fail: () => resolve(false),
    });
  });
}

// Open the guide registered with WeChat, rather than substituting our own
// content page for the platform's declaration of private API scopes.
export function openWechatPrivacyContract() {
  wx.openPrivacyContract({
    fail: () => wx.showToast({ title: '微信隐私保护指引暂时无法打开，请稍后重试', icon: 'none' }),
  });
}
