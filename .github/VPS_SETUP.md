# VPS setup — bare server to `just docker-deploy`

A copy-paste walkthrough of the **one-time server setup**: from a fresh VPS to the first `just docker-deploy`. What each env key means, what the build does, and day-2 operations live in [`DEPLOYMENT.md`](DEPLOYMENT.md) — every step below links to the matching section instead of repeating it.

Every install step uses **Fedora** (`dnf`). Commands run as your sudo user, not root.

---

## What gets installed (and why)

| Tool | Why the stack needs it |
| :--- | :--- |
| **Docker Engine** + **compose plugin** + **buildx** | `just docker-deploy` runs `docker compose up -d --build`; the image build mounts `.env.keys` as a BuildKit secret, so BuildKit (compose ≥ 2, Docker ≥ 23) is required |
| **just** | the recipe runner behind `just docker-deploy`, `just env-decrypt`, `just docker-logs`, … |
| **Bun** (repo pins `bun@1.4.2`) | `bunx dotenvx run -f .env.docker -- docker compose …` inside the deploy recipe, `bun run env:decrypt` / `env:encrypt`, `bun install` |
| **git** | cloning the repo (also `just docker-update` → `git pull`) |
| **curl**, **ca-certificates**, **unzip** | the installers below (the Bun installer refuses to run without `unzip`) |
| **openssl** | generating the secrets for `.env.prod` / `.env.docker` (`DEPLOYMENT.md` [§3](DEPLOYMENT.md#3-fill-envprod)–[§4](DEPLOYMENT.md#4-fill-envdocker)) |
| **firewalld** | host firewall — Docker publishes 80/443 around it, everything else stays closed |

**Not needed on the server:** Node.js, Python, `uv`, Postgres, Redis — the three services and the datastores build and run inside Docker images. No host-level Tailscale is needed for the services: the admin surfaces join the tailnet through sidecar containers ([`DEPLOYMENT.md` → Tailscale admin access](DEPLOYMENT.md#tailscale-admin-access)).

### Assumptions

- A fresh **Fedora 42+** VPS with a sudo-capable, non-root login user.
- **DNS A records** for `APP_DOMAIN`, `DOZZLE_DOMAIN` and `UMAMI_DOMAIN` point at the server IP. Caddy issues certificates over HTTP-01 during the first deploy — missing records leave it in an ACME retry loop (watch it with `just docker-logs`).
- You are in the repo root for every step from §7 onward.

---

## 0. Create a sudo user

A fresh Fedora VPS drops you in as `root`. Create a non-root login user so every step below runs as that user instead:

```sh
useradd -m -G wheel deploy   # 'wheel' = Fedora's sudo group
passwd deploy
```

Then add your SSH public key (from your machine: `cat ~/.ssh/id_ed25519.pub`) as the new user, so you can log in without a password:

```sh
su - deploy                      # root can su without the user's password
mkdir -p ~/.ssh
echo 'PASTE_YOUR_PUBLIC_KEY_HERE' > ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

You're now `deploy` — confirm sudo works:

```sh
sudo -v   # no error = you're in the wheel group
```

Then disable password logins so only your key can get in. **First, in a *second* terminal, confirm `ssh deploy@<server-ip>` works with your key** — once password auth is off, a key that doesn't work locks you out:

```sh
sudo install -D -m 600 /dev/stdin /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF
sudo systemctl restart sshd
```

### Tailscale SSH — SSH over the tailnet

Tailscale SSH replaces password/key auth with your tailnet identity: you sign in with your Tailscale login and access is governed by the tailnet's access-control policy. Port 22 stays closed to the internet.

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo systemctl enable --now tailscaled
sudo tailscale up --ssh   # prints a login URL — open it, then confirm the node appears
```

**Verify before locking down** — from a *second* tailnet device, connect:

```sh
ssh deploy@<hostname>     # MagicDNS name, or: ssh deploy@<tailscale-ip>
```

Once that works, let the tailnet reach the host but close port 22 to the public internet:

```sh
sudo dnf install -y firewalld
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --zone=trusted --change-interface=tailscale0
sudo firewall-cmd --permanent --remove-service=ssh   # drop ssh from the default (public) zone
sudo firewall-cmd --reload
```

- Also remove port 22 from your **provider's firewall / security group** (the same one from §5) — it sits in front of the VPS.
- **Who may SSH** is set by the tailnet policy, not this host. To let other members in, edit **Access controls** in the Tailscale admin console and add an `ssh` rule. No tailnet identity = no SSH.
- This host-level Tailscale is **separate from the sidecar containers** that serve Dozzle/Umami ([`DEPLOYMENT.md` → Tailscale admin access](DEPLOYMENT.md#tailscale-admin-access)) — they use different node identities and coexist fine.

> ⚠️ Do not close port 22 until you have confirmed Tailscale SSH works from another device — otherwise you lock yourself out.

Run §1 onward as this user — `sudo` only where the commands show it.

## 1. Base packages

```sh
sudo dnf install -y git curl ca-certificates unzip openssl firewalld
sudo systemctl enable --now firewalld
```

## 2. Docker Engine + compose + buildx

Official Docker dnf repository:

```sh
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

One-liner alternative that installs the same packages from the same repo:

```sh
curl -fsSL https://get.docker.com | sudo sh
```

### Enable + permissions

```sh
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"    # then log out and back in — group membership is read at login
```

> ⚠️ The justfile recipes call `docker` **without** `sudo`. Without the group membership **and a fresh login**, `just docker-deploy` fails with `permission denied while trying to connect to the Docker daemon socket`.

Verify (in the new login shell):

```sh
docker version && docker compose version && docker buildx version
```

`docker compose version` proves the compose **plugin** is present — the standalone `docker-compose` v1 binary is not enough.

### lazydocker (optional)

A TUI for inspecting/controlling containers — handy instead of `docker ps` / `docker logs`:

```sh
curl -fsSL https://raw.githubusercontent.com/jesseduffield/lazydocker/master/scripts/install_update_linux.sh | bash
```

Run `lazydocker` — if it's `command not found`, it landed in `~/.local/bin`, so `source ~/.bashrc` or open a new shell.

## 3. just

```sh
sudo dnf install -y just
just --version
```

> ⚠️ **The justfile needs `just` ≥ 1.27** — it uses the `[group(...)]` recipe attribute. If `just --version` is below 1.27 or `dnf` reports no candidate, install the static binary instead (works on any distro, drops a single file into `/usr/local/bin`):

```sh
ver=$(curl -fsSL https://api.github.com/repos/casey/just/releases/latest | grep -oP '"tag_name": "\K[^"]+')
curl -fsSL "https://github.com/casey/just/releases/download/$ver/just-$ver-x86_64-unknown-linux-musl.tar.gz" -o /tmp/just.tgz
sudo tar -xzf /tmp/just.tgz -C /usr/local/bin just
just --version
```

Other options: `cargo install just`.

## 4. Bun

```sh
curl -fsSL https://bun.sh/install | bash
```

The installer appends `~/.bun/bin` to PATH in your shell rc — run `source ~/.bashrc` (or open a new shell) before continuing.

Verify: `bun --version` (expect `1.4.x`) and `bunx --version`.

## 5. Firewall + DNS

```sh
sudo firewall-cmd --permanent --add-service=http    # Caddy HTTP-01 challenge + redirect
sudo firewall-cmd --permanent --add-service=https   # HTTPS
sudo firewall-cmd --permanent --add-port=443/udp    # HTTP/3 — optional, safe to skip
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

- Check your **provider's firewall / security group** too — it sits in front of the VPS.
- Docker publishes container ports through its own iptables chains, so `firewalld` never blocks the stack's 80/443 — it still guards everything else. SSH is handled by Tailscale (§0), not the public zone.
- **Ports 80/443 must be free**: a stock image sometimes ships Apache/nginx — check with `sudo systemctl status httpd nginx`, then `sudo systemctl disable --now <service>` (or `sudo dnf remove` it).
- **DNS**: one A record per hostname → server IP. Caddy retries until they resolve, but deploying before DNS is set up leaves caddy looping (`just docker-logs`).

## 6. Swap (recommended on ≤ 2 GB RAM)

The backend and frontend images run `prisma generate` + `next build`, which can OOM a small VPS:

```sh
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

## 7. Clone + dependencies

```sh
git clone https://github.com/Zerodayu/Obelisk.git
cd Obelisk
bun install
```

`bun install` on the host only serves the root scripts: it puts `dotenvx` on the path for `just env-decrypt` / `just env-encrypt` and runs the `postinstall` runtime-env stub. Service dependencies install **inside** the images during the build.

## 8. Secrets + env files

Start from the maintainer's gitignored **`.env.keys`** — copy it into the repo root (a fork generates its own: [`FORKING.md`](FORKING.md)). Then:

```sh
# 1. decrypt for editing
just env-decrypt

# 2. fill in production values:
#      .env.prod   → DEPLOYMENT.md §3  (complete key set: BETTER_AUTH_SECRET,
#                    public URLs, Google OAuth, OBELISK_* — no fallbacks in the container)
#      .env.docker → DEPLOYMENT.md §4  (APP_DOMAIN, DOZZLE_DOMAIN, UMAMI_DOMAIN,
#                    TS_AUTHKEY, OBELISK_DB_PASSWORD, UMAMI_DB_PASSWORD, UMAMI_APP_SECRET)

# 3. re-encrypt before deploying (.env.keys stays gitignored)
just env-encrypt
```

> ⚠️ `TS_AUTHKEY` must be a **reusable** Tailscale auth key tagged `tag:obelisk` (both sidecars register with it) — create it in the Tailscale admin console → Settings → Keys. Wrong/empty key = the tailnet names for the log viewer and dashboard never resolve ([`DEPLOYMENT.md` → Tailscale admin access](DEPLOYMENT.md#tailscale-admin-access)).

## 9. Deploy

```sh
just docker-deploy
```

That runs `bunx dotenvx run -f .env.docker -- docker compose up -d --build`: three images build (backend / frontend / etl — first build takes a few minutes) and eleven services start with `.env.prod` values. Caddy requests its certificates during startup.

Verify:

```sh
just docker-logs    # caddy: certificate issued, no APP_DOMAIN guard, no restart loop
just db-status      # migration status of the fresh db volume
```

- `https://<APP_DOMAIN>` — frontend
- `https://<APP_DOMAIN>/api/v1` — backend
- `https://<DOZZLE_DOMAIN>` — log-viewer hostname (`403` by design — the viewer itself is served on the tailnet, see [`DEPLOYMENT.md` → Tailscale admin access](DEPLOYMENT.md#tailscale-admin-access))
- `https://<UMAMI_DOMAIN>/x.js` — tracker (`200` from anywhere; dashboard paths `403` and live on the tailnet)

Then apply the schema with `just docker-migrate` ([`DEPLOYMENT.md` §6](DEPLOYMENT.md#6-apply-the-database-schema)). **Never run `db:seed` against production.**

---

## Troubleshooting (setup only)

| Symptom | Fix |
| :--- | :--- |
| `permission denied while trying to connect … docker.sock` | not in the `docker` group yet — `sudo usermod -aG docker $USER`, then log **out and back in** (§2) |
| `docker: command not found` / `docker: 'compose' is not a docker command` | §2 incomplete — install `docker-ce` + `docker-compose-plugin` (dnf); confirm `docker compose version` |
| `error: Unknown attribute 'group'` from just | `just` < 1.27 — use the static-binary install in §3 |
| `just: command not found` | §3 — `dnf` has no candidate, use the static binary |
| `bun: command not found` / `bunx: command not found` | §4 — `~/.bun/bin` is not on PATH in this shell; `source ~/.bashrc` or start a new login session |
| `unzip is required to install bun` | §1 — `sudo dnf install unzip` |
| `[DECRYPTION_FAILED]` / dotenvx private-key error | `.env.keys` missing from the repo root or it doesn't match the committed encrypted env files — restore the right copy (§8) |
| `APP_DOMAIN not set - deploy via just docker-deploy` (caddy restart loop) | compose was started without the dotenvx wrap — run the recipe, not a bare `docker compose up` (§9) |
| Build killed / `out of memory` during `next build` | §6 — add swap; check available RAM with `free -h` |
| `bind: address already in use` on 80/443 | something on the host already binds them — §5 |
| Caddy stuck retrying ACME / no certificate | the A record is missing or wrong, or port 80 is blocked upstream — §5, watch `just docker-logs` |
| Disk filling up | old images and build cache accumulate — `docker image prune -f`, `docker system df` (see [`DEPLOYMENT.md` → Troubleshooting](DEPLOYMENT.md#troubleshooting)) |

---

## Next steps

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — architecture, rebuild rules, what the build does, umami setup, day-2 operations, full troubleshooting
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — local development (a dev stack can share this host's Docker, but not its ports)
- [`FORKING.md`](FORKING.md) — starting your own instance with fresh `.env.keys` and env values
