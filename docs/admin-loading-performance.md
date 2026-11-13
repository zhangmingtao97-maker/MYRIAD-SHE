# 后台首次访问加载优化

2026-11-13 排查正式站首次访问。HTML 和接口响应较快；未压缩的 JS/CSS 阻塞首屏，登录页还一次下载完整中文字体。服务器 CPU、内存和磁盘均有余量。

## 调整

- 正式 HTTPS 网关为 JS、CSS、JSON 等文本响应启用 gzip，按 `Accept-Encoding` 区分缓存。
- `/assets/` 是 Vite 带内容指纹的资源，成功响应设置一年 immutable 缓存。缺失资源仍返回 404，不缓存成永久错误。
- HTML 使用 `no-cache` 重新验证，下一次访问能获得最新资源引用。
- 登录页中文字体从既有品牌字体提取常用登录文案与无障碍跳转文案。`unicode-range` 让登录页只下载约 10.6 KB，其他文字仍使用原有约 680 KB 的完整字体；字形、字距和品牌字体不变。

| 资源 | 调整前 | 调整后 |
| --- | ---: | ---: |
| 主 JS 传输 | 866 KB | 约 235 KB |
| 主 CSS 传输 | 301 KB | 约 53 KB |
| 登录页所需中文字体 | 680 KB | 10.6 KB |

## 字体维护

字体二进制与 Unicode 范围已生成，日常构建无需 Python。修改登录页文案时，如需更新字体，调整 `management/scripts/subset-login-font.py` 的文案，安装 Python `fonttools`、`brotli` 后执行该脚本。提交生成的 `SourceHanSerifCN-Login.woff2` 和 `login-font-range.ts`。未包含的字会按需使用完整字体。

## 部署验证

检查配置语法、`Content-Encoding: gzip`、`Vary: Accept-Encoding`、资源缓存头与 HTML 重新验证。浏览器应确认登录页不请求完整中文字体，后台其他文字仍能触发完整字体加载。

网关使用单文件 bind mount；如果宿主文件曾被原子替换，容器可能仍绑定旧 inode。先比较容器中的实际配置和宿主配置；若不同，重新创建 gateway 以刷新挂载，单纯 reload 无法解决。

生产更新保留回滚镜像和源文件备份，验证 API 和首页内容接口正常，环境配置、API 容器保持不变。
