# 微信收货地址配置与故障排查

2026-11-16 在“个人资料 → 收货地址”复现了微信平台错误：

```json
{
  "errMsg": "chooseAddress:fail api scope is not declared in the privacy agreement",
  "errno": 112
}
```

这次失败发生在微信地址选择接口，尚未发送 `/me/profile/address` 保存请求。`wx.getPrivacySetting` 返回 `needAuthorization: false`，因此不是当前用户未同意隐私授权。`miniprogram/app.json` 已包含 `requiredPrivateInfos: ["chooseAddress"]`；该本地声明不能代替公众平台的隐私类型声明。

处理步骤：

1. 登录与项目 AppID 对应的微信公众平台小程序账号。
2. 进入“设置 → 服务内容声明 → 用户隐私保护指引”（以平台当前菜单为准）。
3. 在收集的个人信息类型中补充“收货地址”，选择 `wx.chooseAddress` 对应类型。用途可填写：“在用户主动选择并确认后，保存收货人姓名、联系电话、所在地区、详细地址等信息，用于个人资料中的收货地址管理。”保留已有声明。
4. 保存并发布平台指引。按微信文档，补充的隐私类型声明约 5 分钟后生效。
5. 重新进入小程序，打开“个人资料 → 收货地址 → 从微信导入地址”；若微信重新请求隐私授权，由用户确认。验证原生地址选择器能正常打开，再由用户选择地址，检查表单后点击“保存地址”。

本次尝试读取微信 `component/getprivacysetting` 的开发版和线上版设置，两个版本均返回 `48001 api unauthorized`，不能通过当前账号 API 代为修改，需使用公众平台配置。

现在“个人资料 → 收货地址”首先打开地址管理页，可直接手动新增、编辑、设为默认和删除。微信导入只填入草稿，需要用户再次点击“保存地址”。代码已区分平台声明缺失、用户拒绝隐私授权、主动取消与临时失败。平台配置缺失时展示“微信地址导入暂不可用，你仍可手动填写并保存地址。”，不再要求用户反复授权；诊断日志只记录错误消息与错误码，不记录地址内容。

参考：[微信隐私授权开发指南](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html)、[wx.chooseAddress](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/address/wx.chooseAddress.html)。
