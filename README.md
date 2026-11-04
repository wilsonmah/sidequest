# SideQuest

[English](README.en.md) | 中文

SideQuest 帮助你持续推进个人项目：记下想法，为项目写下一个小步骤，随时回来继续。同一套代码提供两个版本：供一人在本机使用的本地版，以及带账号和付费方案的在线版。界面为英文，数据保存在 SQLite 中。

## 两个版本

| | 本地版（默认） | 在线版（`SIDEQUEST_MODE=hosted`） |
| --- | --- | --- |
| 适用对象 | 你自己，在这台电脑上 | 任何人，在任意设备的浏览器中 |
| 账号 | 无 | 邮箱和密码，可通过邮件重置密码，可删除账号 |
| 方案 | 包含全部功能 | 免费版：最多 3 个进行中项目。Pro：不限项目数并提供 12 周报告，通过 Stripe 收费，每月 $9 或每年 $72 |
| 数据位置 | 本机 `instance/sidequest.sqlite3` | 服务器数据库（容器内为 `/data/sidequest.sqlite3`），各账号相互独立 |
| 运行方式 | `start.cmd` | Docker / Render，详见 [DEPLOY.md](DEPLOY.md) |

商业评估、定价测算与推广计划见 [REVIEW.md](REVIEW.md)。

## 功能

- 捕捉想法，将想法转成项目；记录上次进度、下一步、阻碍及可选收入目标。
- 按可用时间推荐步骤，查看最近七天的进展、里程碑和 XP。
- 每完成一个步骤获得 25 XP；计时是可选的，无需等倒计时结束。
- 完成步骤和完成项目是两个独立操作。下一步可留空，项目仍会保持进行中；确认 **Finish project** 后才进入完成列表，也可重新开启。
- 当前专注会话保存在服务端（本地版保存在本机，在线版保存在你的账号中）。关闭弹窗或刷新后，可以通过 **Return to step** 恢复；运行中的倒计时继续，暂停中的计时保持暂停。未提交的下一步输入不保证在刷新后保留。
- 导出或导入 JSON 备份；可选择复制一条进度消息或分享可编辑的步骤链接。
- 仅在线版：带定价的落地页、注册和登录、达到免费上限时的升级提示、订阅用户的 **Manage billing**，以及页脚的 **Log out** 和 **Delete account**。

## 运行本地版

需要 Python 3.12 或更高版本以及 Flask。SQLite 和测试框架使用 Python 标准库；不需要 Node.js 或前端构建。

首次在 Windows 的项目目录运行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

双击 `start.cmd`，服务就绪后会打开 <http://127.0.0.1:4173/>。如果服务已经运行，启动器会复用它。保持首次启动窗口运行；按 Ctrl+C 停止服务。也可以手动运行：

```powershell
.\.venv\Scripts\python.exe app.py
```

## 在本机试用在线版

在项目目录中打开一个**新的** PowerShell 窗口运行：

```powershell
$env:SIDEQUEST_MODE="hosted"; $env:SECRET_KEY="dev-only-secret-key-not-for-production-0123456789"; $env:PORT="4180"; $env:SIDEQUEST_DB="instance\hosted-trial.sqlite3"
.\.venv\Scripts\python.exe app.py
```

这些设置只在该窗口中有效；`SIDEQUEST_DB` 让试用账号保存在单独的文件中，不会和本地工作区混在一起。试用结束后请关闭该窗口，否则在同一窗口中运行 `start.cmd` 或 `app.py` 也会以在线版模式启动。

打开 <http://localhost:4180/> 查看落地页，用任意测试邮箱注册即可。未配置 Stripe 时，Pro 弹窗会提示升级即将开放，其余功能都可使用。正式上线所需的 Stripe、邮件、域名和备份设置见 [DEPLOY.md](DEPLOY.md)。

## 数据、备份和隐私

**本地版：** 单用户，仅监听 `127.0.0.1`，没有账号或远程访问。连接同一本机服务的浏览器共享 `instance/sidequest.sqlite3` 中的工作区，该文件不会提交到仓库。复制 SQLite 文件前请先停止应用。

**在线版：** 每个账号拥有独立的工作区，无法读取或修改其他账号的数据。密码只以加盐哈希形式保存。付款由 Stripe 处理，应用只保存 Stripe 客户与订阅 ID 及状态，从不保存银行卡信息。**Delete account** 会删除账号及其工作区，并取消订阅。`dist/` 中的隐私政策和服务条款是模板，上线前必须补全。

**备份（两个版本通用）：** 使用页面顶部的下载按钮导出备份，使用页脚 **Restore backup** 导入。导入按 ID 合并项目和想法、去重历史记录，保留已编辑的项目；未编辑的示例项目可由同 ID 的备份项目替换。旧备份也可导入。备份包含项目、想法和进度，不包含活动计时会话。

分享步骤链接仅包含项目名称、步骤、时长和类别，接收者可阅读和修改这些内容后另存一份。在线版的链接可在任意设备打开；本地版的链接只能在这台电脑上打开。本地版的 Pro 弹窗仅介绍在线版方案，不提供付款。

## 会话与一致性

每个工作区同一时间只能有一个活动专注会话。切换到另一步骤需要确认并结束原会话；修改或删除当前项目也会使会话失效。计时由服务端时间计算，暂停时间不计入；计时结束不会自动完成步骤。每个会话只能记录一次完成，重复或并发请求不会重复发放 XP。数据库写入使用事务，失败时不会部分保存。

如果连接中断，可点击 **Retry connection**；会话保留，连接恢复并确认后可继续操作。

## 开发与测试

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
node --test tests/frontend.cjs
```

Python 测试（`test_app.py` 覆盖共用逻辑和本地版，`test_hosted.py` 覆盖账号、方案和计费）使用独立临时数据库、可控时钟和模拟的 Stripe API，无需密钥或网络。Node.js 仅用于可选的前端回归测试。

- `app.py`：两个版本共用的 HTTP 服务和 API。
- `sidequest.py`：项目、计时、进度、备份、套餐限制和 SQLite 事务。
- `accounts.py`、`billing.py`：在线版账号与 Stripe 计费。
- `wsgi.py`、`Dockerfile`、`render.yaml`、`requirements-prod.txt`、`.env.example`：生产环境部署。
- `dist/`：应用、落地页、登录页和法律页面（HTML、CSS 和原生 JavaScript）。
- `tests/`：后端及前端回归测试。

`dist/` 依赖 Python API，不能单独作为静态站点发布。
