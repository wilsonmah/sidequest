# SideQuest

[English](README.en.md) | 中文

SideQuest 是一款帮助你持续推进个人项目的本地应用：记下想法，为项目写下一个小步骤，随时回来继续。界面为英文，运行在本机，数据保存在 SQLite 中。

## 两个版本

- **本地版**（默认）：仅在本机使用，无需账号，包含全部功能。运行 `start.cmd`。
- **在线版**（`SIDEQUEST_MODE=hosted`）：面向用户的商业产品，含落地页、账号、免费版（最多 3 个进行中项目）以及通过 Stripe 收费的 Pro（每月 $9 或每年 $72）。上线步骤见 [DEPLOY.md](DEPLOY.md)，商业评估与推广计划见 [REVIEW.md](REVIEW.md)。

## 功能

- 捕捉想法，将想法转成项目；记录上次进度、下一步、阻碍及可选收入目标。
- 按可用时间推荐步骤，查看最近七天的进展、里程碑和 XP。
- 每完成一个步骤获得 25 XP；计时是可选的，无需等倒计时结束。
- 完成步骤和完成项目是两个独立操作。下一步可留空，项目仍会保持进行中；确认 **Finish project** 后才进入完成列表，也可重新开启。
- 当前专注会话保存在本机。关闭弹窗或刷新后，可以通过 **Return to step** 恢复；运行中的倒计时继续，暂停中的计时保持暂停。未提交的下一步输入不保证在刷新后保留。
- 导出或导入 JSON 备份；可选择复制一条进度消息或分享可编辑的步骤链接。

## 安装和运行

需要 Python 3.12（项目已用该版本验证）以及 Flask。SQLite 和测试框架使用 Python 标准库；运行应用不需要 Node.js 或前端构建。

首次在 Windows 的项目目录运行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

双击 `start.cmd`，服务就绪后会打开 <http://127.0.0.1:4173/>。如果服务已经运行，启动器会复用它。保持首次启动窗口运行；按 Ctrl+C 停止服务。也可以手动运行：

```powershell
.\.venv\Scripts\python.exe app.py
```

## 数据、备份和隐私

这是本机单用户应用，仅监听 `127.0.0.1`；没有账号、跨设备同步或远程访问。连接同一本机服务的浏览器共享 SQLite 工作区，数据库位于 `instance/sidequest.sqlite3`，不会提交到仓库。

使用页面顶部的下载按钮导出备份，使用页脚 **Restore backup** 导入。导入按 ID 合并项目和想法、去重历史记录，保留已编辑的本地项目；未编辑的示例项目可由同 ID 的备份项目替换。旧备份也可导入。备份包含项目、想法和进度，不包含活动计时会话；复制 SQLite 文件前请先停止应用。

分享步骤链接仅包含项目名称、步骤、时长和类别，接收者可阅读和修改这些内容后另存一份；链接不会授予远程访问权限。当前本地地址只能在此电脑使用。本地版的 Pro 弹窗仅介绍在线版方案，不提供付款。

## 会话与一致性

每次只能有一个活动专注会话。切换到另一步骤需要确认并结束原会话；修改或删除当前项目也会使会话失效。计时由服务端时间计算，暂停时间不计入；计时结束不会自动完成步骤。每个会话只能记录一次完成，重复或并发请求不会重复发放 XP。数据库写入使用事务，失败时不会部分保存。

如果连接中断，可点击 **Retry connection**；会话保留，连接恢复并确认后可继续操作。

## 开发与测试

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
node --test tests/frontend.cjs
```

Python 测试使用独立临时数据库和可控时钟。Node.js 仅用于可选的前端回归测试。

- `app.py`：两个版本共用的 HTTP 服务和 API。
- `sidequest.py`：项目、计时、进度、备份、套餐限制和 SQLite 事务。
- `accounts.py`、`billing.py`：在线版账号与 Stripe 计费。
- `dist/`：应用、落地页、登录页和法律页面（HTML、CSS 和原生 JavaScript）。
- `tests/`：后端及前端回归测试。

`dist/` 依赖 Python API，不能单独作为静态站点发布。在线版可使用仓库中的 `Dockerfile` 和 `render.yaml` 部署，详见 [DEPLOY.md](DEPLOY.md)。
