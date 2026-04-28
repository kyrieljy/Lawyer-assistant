# 律师案件进度助手 H5 服务器版

这是从 Electron 桌面版拆出的服务器部署版：React H5 前端 + FastAPI 后端 + SQLite 数据库。适合先部署到一台阿里云/腾讯云轻量应用服务器上，用浏览器访问。

## 运行环境

- Linux：Ubuntu 22.04 LTS
- Python：3.10、3.11 或 3.12
- Node.js：20 LTS 或 22 LTS
- 内存：最低 2GB，带本地 OCR 时建议 4GB

不要使用 Python 3.13/3.14。`rapidocr-onnxruntime`、`onnxruntime` 目前对新 Python 版本支持不完整。

## 本地开发

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r scripts/requirements.txt
npm ci
```

启动后端：

```bash
source .venv/bin/activate
LAWYER_ASSISTANT_DATA_DIR=./server-data PORT=8000 python scripts/server.py
```

启动前端开发服务：

```bash
npm run dev
```

浏览器访问：

```text
http://127.0.0.1:5173
```

## 生产部署

在服务器拉代码后执行：

```bash
cd /opt/lawyer-case-assistant-h5
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r scripts/requirements.txt
npm ci
npm run build
```

启动服务：

```bash
source .venv/bin/activate
LAWYER_ASSISTANT_DATA_DIR=/opt/lawyer-case-assistant-data PORT=8000 python scripts/server.py
```

服务启动后，同一个 FastAPI 进程会同时提供：

- H5 页面：`http://服务器IP:8000/`
- API：`http://服务器IP:8000/api/*`
- 数据库：`/opt/lawyer-case-assistant-data/data/app.db`
- 文件归档：`/opt/lawyer-case-assistant-data/files`
- Excel 导出临时文件：`/opt/lawyer-case-assistant-data/exports`
- 备份：`/opt/lawyer-case-assistant-data/backups`

## 默认账号

服务首次启动会自动创建一个默认账号：

```text
用户名：admin
密码：admin666
```

上线后建议先注册个人账号，再停用默认账号的登录入口或修改默认密码。当前版本只做账号登录和操作留痕，没有权限区分。

注册字段：

- 用户名
- 姓名
- 职位
- 密码，必须大于 6 位

## 业务日志

系统会记录登录、注册、保存案件、保存事件、上传文件、OCR、导出 Excel、导入旧数据库等关键操作。日志入口在左侧菜单“业务日志”。

## 导入旧单机数据库

部署到云端后，可以在“系统设置”里点击“上传旧数据库”，选择原桌面版的 `app.db` 上传。系统会：

- 先备份当前云端数据库
- 导入旧库中的案件、事件、期限、字段、导出映射、系统设置
- 保留云端账号、登录会话和业务日志

注意：桌面版如果把飞书密钥或大模型 Key 存到了系统钥匙串，数据库里可能只保存 `__keyring__` 占位符，真实密钥不会包含在 `app.db` 里。导入后需要在云端系统设置里重新填写这些密钥。

另外，上传 `app.db` 只迁移数据库记录，不会自动上传桌面电脑上的归档文件实体。旧库中的文件路径如果指向用户本机，云服务器无法直接读取这些本地文件。

## systemd 示例

创建 `/etc/systemd/system/lawyer-case-assistant.service`：

```ini
[Unit]
Description=Lawyer Case Assistant H5
After=network.target

[Service]
WorkingDirectory=/opt/lawyer-case-assistant-h5
Environment=LAWYER_ASSISTANT_DATA_DIR=/opt/lawyer-case-assistant-data
Environment=PORT=8000
ExecStart=/opt/lawyer-case-assistant-h5/.venv/bin/python scripts/server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable lawyer-case-assistant
sudo systemctl start lawyer-case-assistant
sudo systemctl status lawyer-case-assistant
```

## Nginx 反向代理示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

正式使用建议绑定域名并配置 HTTPS。

## 与桌面版的差异

- 文件上传改为浏览器上传到服务器，再由后端归档。
- Excel 导出改为浏览器直接下载。
- “打开所在文件夹”改为“下载文件”，因为浏览器不能打开服务器文件夹。
- 系统设置里的导出目录、备份目录是服务器路径，不是用户本机路径。
- 数据库仍然是 SQLite，单律师或小团队测试够用；多人长期并发建议后续迁移 PostgreSQL。

## Git 注意事项

不要提交这些目录：

- `node_modules/`
- `.venv/`
- `renderer-dist/`
- `server-data/`
- `.lawyer-case-assistant-data/`

这些已在 `.gitignore` 中排除或应当保持排除。
