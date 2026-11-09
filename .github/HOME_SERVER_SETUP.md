# Home server setup — spare PC to `just deploy-tunnel`

Running the production stack on a spare PC behind a residential line, published through a **Cloudflare Tunnel**. The connector dials out from the PC, so there is no port forwarding, no public IP, no DDNS and no inbound firewall rule. Cloudflare terminates public TLS at the edge; Caddy keeps routing, guards, headers and logs behind it.

Target: Fedora host, domain `mini-mal.tech` (registered at Hostinger, DNS hosted at Cloudflare). The public hostnames are the ones in `.env.docker`:

| Hostname | Role |
| :--- | :--- |
| `obelisk.mini-mal.tech` | the app (`APP_DOMAIN`) |
| `logs.mini-mal.tech` | Dozzle site block — always answers `403`, tunneled only so the host resolves |
| `stats.*` | umami (`UMAMI_DOMAIN`) — only relevant if it is a `mini-mal.tech` name, not a `*.ts.net` tailnet name |

> No VPS required. A VPS is still simpler if you have one — this guide exists because the server is a home machine.

This is the second of two deployment shapes in this repo:

| Shape | Ingress | Recipe | TLS |
| :--- | :--- | :--- | :--- |
| Direct (VPS or forwarded ports) | Caddy on host `80/443` | `just docker-deploy` | Let's Encrypt via ACME |
| Tunnel (this guide) | `cloudflared` → Caddy | `just deploy-tunnel` | Cloudflare edge; Caddy uses its internal CA |

Both are the same compose project, so never run `just docker-deploy` on a tunnel host — it recreates Caddy with the ACME config and republishes `80/443`.

---

## 0. Trade-offs to accept first

| Pro | Con |
| :--- | :--- |
| Works behind CGNAT and ISPs that block 80/443 | Cloudflare sits in front of every request; a Cloudflare or tunnel outage takes the site down |
| Nothing listens on the router; no DDNS | Free plan caps request bodies at **100 MB** — the ETL workbook uploads are the thing to watch |
| DNS is a proxied CNAME managed by the tunnel — no A record to keep in sync | The origin is only reachable through the tunnel, so LAN access to the public URL goes out to Cloudflare and back |
| Certificates never touch the host — no ACME rate limits | Caddy serves an internal cert behind the tunnel; do not bypass the tunnel and expect a valid cert |

If the 100 MB cap or the Cloudflare dependency is a dealbreaker, use the direct path described in [`DEPLOYMENT.md`](DEPLOYMENT.md) instead.

---

## 1. Fedora packages

Use Docker CE, **not** Fedora's Podman/compose: the stack mounts `docker.sock` (Dozzle) and relies on BuildKit secrets in the image build.

```sh
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
# dnf4 hosts: sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo

sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
  git just curl openssl policycoreutils-python-utils
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"      # log out and back in (or `newgrp docker`)

curl -fsSL https://bun.sh/install | bash    # dotenvx runs via bunx
```

`just` must be **≥ 1.27** (the justfile uses `[group(...)]`) — Fedora 41+ ships newer.

### SELinux — the step people forget

Fedora runs SELinux in `Enforcing` mode, and Docker bind mounts stay unlabeled. The stack bind-mounts `./Caddyfile`, `./Caddyfile.tunnel`, `./caddy/guards`, `./.env.prod`, `./.env.keys` and `./tailscale`; without a label the containers start but fail with `permission denied` reading those files.

Label the repo directory once (adjust the path — `/servers/obelisk` below):

```sh
getenforce                                  # Enforcing
sudo semanage fcontext -a -t container_file_t "/servers/obelisk(/.*)?"
sudo restorecon -Rv /servers/obelisk
ls -Zd /servers/obelisk                      # → ...:container_file_t:...
```

Re-run `restorecon` after moving the checkout. Named volumes (Postgres data, uploads) need nothing — Docker creates them already labeled.

### Firewall

Nothing needs to be opened: the tunnel is **outbound only** (TCP/UDP 7844 to Cloudflare), and the compose override publishes no host ports for Caddy. Leave firewalld at its default zone; do not add `http`/`https` services for this path.

Confirm the stack owns no public listener after the first deploy:

```sh
sudo ss -ltnup | grep -E ':(80|443)\b'       # expect no output
```

`httpd`/`nginx` from a stock install is the usual port-80 offender in the direct path — `sudo systemctl disable --now httpd` if you ever switch.

---

## 2. Cloudflare: zone and tunnel

The domain stays registered at Hostinger; only the zone moves to Cloudflare (free plan).

### 2.1 Move the nameservers

1. Cloudflare dashboard → **Domains** ([dash.cloudflare.com/?to=/:account/domains/overview](https://dash.cloudflare.com/?to=/:account/domains/overview)) → **Onboard a domain** (the old *Add a site* button) → apex `mini-mal.tech`. Cloudflare scans the current Hostinger records and shows two nameservers (yours will differ from the examples).
2. Check the imported records **before** switching: MX / SPF / DKIM / DMARC must match the Hostinger zone, or mail breaks at cutover.
3. Hostinger → Domains → `mini-mal.tech` → **Nameservers** → *Custom* → paste both Cloudflare nameservers.
4. Wait for the zone to show **Active** in Cloudflare (minutes to a few hours, 24 h worst case):

```sh
dig +short NS mini-mal.tech    # must answer with the Cloudflare pair
```

Keep the Hostinger zone untouched until the switch settles — it's the rollback.

### 2.2 Create the tunnel

Zero Trust → **Networks → Tunnels → Create a tunnel** → *Cloudflared* → name it (e.g. `obelisk-home`) → copy the connector token on the install page. That token is the whole credential; it goes into `.env.docker` in step 4, never into the repo in plaintext.

Then add one **public hostname** per site Caddy serves:

| Public hostname | Service | TLS setting |
| :--- | :--- | :--- |
| `obelisk.mini-mal.tech` | `https://caddy:443` | **No TLS Verify** |
| `logs.mini-mal.tech` | `https://caddy:443` | **No TLS Verify** |
| `stats.mini-mal.tech` (only if `UMAMI_DOMAIN` is this name) | `https://caddy:443` | **No TLS Verify** |

- `caddy` is the compose service name — the connector resolves it on the `edge` network, no host port involved.
- **No TLS Verify** is required because Caddy serves a certificate from its own internal CA (see `Caddyfile.tunnel`); Cloudflare terminates the browser-facing TLS with its own edge certificate.
- Cloudflare creates a **proxied** CNAME (`<uuid>.cfargotunnel.com`) for each hostname. Do not replace it with an A record and do not grey-cloud it — the tunnel only routes proxied records.
- A hostname that Caddy has no site block for answers `404` through the tunnel. Keep this table in sync with `APP_DOMAIN` / `DOZZLE_DOMAIN` / `UMAMI_DOMAIN`.
- A `*.ts.net` value in `UMAMI_DOMAIN` is a tailnet name: leave it out of the tunnel and reach the dashboard over Tailscale.

Optional but recommended in **SSL/TLS → Edge Certificates**: enable **Always Use HTTPS**.

Grey cloud is no longer part of this setup; if you later move to the direct path, the A records and Caddy's ACME config come back.

**DNSSEC**: enabling it in Cloudflare requires adding the DS record at the registrar (Hostinger). Disable it at Hostinger before ever moving DNS away again.

---

## 3. Router

Nothing to configure. No port forward, no DHCP reservation, no hairpin NAT concern — the connector is an outbound connection, so a changing LAN or public address does not matter.

Two things stay true:

- Do not forward `22`; admin access is the LAN or the Tailscale sidecars.
- The Tailscale sidecars still need outbound UDP 41641 (or DERP fallback) — that is already the default.

---

## 4. Clone, configure, deploy

`.env.keys` is gitignored — **copy it from the machine that encrypted the env files** (or you cannot decrypt them):

```sh
sudo mkdir -p /servers/obelisk && sudo chown "$USER" /servers/obelisk
git clone https://github.com/Zerodayu/Obelisk.git /servers/obelisk
cd /servers/obelisk

# copy .env.keys here first, then:
just env-decrypt
# edit .env.docker: APP_DOMAIN / DOZZLE_DOMAIN / UMAMI_DOMAIN / TUNNEL_TOKEN / DB passwords
# edit .env.prod: auth secrets, OAuth, ETL keys
just env-encrypt
```

`TUNNEL_TOKEN` is the connector token from step 2.2. Every other value is unchanged by the tunnel.

Apply the SELinux label to the real path before the first start (step 1).

```sh
just deploy-tunnel        # build + start all twelve services through the tunnel overlay
just db-status            # read-only: pending migrations?
just docker-migrate       # apply the schema on a fresh database
just db-check             # tables exist?
```

Never run `db:seed` against production — the seed refuses on its own, but don't use `OBELISK_SEED_ALLOW_PROD=1` on a live instance.

### Verify

```sh
# connector registered a connection to each Cloudflare edge?
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml logs --tail 50 cloudflared

# caddy is up with the tunnel config and serves the hostnames locally
docker compose exec caddy wget -qO- --no-check-certificate --header 'Host: obelisk.mini-mal.tech' https://localhost/ | head -c 200
```

From anywhere (the tunnel does not care about your network):

```sh
curl -I https://obelisk.mini-mal.tech      # 200/308, Cloudflare edge certificate
curl -I https://logs.mini-mal.tech         # 403 — guard by design
```

The Zero Trust tunnel page should show **Healthy**; certificate warnings only appear if you bypass the tunnel and hit the host directly, which is expected.

---

## 5. Running the local stack alongside prod

Local mode is a second Compose project (`obelisk-local`) on `127.0.0.1:8443`; it never starts `cloudflared`.

```sh
just deploy-local      # https://obelisk.mini-mal.localhost:8443
just local-migrate     # first local run only
just local-logs
just local-down        # stops only the local stack
```

Trust the local CA once (browser interstitial otherwise):

```sh
docker compose -p obelisk-local cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-local-root.crt
sudo trust anchor --store caddy-local-root.crt     # Firefox keeps its own store — Settings → Certificates
rm caddy-local-root.crt
```

Google sign-in from local mode needs `https://obelisk.mini-mal.localhost:8443/api/auth/callback/google` registered in the Google console — separate from the prod redirect URI.

---

## 6. Day-2 on a home host

| Task | Command / action |
| :--- | :--- |
| Survive a reboot | `sudo systemctl enable docker`; containers (including `cloudflared`) use `restart: unless-stopped`. Test once with `sudo reboot`. |
| Update the app | `just docker-update-tunnel` (pull → rebuild through the overlay → prune), then `just docker-migrate` if the schema changed |
| Reload Caddy config | `just docker-caddy-reload` — it picks `Caddyfile.tunnel` from `CADDYFILE` |
| Back up the database | `docker compose exec -T db pg_dump -U obelisk obelisk \| gzip > ~/backups/obelisk-$(date +%F).sql.gz` |
| Back up uploads | archive the `uploads` volume (Docker volume), store offsite |
| Back up secrets | `.env.keys` offline; `TUNNEL_TOKEN` can be re-issued from the dashboard, the DB passwords cannot be re-derived |
| Host updates | `sudo dnf -y install dnf-automatic` + `systemctl enable --now dnf-automatic.timer`, or a weekly manual `dnf upgrade` |
| Power loss | UPS if possible; Postgres survives a dirty stop, repeated ones do not |
| Rotate the tunnel token | Zero Trust → delete the connector on the tunnel → regenerate → `just env-decrypt`, update `TUNNEL_TOKEN`, `just env-encrypt`, `just deploy-tunnel` |
| Exposure check | `sudo ss -ltnup` — only loopback `5432`/`6379` from this stack; nothing on `80/443` |

---

## 7. Troubleshooting

| Symptom | Cause / fix |
| :--- | :--- |
| Cloudflare answers `502` / `1033` for a hostname | Connector down or origin wrong — `docker compose ... logs cloudflared`, and confirm the public hostname points at `https://caddy:443` with **No TLS Verify** on |
| Tunnel shows **Down** in Zero Trust | `TUNNEL_TOKEN` empty/wrong, or the container is crash-looping — `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml ps` |
| `404` through the tunnel, works with `curl --resolve` locally | Caddy has no site block for that hostname — add it to `.env.docker` and redeploy, or remove the tunnel hostname |
| `403` on `logs.` / `stats.` | By design — the dashboards are tailnet-only (see [`DEPLOYMENT.md`](DEPLOYMENT.md)) |
| Upload fails with `413` | Cloudflare's free-plan **100 MB** request-body cap — shrink or split the workbook |
| Browser warns about the certificate when hitting the host directly | Expected: Caddy uses its internal CA behind the tunnel. Use the tunnel URL, or the local stack on `:8443` |
| `permission denied` reading `.env.prod` / `Caddyfile` | SELinux label missing — step 1 `semanage fcontext` + `restorecon` |
| Public site broke after `just docker-deploy` | That recreates Caddy with the ACME config and republishes `80/443` — the tunnel host must use `just deploy-tunnel` |
| Containers not back after reboot | `systemctl is-enabled docker` |
| `dotenvx` cannot decrypt | `.env.keys` missing/mismatched for this checkout |
