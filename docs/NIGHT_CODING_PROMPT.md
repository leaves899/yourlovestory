# 夜间自动编程 - 直接复制使用

**直接复制下面的命令，粘贴给 Claude Code 即可。**

---

## 命令 1：完整实现 + 编译验证（推荐）

```
/goal 根据 docs/CLIENT_IMPLEMENTATION.md 实现 yourcrush Electron 客户端 v0.1.0。实现完成后确保 npx tsc --noEmit 通过编译，然后运行 npm run build 打包。
```

---

## 命令 2：只实现（不含编译）

```
/goal 根据 docs/CLIENT_IMPLEMENTATION.md 实现 yourcrush Electron 客户端 v0.1.0，在 yourcrush-client/ 目录创建完整项目，确保 npm run dev 能正常启动。
```

---

## 命令 3：编译检查（已实现后使用）

```
/goal 运行 npx tsc --noEmit 检查 TypeScript 编译，然后运行 npm run build 打包。如果有编译错误就修复，直到编译通过、打包成功。
```

---

## 使用说明

1. **晚上开始前：** 复制「命令 1」粘贴给 Claude Code
2. **第二天检查：** 看是否编译通过、打包成功
3. **如果没完成：** 继续对话，Claude Code 会自动继续

---

## 验收标准

- `npx tsc --noEmit` 通过（无 TypeScript 错误）
- `npm run build` 成功打包
- `npm run dev` 能正常启动窗口
- 能输入碎片并保存
- 能生成叙事并流式显示
- 错误提示正常工作