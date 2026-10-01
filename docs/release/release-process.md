# 发布流程

## 发布前检查

1. 确认发布提交来自 `master`、完整 CI 已通过，工作区干净；signed 模式还要求受保护分支和签名环境。
2. 用 `npm version <semver> --no-git-tag-version` 更新版本，并维护 `CHANGELOG.md`。
3. 运行 `npm ci`、`npm run check:version`、`npm run test:release`、lint、两套 TypeScript
   检查、Jest、build 和 E2E。
4. 退出应用并备份测试用 `userData`；检查 migration 的前向兼容性和不可逆风险。
5. 选择 `unsigned-prerelease` 或 `signed-prerelease`；后者先配置并核验[受保护环境和外部凭据](signing.md)。
6. 三平台依次运行 build、`scripts/release/package.mjs <mode>`、真实 packaged smoke，
   再执行 `scripts/release/finalize-platform.mjs`，把最终安装文件与签名和 smoke 报告绑定。
7. 各平台只上传验证成功的 `release/upload`。下载时保留独立目录，禁止直接合并覆盖文件。
8. 运行 `node scripts/release/collect-artifacts.mjs <download-directory> <empty-output-directory> <mode>`，
   验证三平台报告和文件名、安装包散列、更新清单，再生成并独立核验 `SHA256SUMS.txt`。
9. 以 `v<package-version>` 创建同名 draft prerelease；失败门禁不得创建 tag 或 Release。
10. 人工核对 release notes、备份警告、签名状态、已知问题和下载文件。公开发布需要单独授权。

仓库的 `Release draft` workflow 仅支持人工触发。它从 `package.json` 读取版本，运行完整
源码质量检查，跨平台打包，运行真实 packaged smoke，生成 SHA-256，并创建 draft
Release。quality job 也运行 Gitleaks；任一源码质量门禁或任一平台打包、签名验证、
packaged smoke、产物聚合失败都会阻止 draft。builder 总是显式 `--publish never`，
打包步骤不拥有 GitHub Release 写权限。

最终目录仅包含当前版本安装文件、对应 blockmap、合法平台更新清单、精简签名和
smoke 报告，以及 checksum。`builder-debug.yml` 不上传，三平台文件必须有不同文件名；
更新清单允许当前 prerelease channel 或平台 `latest*.yml`，其中版本、引用和散列必须
匹配当前文件。普通 CI 同样执行这条无签名产物验证路径，汇总 job 不创建 draft 或 tag。
当前 workflow 对 Stable 版本始终硬失败，未获授权不得公开 Stable。

## 产物验证

下载产物与 `SHA256SUMS.txt` 后，在任意安装了 Node.js 22 的平台运行：

```bash
node -e "const fs=require('node:fs');const c=require('node:crypto');const f=process.argv[1];console.log(c.createHash('sha256').update(fs.readFileSync(f)).digest('hex'))" "<downloaded-file>"
```

输出应与 `SHA256SUMS.txt` 中对应文件名的值完全一致。文件名包含空格时必须保留引号。

## 签名与 notarization

Windows 和 macOS 正式分发应使用受保护环境中的证书；macOS 必须完成 app 与最终 DMG
的 Apple notarization。仓库已经提供两种模式、secret 接口、签名检查和安全失败流程，
详见[签名说明](signing.md)。当前外部证书、Apple 凭据和 `release-signing` 环境未配置，
真实 signed 路径尚未验证。unsigned 模式报告 `not-configured`，signed 模式缺少输入
必须失败。单元测试和 unsigned smoke 不能替代真实签名验收。

## 失败、回滚与重新发布

- 任一步失败都停止流程，不创建 draft；修复后提升预发布序号或 patch，重新跑全套检查。
- 已公开的 tag 和 Release 不改写、不复用版本号；发布修正版。
- draft 可删除后重建，但不得把失败产物标记为 latest。
- 预发布 Release 设置 prerelease，不成为 latest；Stable 才可由 GitHub 标记 latest。
- 应用回滚不等于数据库回滚。若 migration 不可逆，发布说明必须禁止直接降级。
- 自动备份和受控恢复遵循数据安全界面与[任务恢复契约](../features/task-crash-recovery.md)，
  不承诺模型不确定窗口可自动重放，也不承诺所有生成流程都能恢复。
- 三平台 packaged smoke 已接入 CI 和发布阻塞门禁；通过 smoke 后仍须满足真实签名、
  notarization 和全部 Stable 条件，并获得公开发布授权。
