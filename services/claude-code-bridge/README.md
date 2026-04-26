# claude-code-bridge

Sidecar service that lets the Lewhofmeyr dashboard's Cerebro agent spawn
Claude Agent SDK subprocesses and stream their output back to the user's
browser in real time. Replaces the previous fire-and-forget
`push_to_claude_code` webhook pattern with a bidirectional WebSocket
channel that supports approval gating on destructive tools.

## Architecture

```
Browser  ──HTTPS──▶  Next.js (/api/cerebro/build/proxy)  ──WSS──▶  this service  ──spawn──▶  Claude Agent SDK
                                                                       │
                                                                       └──▶  /tmp sandbox dir per session
```

The dashboard never talks to this service directly from the browser —
all calls proxy through Next.js so the shared HMAC secret stays
server-side.

## Endpoints

- `POST /sessions` — body `{ repoUrl?, branch? }` — clones (or creates
  empty) a sandbox dir under `SANDBOX_ROOT`, returns `{ session_id, cwd }`.
- `DELETE /sessions/:id` — destroys the session and removes the sandbox.
- `WS /ws/:session_id` — duplex stream. Inbound `ControlEvent`, outbound
  `StreamEvent` (see `src/sessions.ts` for the union types).

All routes require `Authorization: Bearer <ts>:<session_id>:<hmac>` where
the hmac is `HMAC-SHA256(BRIDGE_SECRET, "${ts}:${session_id}")` and `ts`
is unix-millis within a 60 s freshness window.

## Tools that require approval

`Bash`, `Edit`, `Write`, `WebFetch`, `NotebookEdit` — the SDK pauses, the
sidecar emits `tool_request` with `requires_approval: true`, and the
dashboard sends `tool_approve` or `tool_deny` over the WS. 5-minute
default timeout (auto-deny). All read-only tools (`Read`, `Glob`, `Grep`,
`WebSearch`) flow without prompting.

## Running locally

```bash
cd services/claude-code-bridge
npm install
ANTHROPIC_API_KEY=sk-ant-... BRIDGE_SECRET=$(openssl rand -hex 32) npm run dev
```

## Deploying to Xneelo VPS

Tested on the Xneelo Cloud Server "Ruby" tier (1 vCPU / 1 GB / Ubuntu 22.04).

### 1. SSH in and install Node 22 + git

```bash
ssh root@<xneelo-host>
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get update && apt-get install -y nodejs git nginx certbot python3-certbot-nginx
```

### 2. Pull and build

```bash
mkdir -p /opt/claude-code-bridge && cd /opt/claude-code-bridge
git clone --depth 1 https://github.com/Lewhof/my-ai-tool.git tmp
cp -r tmp/services/claude-code-bridge/* . && rm -rf tmp
npm install
npm run build
mkdir -p /var/lib/cc-bridge/sessions
```

### 3. Environment file

```bash
cat > /etc/claude-code-bridge.env <<EOF
ANTHROPIC_API_KEY=sk-ant-...
BRIDGE_SECRET=$(openssl rand -hex 32)
PORT=8787
SANDBOX_ROOT=/var/lib/cc-bridge/sessions
NODE_ENV=production
EOF
chmod 600 /etc/claude-code-bridge.env
```

Note the `BRIDGE_SECRET` value — paste it into the Lewhofmeyr Vercel
project as `CLAUDE_CODE_BRIDGE_SECRET` so dashboard requests authenticate.

### 4. systemd unit

```bash
cat > /etc/systemd/system/claude-code-bridge.service <<'EOF'
[Unit]
Description=Claude Code Bridge sidecar
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/claude-code-bridge
EnvironmentFile=/etc/claude-code-bridge.env
ExecStart=/usr/bin/node /opt/claude-code-bridge/dist/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now claude-code-bridge
systemctl status claude-code-bridge
```

### 5. Nginx reverse proxy + TLS

Reserve a subdomain (e.g. `bridge.lewhofmeyr.co.za`) pointing at the VPS
IP, then:

```bash
cat > /etc/nginx/sites-available/claude-code-bridge <<'EOF'
server {
  listen 80;
  server_name bridge.lewhofmeyr.co.za;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
  }
}
EOF

ln -s /etc/nginx/sites-available/claude-code-bridge /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d bridge.lewhofmeyr.co.za
```

### 6. Wire into Vercel

Add to the Vercel project env vars:
- `CLAUDE_CODE_BRIDGE_URL` = `https://bridge.lewhofmeyr.co.za`
- `CLAUDE_CODE_BRIDGE_SECRET` = the value generated in step 3.

Re-deploy the Lewhofmeyr app — Cerebro's `spawn_claude_code` tool now
routes through the sidecar.

## Security notes

- The agent inherits the host process's filesystem permissions. Per-session
  sandbox dirs are isolated, but a malicious prompt could still read other
  files. Run the systemd unit as a non-root user with a chroot or AppArmor
  profile if exposing this beyond personal use.
- `BRIDGE_SECRET` rotates: change `/etc/claude-code-bridge.env`,
  `systemctl restart claude-code-bridge`, update Vercel env, redeploy.
- The HMAC freshness window is 60 s — tightening protects against replay
  but breaks high-latency networks. Don't lower below 30 s.
