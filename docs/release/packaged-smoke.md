# Packaged Electron smoke

Issue #25 的 smoke gate 只启动 electron-builder 生成的真实应用。它不启动 Vite，
也不加载源码 `src/main` 或测试 mock。`playwright.packaged.config.ts` 没有
`webServer` 配置，测试入口是：

```bash
npm run build
npx electron-builder --dir
npm run test:packaged
```

release workflow 的 Windows、macOS 和 Linux package job 会先构建各自平台产物，
再运行 `npm run test:packaged`。Linux runner 使用 `xvfb-run` 提供无头显示。测试优先
使用 `release/<platform>-unpacked` 中的 executable，也可以通过
`YOURCRUSH_PACKAGED_EXECUTABLE` 指定 CI 构建出的 unpacked executable。

每次执行使用独立临时 `userData`，并在同一目录中启动两次应用。第一轮断言真实
`file://` 页面、preload bridge、关键 IPC、SQLite ready 状态、项目创建和正常退出；
第二轮断言数据库中的项目仍存在并再次正常退出。`better-sqlite3` 通过真实数据库
初始化和 IPC 写入路径验证，不能以 mock API 替代。

结果保存在 `test-results/packaged-smoke/`：JSON smoke report、Playwright JSON、
每轮 stdout/stderr、Electron main/renderer 日志、crash log、截图和 trace。失败时
这些目录作为 workflow artifact 上传，供发布前排查启动崩溃和 native dependency
问题。

上传目录只包含 `latest*.yml` 更新清单和最终安装包；electron-builder 的
`builder-debug.yml` 是构建诊断文件，不是发布产物，因此明确排除，避免三平台
artifact 合并时发生同名覆盖。安装包名称使用
`yourcrush-<version>-<os>-<arch>.<ext>`，平台和架构在文件名中可直接识别。

当前 workflow 设置 `CSC_IDENTITY_AUTO_DISCOVERY=false`，并在 unsigned 配置中关闭
Windows `signAndEditExecutable`，避免没有受保护证书时依赖 `winCodeSign/rcedit`。
workflow 同时为每个平台记录未签名状态。
缺少真实 Windows 证书、Apple Developer 凭据或 notarization 权限时，smoke 仍验证
未签名产物的运行行为，但不能把结果称为已签名或 Stable 发布。
