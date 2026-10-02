# VPS setup — bare server to `just docker-deploy`

A copy-paste walkthrough of the **one-time server setup**: from a fresh VPS to the first `just docker-deploy`. What each env key means, what the build does, and day-2 operations live in [`DEPLOYMENT.md`](DEPLOYMENT.md) — every step below links to the matching section instead of repeating it.

Every install step gives two paths side by side: **Debian / Ubuntu** (`apt`) and **Arch Linux** (`pacman`). Commands run as your sudo user, not root.

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
| **ufw** (optional) | host firewall — Docker publishes 80/443 around it, everything else stays closed |

**Not needed on the server:** Node.js, Python, `uv`, Postgres, Redis — the three services and the datastores build and run inside Docker images.

### Assumptions

- A fresh **Debian 12+ / Ubuntu 24.04+** or **Arch Linux** VPS with a sudo-capable, non-root login user.
- **DNS A records** for `APP_DOMAIN`, `DOZZLE_DOMAIN` and `UMAMI_DOMAIN` point at the server IP. Caddy issues certificates over HTTP-01 during the first deploy — missing records leave it in an ACME retry loop (watch it with `just docker-logs`).
- You are in the repo root for every step from §7 onward.

---

## 1. Base packages

```sh
# Debian / Ubuntu
sudo apt update
sudo apt install -y git curl ca-certificates unzip openssl ufw
```

```sh
# Arch Linux
sudo pacman -S --needed git curl ca-certificates unzip openssl
```

## 2. Docker Engine + compose + buildx

### Debian / Ubuntu

Official Docker apt repository:

```sh
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL "https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg" \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

One-liner alternative that installs the same packages from the same repo:

```sh
curl -fsSL https://get.docker.com | sudo sh
```

### Arch Linux

```sh
sudo pacman -S --needed docker docker-compose docker-buildx
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

## 3. just

```sh
# Arch Linux — extra repo ships a current release (1.58.x)
sudo pacman -S --needed just
```

```sh
# Debian / Ubuntu
sudo apt install -y just
just --version
```

> ⚠️ **The justfile needs `just` ≥ 1.27** — it uses the `[group(...)]` recipe attribute. Ubuntu 24.04 (noble) ships **1.21.0**, which fails immediately with `error: Unknown attribute 'group'`. If `apt` reports no candidate or `just --version` is below 1.27, install the static binary instead (works on any distro, drops a single file into `/usr/local/bin`):

```sh
ver=$(curl -fsSL https://api.github.com/repos/casey/just/releases/latest | grep -oP '"tag_name": "\K[^"]+')
curl -fsSL "https://github.com/casey/just/releases/download/$ver/just-$ver-x86_64-unknown-linux-musl.tar.gz" -o /tmp/just.tgz
sudo tar -xzf /tmp/just.tgz -C /usr/local/bin just
just --version
```

Other options: `sudo snap install just`, `cargo install just`.

## 4. Bun

```sh
# Debian / Ubuntu (any distro may use the official installer)
curl -fsSL https://bun.sh/install | bash
```

```sh
# Arch Linux — extra ships exactly 1.4.2, the repo's pinned packageManager
sudo pacman -S --needed bun
```

The installer appends `~/.bun/bin` to PATH in your shell rc — run `source ~/.bashrc` (or open a new shell) before continuing.

Verify: `bun --version` (expect `1.4.x`) and `bunx --version`.

## 5. Firewall + DNS

```sh
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp      # Caddy HTTP-01 challenge + redirect
sudo ufw allow 443/tcp     # HTTPS
sudo ufw allow 443/udp     # HTTP/3 — optional, safe to skip
sudo ufw enable && sudo ufw status
```

- Check your **provider's firewall / security group** too — it sits in front of the VPS.
- Docker publishes container ports through its own iptables chains, so `ufw` never blocks the stack's 80/443 — it still guards everything else (SSH included). Both layers are worth keeping configured.
- **Ports 80/443 must be free**: a stock image sometimes ships Apache/nginx — check with `sudo systemctl status apache2 nginx`, then `sudo systemctl disable --now <service>` (or `sudo apt remove` / `sudo pacman -R` it).
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
#                    ADMIN_IPS, OBELISK_DB_PASSWORD, UMAMI_DB_PASSWORD, UMAMI_APP_SECRET)

# 3. re-encrypt before deploying (.env.keys stays gitignored)
just env-encrypt
```

> ⚠️ `ADMIN_IPS` must be the address **Caddy sees on the connection** — your public egress IP (`curl ifconfig.me`), not a LAN IP. Wrong value = `403` on the log viewer and umami dashboard.

## 9. Deploy

```sh
just docker-deploy
```

That runs `bunx dotenvx run -f .env.docker -- docker compose up -d --build`: three images build (backend / frontend / etl — first build takes a few minutes) and nine services start with `.env.prod` values. Caddy requests its certificates during startup.

Verify:

```sh
just docker-logs    # caddy: certificate issued, no APP_DOMAIN guard, no restart loop
just db-status      # migration status of the fresh db volume
```

- `https://<APP_DOMAIN>` — frontend
- `https://<APP_DOMAIN>/api/v1` — backend
- `https://<DOZZLE_DOMAIN>` — log viewer (`403` unless your IP is in `ADMIN_IPS`)

Then apply the schema with `just docker-migrate` ([`DEPLOYMENT.md` §6](DEPLOYMENT.md#6-apply-the-database-schema)). **Never run `db:seed` against production.**

---

## Troubleshooting (setup only)

| Symptom | Fix |
| :--- | :--- |
| `permission denied while trying to connect … docker.sock` | not in the `docker` group yet — `sudo usermod -aG docker $USER`, then log **out and back in** (§2) |
| `docker: command not found` / `docker: 'compose' is not a docker command` | §2 incomplete — install `docker-ce` + `docker-compose-plugin` (apt) or `docker` + `docker-compose` (pacman); confirm `docker compose version` |
| `error: Unknown attribute 'group'` from just | `just` < 1.27 (Ubuntu 24.04 ships 1.21) — use the static-binary install in §3 |
| `just: command not found` | §3 — `apt` has no candidate on older releases, use the static binary |
| `bun: command not found` / `bunx: command not found` | §4 — `~/.bun/bin` is not on PATH in this shell; `source ~/.bashrc` or start a new login session |
| `unzip is required to install bun` | §1 — `sudo apt install unzip` / `sudo pacman -S unzip` |
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
