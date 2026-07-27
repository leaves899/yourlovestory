# 发布流程

## 发布前检查

1. 确认发布提交来自受保护主分支或已审核提交，工作区干净。
2. 用 `npm version <semver> --no-git-tag-version` 更新版本，并维护 `CHANGELOG.md`。
3. 运行 `npm ci`、`npm run check:version`、`npm run test:release`、lint、两套 TypeScript
   检查、Jest、build 和 E2E。
4. 退出应用并备份测试用 `userData`；检查 migration 的前向兼容性和不可逆风险。
5. 为 Windows、macOS 和 Linux 构建产物，记录签名与 notarization 的真实状态。
6. 运行 Issue #25 定义的 packaged Electron smoke tests。该 gate 未接入前禁止 Stable。
7. 对最终上传目录运行 `npm run release:checksums -- <artifact-directory>`。
8. 核对 `SHA256SUMS.txt` 覆盖每个上传产物，且未包含自身。
9. 以 `v<package-version>` 创建 tag，并先创建同名 draft GitHub Release。
10. 核对 release notes、备份警告、已知问题、prerelease 标记和下载文件后人工发布。

仓库的 `Release draft` workflow 仅支持人工触发。它从 `package.json` 读取版本，运行完整
源码质量检查，跨平台打包，生成 SHA-256，并创建 draft Release。当前 workflow 对
Stable 版本硬失败，直到 Issue #25 的 packaged smoke gate 被实现并替换该保护。

## 产物验证

下载产物与 `SHA256SUMS.txt` 后，在任意安装了 Node.js 22 的平台运行：

```bash
node -e "const fs=require('node:fs');const c=require('node:crypto');const f=process.argv[1];console.log(c.createHash('sha256').update(fs.readFileSync(f)).digest('hex'))" "<downloaded-file>"
```

输出应与 `SHA256SUMS.txt` 中对应文件名的值完全一致。文件名包含空格时必须保留引号。

## 签名与 notarization

Windows 和 macOS 正式分发应使用受保护环境中的证书；macOS 还必须完成 Apple
notarization。证书、密码、API Key 和 token 不得进入仓库或日志。当前自动化没有配置
这些凭据，因此产物必须明确标记为未签名/未 notarize，不能宣称这些步骤已完成。
未来配置 secrets 时，缺失 secrets 必须让签名步骤安全失败或明确跳过并报告状态。

## 失败、回滚与重新发布

- 任一步失败都停止流程，不发布 draft；修复后提升预发布序号或 patch，重新跑全套检查。
- 已公开的 tag 和 Release 不改写、不复用版本号；发布修正版。
- draft 可删除后重建，但不得把失败产物标记为 latest。
- 预发布 Release 设置 prerelease，不成为 latest；Stable 才可由 GitHub 标记 latest。
- 应用回滚不等于数据库回滚。若 migration 不可逆，发布说明必须禁止直接降级。
- Issue #19 完成前不声称支持自动备份恢复；Issue #25 完成前不发布 Stable。
