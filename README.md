# SideQuest — 本地 Python 版

技术栈：**Python + Flask + SQLite + HTML/CSS + 原生 JavaScript**。

- `app.py`：本地 HTTP 服务、API 和访问限制。
- `sidequest.py`：任务与想法管理、校验、推荐、计时、XP、进度、备份合并及数据库事务。
- `dist/`：原有界面；JavaScript 负责显示、表单、弹窗、请求和分享文本，不决定计时资格或发放 XP。
- `instance/sidequest.sqlite3`：运行时自动创建的本地数据库，不提交到版本库。
- 只有 Flask 是直接第三方依赖；SQLite 和测试框架来自 Python 标准库。不需要 Node.js、npm、前端框架或构建步骤。

## 启动

当前电脑已创建 `.venv` 并安装依赖。双击 `start.cmd`，服务就绪后会自动打开 **http://127.0.0.1:4173/**。若已运行，会复用现有服务。使用期间保持首次启动窗口运行，Ctrl+C 停止；重启电脑后需要重新启动。

也可在此目录运行：

```powershell
.\.venv\Scripts\python.exe app.py
```

首次在其他电脑设置（建议 Python 3.12 或更新的稳定版本；本项目验证使用 3.12）：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

## 数据和旧版迁移

这是本机单用户应用。连接本地服务的浏览器使用同一 SQLite 工作区，不再把业务数据写入 localStorage。仅监听 127.0.0.1，没有账号系统或远程访问功能。

1. 在原来的线上 SideQuest 点击下载备份。
2. 打开本地 Python 版，点击页脚 **Restore backup**，选择 JSON 文件。
3. 导入会保留已编辑的本地任务，按 ID 合并任务/想法并去重历史记录。未编辑的示例任务可由备份中的同 ID 任务替换，避免遮住旧数据。

旧备份没有 ideas/updatedAt 字段也能导入。不会自动读取或删除原浏览器数据。导出包含任务、想法和历史进度，不包含活动计时会话。直接复制 SQLite 文件备份时请先停止应用；通常使用界面导出即可。

## 计时与数据一致性

Python 依据服务端时间计算专注时长；浏览器每秒查询显示。暂停时间不计入，重复领取、并发领取、伪造前端 finished/XP 数值均不能多领奖。重置或关闭专注弹窗取消资格，切换任务会替换当前会话。刷新页面后需要重新打开任务并开始新会话。已运行的计时记录保存在数据库中，但本版尚未提供刷新后的会话恢复界面。

修改或删除正在专注的任务会使该会话失效。删除任务保留历史 wins/XP。写操作使用 SQLite 事务；保存失败不会部分删除想法或发放 XP。

## 检查

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
```

测试使用独立临时数据库和可控时钟，不修改真实工作区。

## 线上版本

用户选择先完成本地版，**当前线上网站仍是之前发布的 JavaScript 版**。`.openai/hosting.json` 保留原站点身份；不要把当前 `dist/` 单独按静态网站发布，它现在需要 Python API。后续上线需要 Python 托管环境及生产服务器配置。本地 Flask 开发服务器仅用于本机使用。

连接失败时可点击页面上的 **Retry connection**，不必清空数据或刷新表单。短暂断线会保留专注会话并继续查询，连接恢复并确认后才能领取 XP。

开发者可选前端回归检查：`node --test tests/frontend.cjs`。Node 只用于这项开发检查，运行应用不需要它。
