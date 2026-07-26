# Imprint 桌面应用构建、签名与发布指南

本文档用于把 Imprint 从一台新的开发电脑完整发布到 GitHub Releases。按顺序操作后，可以得到：

- Windows x64 Squirrel 安装程序；
- macOS Apple Silicon DMG；
- macOS Intel DMG；
- 自动生成的发布说明；
- 所有发布文件的 SHA-256 校验和；
- Windows Authenticode 签名；
- macOS Developer ID 签名、Apple 公证与 stapling。

正式发布由 [`.github/workflows/release.yml`](./.github/workflows/release.yml) 完成。本地 `pnpm release`
只负责检查源码、更新版本、生成 Changelog、创建 release commit 和 tag，然后把 tag 推送到 GitHub。

## 1. 先理解发布流程

```text
本地 pnpm release
        │
        ├─ 检查 main 分支和工作区
        ├─ TypeScript / ESLint / Prettier 检查
        ├─ 更新 package.json 版本
        ├─ 根据 Conventional Commits 更新 CHANGELOG.md
        ├─ 创建 chore(release): vX.Y.Z
        └─ 创建并原子推送 annotated tag
                         │
                         ▼
                 GitHub Actions
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
 Windows x64       macOS arm64       macOS x64
 PFX 签名          Developer ID      Developer ID
 验证签名          签名与公证         签名与公证
        └────────────────┼────────────────┘
                         ▼
                 GitHub Release
                 + SHA256SUMS.txt
```

正式 tag 构建要求签名 Secrets 完整存在。缺少任意签名凭据时，相应平台会失败，不会发布未签名正式版本。

本地执行 `pnpm build` 或 `pnpm make` 时不要求签名凭据，适合开发和内部测试，但这些未签名产物不要直接公开发布。

## 2. 准备账号和工具

### 2.1 本地开发环境

需要：

- Git；
- Node.js `>= 20.19.0`；
- pnpm `10.7.1`；
- GitHub CLI `gh`；
- Chrome 或 Edge，用于核心网页提取和 E2E；
- Windows 电脑用于本地验证 Windows 安装包；
- Mac 用于创建 Apple 证书和最终验证 macOS 安装包。

检查版本：

```powershell
git --version
node --version
pnpm --version
gh --version
```

如果没有固定版本的 pnpm：

```powershell
corepack enable
corepack prepare pnpm@10.7.1 --activate
```

登录 GitHub：

```powershell
gh auth login
gh auth status
gh repo view woai3c/imprint
```

### 2.2 发布账号

macOS 公开发布需要：

- 有效的 Apple Developer Program 会员；
- `Developer ID Application` 证书；
- App Store Connect Team API Key。

Windows 公开发布需要：

- 公共信任的 Windows 代码签名证书；
- 当前 workflow 使用可导出的 `.pfx` 文件和 PFX 密码。

如果 Windows 证书只能存放在 USB Token、硬件设备或厂商云 HSM 中，不能直接照搬本文的 PFX 步骤，需要把 workflow
改成厂商云签名或 self-hosted runner。购买证书前应先确认交付方式和 CI 使用许可。

## 3. 获取并检查源码

```powershell
git clone git@github.com:woai3c/imprint.git
Set-Location imprint
pnpm install --frozen-lockfile
```

运行基础检查：

```powershell
pnpm typecheck
pnpm exec eslint .
pnpm format:check
pnpm build
```

运行不需要 LLM 和外部网络的核心 E2E：

```powershell
pnpm test:e2e
```

E2E 会启动一个本地网页，打开打包后的 Electron 应用，完成：

1. 输入本地 URL；
2. 使用系统 Chrome/Edge 提取设计系统；
3. 验证品牌色、间距、圆角和 CSS 变量；
4. 保存到主题库；
5. 验证 SQLite 中的主题和分析历史。

测试会使用临时用户数据目录，不会污染日常使用的 Imprint 数据，也不需要配置任何 LLM Key。

## 4. 配置 GitHub Actions

打开：

```text
https://github.com/woai3c/imprint/settings/actions
```

确认：

1. Actions 已启用；
2. workflow 可以使用 GitHub-hosted runners；
3. `Workflow permissions` 允许读写仓库内容；
4. `main` 是默认分支；
5. 仓库允许创建 GitHub Releases。

workflow 自身已经声明 `contents: write`，用于创建 GitHub Release 和上传附件。

签名凭据放在：

```text
Settings
→ Secrets and variables
→ Actions
→ Repository secrets
```

不要把证书、私钥、密码或 API Key 提交到 Git。

## 5. 配置 macOS 签名与公证

### 5.1 创建 Developer ID Application 证书

推荐在受信任的 Mac 上操作：

1. 打开“钥匙串访问”；
2. 选择“钥匙串访问”→“证书助理”→“从证书颁发机构请求证书”；
3. 输入 Apple Developer 账号邮箱；
4. 选择保存到磁盘，生成 `.certSigningRequest`；
5. 登录 Apple Developer；
6. 打开 `Certificates, Identifiers & Profiles`；
7. 进入 `Certificates`，点击 `+`；
8. 选择 `Developer ID`；
9. 选择 `Developer ID Application`；
10. 上传刚才的 CSR；
11. 下载 `.cer`，双击导入钥匙串；
12. 在“我的证书”中确认该证书可以展开，并且下方存在私钥；
13. 同时选中证书和私钥，导出为 `.p12`；
14. 给 `.p12` 设置一个强密码。

在 Mac 终端验证：

```bash
security find-identity -v -p codesigning
```

应该能看到：

```text
Developer ID Application: 你的名称 (TEAMID)
```

只有 `.cer` 没有私钥不能用于 CI 签名。上传到 GitHub 的 `.p12` 必须包含对应私钥。

### 5.2 创建 App Store Connect API Key

1. 登录 App Store Connect；
2. 进入“用户和访问”；
3. 打开 Integrations / Keys；
4. 在 Team Keys 中创建一个用于发布的 API Key；
5. 下载 `AuthKey_XXXXXXXXXX.p8`；
6. 记录 Key ID；
7. 记录 Issuer ID。

`.p8` 通常只能下载一次，请立即创建安全备份。

Imprint 使用 API Key 公证，不使用 Apple 登录密码，也不使用 Apple ID 应用专用密码。

### 5.3 写入 macOS GitHub Secrets

macOS 需要五个 Secrets：

| Secret                       | 内容                          |
| ---------------------------- | ----------------------------- |
| `MACOS_CERTIFICATE_BASE64`   | 包含私钥的 `.p12` 文件 Base64 |
| `MACOS_CERTIFICATE_PASSWORD` | `.p12` 导出密码               |
| `APPLE_API_KEY_BASE64`       | `AuthKey_*.p8` 文件 Base64    |
| `APPLE_API_KEY_ID`           | App Store Connect Key ID      |
| `APPLE_API_ISSUER`           | App Store Connect Issuer ID   |

在 PowerShell 中设置路径：

```powershell
$macCertificatePath = 'D:\private\DeveloperIDApplication.p12'
$appleApiKeyPath = 'D:\private\AuthKey_XXXXXXXXXX.p8'

if (-not (Test-Path -LiteralPath $macCertificatePath -PathType Leaf)) {
  throw "找不到 macOS 证书：$macCertificatePath"
}

if (-not (Test-Path -LiteralPath $appleApiKeyPath -PathType Leaf)) {
  throw "找不到 Apple API Key：$appleApiKeyPath"
}
```

直接从文件写入 GitHub，不生成中间 Base64 文件：

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes($macCertificatePath)
) | gh secret set MACOS_CERTIFICATE_BASE64 --repo woai3c/imprint

[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes($appleApiKeyPath)
) | gh secret set APPLE_API_KEY_BASE64 --repo woai3c/imprint
```

下面的命令会交互式提示输入，不会把值放进命令行历史：

```powershell
gh secret set MACOS_CERTIFICATE_PASSWORD --repo woai3c/imprint
gh secret set APPLE_API_KEY_ID --repo woai3c/imprint
gh secret set APPLE_API_ISSUER --repo woai3c/imprint
```

分别输入 P12 密码、Key ID 和 Issuer ID。不要把这些值发到聊天中。

## 6. 配置 Windows 代码签名

### 6.1 确认证书可用于 GitHub-hosted runner

本文的完整流程要求：

- 证书是面向公众分发的受信任代码签名证书；
- 能导出为包含私钥的 `.pfx`；
- 提供方允许在 GitHub-hosted runner 中使用；
- 已知 PFX 密码。

如果提供方只交付 USB Token，跳过本节，先改成自托管 runner 或提供方的远程签名方案。

自签名证书只能验证技术流程，不能让普通 Windows 用户自动信任，不要用于正式公开发布。

### 6.2 写入 Windows GitHub Secrets

Windows 需要两个 Secrets：

| Secret                         | 内容                          |
| ------------------------------ | ----------------------------- |
| `WINDOWS_CERTIFICATE_BASE64`   | 包含私钥的 `.pfx` 文件 Base64 |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX 密码                      |

在 PowerShell 中：

```powershell
$windowsCertificatePath = 'D:\private\WindowsCodeSigning.pfx'

if (-not (Test-Path -LiteralPath $windowsCertificatePath -PathType Leaf)) {
  throw "找不到 Windows 证书：$windowsCertificatePath"
}

[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes($windowsCertificatePath)
) | gh secret set WINDOWS_CERTIFICATE_BASE64 --repo woai3c/imprint

gh secret set WINDOWS_CERTIFICATE_PASSWORD --repo woai3c/imprint
```

最后一个命令会交互式提示输入 PFX 密码。

## 7. 检查 Secrets

```powershell
gh secret list --repo woai3c/imprint
```

完整 PFX 发布路线应该显示以下七个名称：

```text
APPLE_API_ISSUER
APPLE_API_KEY_BASE64
APPLE_API_KEY_ID
MACOS_CERTIFICATE_BASE64
MACOS_CERTIFICATE_PASSWORD
WINDOWS_CERTIFICATE_BASE64
WINDOWS_CERTIFICATE_PASSWORD
```

命令只显示名称和更新时间，不会显示 Secret 的值。

任何一个名称拼写错误都会导致正式构建失败。workflow 不会因为凭据缺失而退化成未签名发布。

## 8. 发布前本地检查

切换并同步 `main`：

```powershell
git switch main
git pull --ff-only
git status --short
```

`git status --short` 必须没有输出。

安装锁定依赖：

```powershell
pnpm install --frozen-lockfile
```

执行检查：

```powershell
pnpm test:e2e
pnpm run release:check
```

预览下一次发布的 Changelog，不修改任何文件：

```powershell
pnpm release current --dry-run
```

如果 `v0.1.0` 尚未发布，`current` 表示发布当前 `package.json` 中的 `0.1.0`。之后通常使用：

```powershell
pnpm release patch --dry-run
```

也可以查看命令帮助：

```powershell
pnpm release --help
```

## 9. 创建正式发布

交互式执行：

```powershell
pnpm release
```

根据提示选择：

- current：首次发布当前版本；
- patch：例如 `0.1.0 → 0.1.1`；
- minor：例如 `0.1.1 → 0.2.0`；
- major：例如 `0.2.0 → 1.0.0`；
- custom：输入明确版本。

确认后，命令会：

1. 再次检查干净的 `main`；
2. 运行 `release:check`；
3. 根据上一个 `vX.Y.Z` tag 后的 Conventional Commits 生成分类 Changelog；
4. 更新 `package.json`；
5. 更新 `CHANGELOG.md`；
6. 创建 `chore(release): vX.Y.Z`；
7. 创建 annotated tag；
8. 使用 `git push --atomic` 同时推送 commit 和 tag。

非交互示例：

```powershell
pnpm release patch --yes
pnpm release 1.0.0 --yes
```

如果希望先在本地检查 release commit 和 tag：

```powershell
pnpm release current --no-push
git show --stat
git show v0.1.0
```

确认后手动原子推送：

```powershell
git push --atomic origin HEAD:main refs/tags/v0.1.0
```

## 10. 观察 GitHub Actions

发布后打开：

```text
https://github.com/woai3c/imprint/actions/workflows/release.yml
```

也可以使用：

```powershell
gh run list --repo woai3c/imprint --workflow release.yml --limit 5
gh run watch --repo woai3c/imprint
```

workflow 顺序：

1. `Verify release`
   - 验证 tag 格式；
   - 验证 tag 与 `package.json` 版本一致；
   - 验证 `CHANGELOG.md` 存在对应版本；
   - 执行 TypeScript、ESLint、Prettier 检查。
2. `Build windows-x64`
   - 解码临时 PFX；
   - Electron Forge 打包；
   - 使用 release build 运行无需 LLM 的核心 E2E；
   - Squirrel.Windows 代码签名；
   - `Get-AuthenticodeSignature` 强制验签。
3. `Build macos-arm64`
   - 导入 P12 到随机临时钥匙串；
   - 签名并公证 `.app`；
   - 生成、签名、公证并 staple DMG；
   - `codesign`、`spctl` 和 `stapler` 验证。
4. `Build macos-x64`
   - 与 arm64 相同，但在 Intel runner 原生构建。
5. `Publish GitHub Release`
   - 汇总三个 runner 的产物；
   - 从 `CHANGELOG.md` 提取发布说明；
   - 生成 `SHA256SUMS.txt`；
   - 创建 GitHub Release。

只有三个平台全部成功，才会执行发布 job。

## 11. 发布产物

GitHub Release 应包含：

```text
Imprint-vX.Y.Z-windows-x64-setup.exe
imprint-X.Y.Z-full.nupkg
RELEASES
Imprint-vX.Y.Z-macos-arm64.dmg
Imprint-vX.Y.Z-macos-x64.dmg
SHA256SUMS.txt
```

其中：

- Windows 普通用户下载 `*-setup.exe`；
- macOS Apple Silicon 用户下载 `*-macos-arm64.dmg`；
- macOS Intel 用户下载 `*-macos-x64.dmg`；
- `.nupkg` 和 `RELEASES` 用于 Squirrel.Windows 更新能力；
- `SHA256SUMS.txt` 用于验证文件完整性。

## 12. 验证 Windows 安装包

下载 Setup.exe，在 PowerShell 运行：

```powershell
$installer = '.\Imprint-v0.1.0-windows-x64-setup.exe'

Get-AuthenticodeSignature -LiteralPath $installer |
  Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
```

预期：

- `Status` 为 `Valid`；
- `SignerCertificate` 是证书申请时验证的发布者；
- 存在可信时间戳；
- 安装界面不显示“未知发布者”。

校验 SHA-256：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath $installer
```

和 `SHA256SUMS.txt` 中对应行比较。

还应在全新 Windows 虚拟机中验证：

1. 安装；
2. 启动；
3. 任务栏和托盘图标；
4. 关闭窗口后留在托盘；
5. 托盘重新打开；
6. 托盘退出；
7. 卸载。

签名能证明发布者身份和文件完整性，但新证书或新产品仍可能经历 SmartScreen 信誉积累。

## 13. 验证 macOS 安装包

下载并挂载对应架构 DMG，把 Imprint 拖入 `/Applications`。

验证应用：

```bash
codesign --verify --deep --strict --verbose=2 /Applications/Imprint.app
spctl --assess --type execute --verbose=4 /Applications/Imprint.app
xcrun stapler validate /Applications/Imprint.app
```

验证 DMG：

```bash
codesign --verify --verbose=2 Imprint-v0.1.0-macos-arm64.dmg
xcrun stapler validate Imprint-v0.1.0-macos-arm64.dmg
```

预期：

- `codesign` 不报错；
- `spctl` 返回 `accepted`；
- 来源是 `Developer ID`；
- `stapler` 验证成功；
- 双击打开时不需要用户使用“仍要打开”绕过 Gatekeeper。

Apple Silicon 和 Intel 产物必须分别在对应机器或虚拟环境验证。

## 14. 发布失败如何处理

### 14.1 缺少 Secret

日志会显示：

```text
Missing required GitHub Actions secret: SECRET_NAME
```

补充或覆盖对应 Secret 后，在 GitHub Actions 页面选择 `Re-run failed jobs`。Secret 更新后可以重跑同一个 tag，
不需要移动 tag。

### 14.2 macOS 找不到 Developer ID

检查：

- P12 是否包含私钥；
- 证书是否为 `Developer ID Application`；
- P12 密码是否正确；
- 证书是否过期或被撤销；
- Base64 Secret 是否由完整二进制文件生成。

### 14.3 macOS 公证失败

检查：

- API Key ID 与 Issuer ID 是否属于同一 Team Key；
- `.p8` 是否完整；
- API Key 权限是否足够；
- Apple Developer 会员是否有效；
- Actions 日志中的 `notarytool log` 输出。

DMG 公证脚本会把“提交”和“等待”分开。网络暂时失败时，它只重试等待，不会反复创建无意义的发布版本。

### 14.4 Windows 显示 `NotSigned`

检查：

- PFX 是否包含私钥；
- PFX 密码；
- `WINDOWS_CERTIFICATE_BASE64` 是否完整；
- 证书用途是否包含 Code Signing；
- 证书是否允许在 CI 中使用。

workflow 的验签步骤失败时不会进入 GitHub Release。

### 14.5 三个平台成功但没有 Release

检查 `Publish GitHub Release`：

- `contents: write` 是否被仓库或组织策略禁止；
- tag 是否符合 `vX.Y.Z`；
- `CHANGELOG.md` 是否有对应版本；
- GitHub API 是否临时失败。

可以优先重跑失败 job，不要随意删除或移动已经公开的 tag。

## 15. 版本、回滚与重发原则

- 已经公开的 tag 不移动；
- 已经公开的版本不覆盖；
- 代码修复后发布新的 patch 版本；
- 构建暂时失败但源码没变时，可以重跑同一个 workflow；
- Release 附件上传失败可以重跑 publish job；
- 不要使用 `git push --force` 修改发布历史。

如果错误版本已经公开：

1. 在 GitHub Release 页面标记为 pre-release 或写明已撤回；
2. 修复代码；
3. 发布新的 patch 版本；
4. 在新版本说明中解释替代关系。

## 16. 凭据轮换和安全

- 不要在 Issue、PR、聊天或日志中粘贴密码和私钥；
- 不要使用 `gh secret set NAME --body "明文密码"`，避免进入命令历史；
- 证书文件使用 PowerShell 管道直接写入 GitHub；
- 本机证书保存在受控目录，并有加密离线备份；
- P12/PFX 密码使用密码管理器；
- Apple API Key 泄露时立即撤销并重新创建；
- Windows 证书泄露时联系证书颁发机构撤销；
- 定期检查证书有效期；
- 离职、设备丢失或权限变化时立即轮换 Secrets。

GitHub Actions 运行结束后会删除临时 P12、PFX、P8 和 macOS 临时钥匙串。

## 17. 首次配置时可以让我代做什么

我可以继续完成：

- 检查本机证书路径；
- 把证书文件通过本机 `gh` 安全写入 GitHub Secrets；
- 检查 Secret 名称；
- 检查 workflow；
- 运行 E2E 和发布检查；
- 触发并跟踪首个 release；
- 分析 Apple 公证或 Windows 签名失败日志；
- 验证最终 GitHub Release 附件。

你需要亲自完成：

- Apple Developer 和 Windows 证书提供方的注册、付费与身份验证；
- 安全下载并保存证书和 API Key；
- 在交互式 `gh secret set` 中输入密码；
- 确认 Windows 证书是 PFX、云签名还是硬件令牌路线。

提供给我本机文件路径即可，不要提供密码、私钥内容或 Secret 值。

## 官方资料

- [Electron Forge：macOS 签名与公证](https://www.electronforge.io/guides/code-signing/code-signing-macos)
- [Electron Forge：Windows 签名](https://www.electronforge.io/guides/code-signing/code-signing-windows)
- [Electron Forge：Squirrel.Windows](https://www.electronforge.io/config/makers/squirrel.windows)
- [Apple：Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)
- [GitHub：Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
