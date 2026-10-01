# 签名与 notarization

仓库提供完整的签名输入、受保护环境检查、工具验证和产物状态报告。当前 GitHub 仓库
尚未配置 `release-signing` environment、Windows/macOS 证书或 Apple API 凭据，真实
签名与 notarization 未验证。这些外部输入是签名分发的 external blocker；单元测试使用
合成工具输出验证门禁，不构成真实证书验收。

## 两种发布模式

`Release draft` workflow 只允许从 `master` 人工触发，输入 `signing_mode`：

| 模式 | Windows/macOS | Linux | 缺少签名输入 |
| --- | --- | --- | --- |
| `unsigned-prerelease` | 明确关闭发布签名及 notarization | 签名不适用 | 可运行，状态为 `not-configured` |
| `signed-prerelease` | 必须签名；macOS 必须 notarize app 与最终 DMG | 签名不适用 | 安全失败，禁止上传发布文件和创建 draft |

两种模式均拒绝 Stable 版本，只能创建 draft prerelease。普通 CI 运行真实的三平台
`unsigned-prerelease` 打包、packaged smoke、报告绑定及产物汇总验证，不创建 Release
或 tag。Windows Electron 原始 EXE 可能带供应商签名，macOS 也可能存在 ad hoc 签名；
unsigned 状态报告只说明本仓库未配置发布签名，并记录实际观察结果。若 runner 没有可用的
Authenticode 观察工具，报告会记录 `unavailable` 并继续 unsigned smoke，不会把它升级为签名成功。

## 受保护环境

仓库管理员需要先完成以下外部配置，再选择 `signed-prerelease`：

1. 保护 `master` 分支；GitHub Actions 中 `GITHUB_REF_PROTECTED` 必须为 `true`。
2. 在 `leaves899/yourlovestory` 创建名称精确为 `release-signing` 的 environment。
3. 配置至少一名 Required reviewer，启用 Prevent self-review。
4. Deployment branches and tags 选择 Protected branches only，禁用自定义分支策略。
5. 将下表凭据保存为该 environment 的 secrets，审查并批准签名 job 的 deployment。

quality job 先通过只读 GitHub API 验证 environment 已存在、reviewers、自审限制和
分支保护，成功后签名 job 才能进入该 environment。脚本还验证 Actions、仓库主分支、
分支保护和环境验证结果；本地运行不能绕过此门禁生成标记为 verified 的签名发行包。
`GITHUB_TOKEN` 只用于环境读取；打包器收到的环境去除 GitHub 上传 token，所有 builder
调用显式使用 `--publish never`，只有最终 draft job 拥有 `contents: write`。

## Secret 接口

| Secret 名称 | 具体输入 | 使用平台 |
| --- | --- | --- |
| `WINDOWS_CSC_LINK` | 有效 Windows 代码签名 PFX，electron-builder 支持的 base64 或证书位置 | Windows |
| `WINDOWS_CSC_KEY_PASSWORD` | PFX 导出密码 | Windows |
| `MAC_CSC_LINK` | 含私钥的 Developer ID Application P12，electron-builder 支持的 base64 或证书位置 | macOS |
| `MAC_CSC_KEY_PASSWORD` | P12 导出密码 | macOS |
| `APPLE_API_KEY_BASE64` | Apple App Store Connect API `.p8` 私钥文件的完整 base64，不含换行 | macOS |
| `APPLE_API_KEY_ID` | 10 位大写字母/数字 Key ID | macOS |
| `APPLE_API_ISSUER` | Apple API Issuer UUID | macOS |
| `APPLE_TEAM_ID` | 与 Developer ID 证书一致的 10 位 Apple Team ID | macOS |

私钥只解码到 runner 临时目录的文件，Unix 权限为 `0600`，完成或失败后清理。
不要把真实证书、私钥、密码、token 或值示例放入仓库、Issue、Release notes 或日志。
Secrets 只注入对应平台的打包步骤；smoke 及 artifact 上传步骤不接收这些凭据。

## 验证与安全失败

Windows 同时要求 packaged `yourcrush.exe` 和最终 NSIS 安装 EXE 的 Authenticode 状态
为 `Valid`、存在时间戳、签名证书 SHA-256 相同。signed 模式强制
`forceCodeSigning=true`、`signAndEditExecutable=true`，未签名或不受信任的证书均失败。

macOS 要求 Developer ID Application、匹配 `APPLE_TEAM_ID` 及 hardened runtime。
electron-builder 完成 app notarization 后，脚本执行深层严格签名验证、app 的
`stapler validate` 和 Gatekeeper execute assessment。最终 DMG 也必须匹配 Developer
ID、提交 `notarytool` 获得 `Accepted`、staple、validate，并通过 Gatekeeper open
assessment。DMG stapling 完成后重新生成 blockmap，并刷新更新清单中的 SHA-512 和
size，避免下载文件变化后沿用旧的增量更新元数据。

缺少凭据在调用 builder 前失败；缺少工具、超时、输出过大、签名无效、Apple 拒绝、
staple 缺失及 Gatekeeper 拒绝均阻止后续发布。工具输出只在内存中用于判定，不打印
原始错误或参数。失败报告仅保存安全错误码和缺失输入名称。

## 报告与复核

每个平台生成 `release/signing/SIGNING-STATUS-<version>-<os>-<arch>.json`：

- `mode`、`status`、`releaseCodeSigning`、`notarization` 记录真实执行状态。
- `checks` 保存安全的验证结果，Windows 仅保存证书散列，不保存人物或证书主体名称。
- `artifacts` 绑定最终安装文件名及 SHA-256。
- `failureCode`、`externalBlockers` 只保存错误码及缺失输入名称，不保存 secret 值。

真实 packaged smoke 成功后，`finalize-platform.mjs` 验证八项检查、native SQLite、
应用版本、两次正常退出，并绑定同一安装文件，生成精简的 `SMOKE-STATUS`。该公开
报告去除临时 userData、完整日志、项目路径和正文。失败诊断保存在单独 CI artifact，
最终下载集合不包含 `builder-debug.yml`。

三平台下载目录保持独立；collector 拒绝缺失平台、同名碰撞、意外文件、旧版本、报告
不一致、安装文件变化和错误更新散列，通过后生成并独立复核 `SHA256SUMS.txt`。
真实 signed workflow 完成后，应复核 Windows 的两个签名验证结果、macOS 的 app/DMG
四项验证、三平台 packaged smoke，以及最终下载 checksum，才能移除对应 external
blocker。此前保持 prerelease，不能把已实现的流程写成已完成真实签名。

本地无签名验证命令（Node.js 22，先完成依赖安装）：

```bash
npm run build
node scripts/release/package.mjs unsigned-prerelease
npm run test:packaged
node scripts/release/finalize-platform.mjs
```

Linux smoke 命令使用 `xvfb-run --auto-servernum npm run test:packaged`。本地命令验证当前
平台；三平台完整验证由 CI matrix 和 `Three-platform release integrity` job 执行。
