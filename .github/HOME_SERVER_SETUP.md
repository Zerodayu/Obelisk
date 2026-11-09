# Home server setup — spare PC to `just docker-deploy`

Running the production stack on a spare PC behind a residential connection, with the domain still served from it. This is the **public-IP + port-forwarding** path: no tunnel, no reverse-proxy SaaS — Caddy keeps doing TLS exactly as described in [`DEPLOYMENT.md`](DEPLOYMENT.md).

Target: Fedora host, domain `mini-mal.tech` (DNS at Hostinger), three public hostnames:

| Hostname | Role |
| :--- | :--- |
| `obelisk.mini-mal.tech` | the app (`APP_DOMAIN`) |
| `logs.mini-mal.tech` | Dozzle site block — always answers `403`, cert only |
| `stats.mini-mal.tech` | umami site block — tracker public, dashboard `403` |

> No VPS required. A VPS is still the easier option if you have one — this guide exists because the server is a home machine with a dynamic address and Fedora's firewall/SELinux defaults.

---

## 0. Check before you start

Two things decide whether this path works at all.

### Public IP, not CGNAT

```sh
curl -4 -s ifconfig.me        # public address as the internet sees it
```

Compare it with the **WAN IP** on your router's status page. If they differ, you are behind carrier-grade NAT — no port forward can help. Use a Cloudflare Tunnel instead; nothing below applies.

### Ports 80 and 443 actually reachable

Many residential ISPs block inbound 80/443. Forward the ports (step 2), start a listener, then test **from mobile data**, not from your LAN:

```sh
# on the spare PC, temporarily — port 80 is privileged, hence sudo
sudo dnf -y install uv                    # system-wide, so root's PATH finds it
sudo uv run --no-project python -m http.server 80
# from the phone: http://<public-ip>/ → must return the directory listing
```

If that fails, the ISP blocks the port and this path is out. Let's Encrypt HTTP-01 needs 80; there is no way around it without a tunnel.

### Static or dynamic IP

Note `curl -4 -s ifconfig.me`, reboot the router, check again.

- **Same** → static/sticky. Use `A` records; skip step 4.
- **Different** → dynamic. You need DDNS (step 4) or the site dies whenever the lease changes.

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

Fedora runs SELinux in `Enforcing` mode, and Docker bind mounts stay unlabeled. The stack bind-mounts `./Caddyfile`, `./caddy/guards`, `./.env.prod`, `./.env.keys` and `./tailscale`; without a label the containers start but fail with `permission denied` reading those files.

Label the repo directory once (adjust the path — `/srv/obelisk` below):

```sh
getenforce                                  # Enforcing
sudo semanage fcontext -a -t container_file_t "/srv/obelisk(/.*)?"
sudo restorecon -Rv /srv/obelisk
ls -Zd /srv/obelisk                          # → ...:container_file_t:...
```

Re-run `restorecon` after moving the checkout. Named volumes (Postgres data, uploads) need nothing — Docker creates them already labeled.

### firewalld (Fedora's default; there is no `ufw` here)

```sh
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --permanent --add-port=443/udp     # optional, HTTP/3
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

Docker publishes container ports through its own iptables rules and bypasses firewalld, so 80/443 work even without these — the rules still matter for the rest of the host.

Check nothing else owns the ports:

```sh
sudo ss -ltnp '( sport = :80 or sport = :443 )'
```

`httpd`/`nginx` from a stock install is the usual offender — `sudo systemctl disable --now httpd`.

---

## 2. Router

- **DHCP reservation** (or a static LAN address) for the spare PC, so the forward never drifts.
- Forward `TCP 80` and `TCP 443` (plus `UDP 443` if you want HTTP/3) to that LAN address.
- **Do not forward 22.** Admin access stays on the LAN or your existing Tailscale sidecars.
- Hairpin NAT: from inside the LAN, `https://obelisk.mini-mal.tech` often fails because the router won't loop the public IP back. That's expected — test with the local stack (`just deploy-local`, `:8443`) and test the domain from mobile data.

---

## 3. Hostinger DNS

The zone is managed at Hostinger (`ns1`/`ns2.dns-parking.com`), so edit it under **Domains → DNS → mini-mal.tech**.

Current records (as of this writing) and what to do:

| Name | Current | Action |
| :--- | :--- | :--- |
| `obelisk` | `A 148.230.96.85` (Hostinger parking) | **replace** — it points at Hostinger, not your PC |
| `logs` | none | **add** — Caddy requests a cert for it |
| `stats` | none | **add** — same |
| `mini-mal.tech`, `www` | parking IP | leave alone unless you also host a site there |
| AAAA on the three subdomains | none | keep it that way |

The app only needs the three subdomains. No wildcard record is needed, and a `*` record should be removed if it shadows them.

**Static IP** — three A records:

| Name | Type | Value | TTL |
| :--- | :--- | :--- | :--- |
| `obelisk` | `A` | your public IP | 300 |
| `logs` | `A` | your public IP | 300 |
| `stats` | `A` | your public IP | 300 |

**Dynamic IP** — CNAMEs to a DDNS name (step 4). Delete the existing `obelisk` A record first; a name cannot hold both:

| Name | Type | Value | TTL |
| :--- | :--- | :--- | :--- |
| `obelisk` | `CNAME` | `yourname.duckdns.org` | 300 |
| `logs` | `CNAME` | `yourname.duckdns.org` | 300 |
| `stats` | `CNAME` | `yourname.duckdns.org` | 300 |

Keep TTL at 300 — it bounds how long a changed IP takes to propagate. Let's Encrypt follows the CNAME, so the certificate is still issued for `*.mini-mal.tech`; the DDNS name only supplies the address.

Do **not** add AAAA records. A stale IPv6 record breaks HTTP-01 validation when the IPv6 path is closed.

---

## 4. Dynamic DNS (only if the IP changes)

### DuckDNS + `ddclient` (simplest free option)

1. Create `yourname.duckdns.org` at [duckdns.org](https://www.duckdns.org) and note the token.
2. Install and configure:

```sh
sudo dnf -y install ddclient
```

```conf
# /etc/ddclient/ddclient.conf
daemon=300
syslog=yes
ssl=yes
protocol=duckdns
login=<token>
password=<token>
yourname.duckdns.org
```

```sh
sudo systemctl enable --now ddclient
journalctl -u ddclient -n 20 --no-pager
```

1. Point the three Hostinger CNAMEs at `yourname.duckdns.org` (step 3).

### Alternatives

| Option | Notes |
| :--- | :--- |
| Router's built-in DDNS | Check the router admin page; if it speaks `dyndns2`/No-IP, it can update a provider without a host daemon. |
| Cloudflare DNS + `ddclient` | Move the nameservers to Cloudflare, `protocol=cloudflare` with an API token, use `A` records directly. |
| Manual updates | Works, but you must notice the change; the site is down until you do. |

Hostinger's hPanel does not document a stable DNS-update API, so don't script the Hostinger records directly.

If the IP is static, skip this whole section.

---

## 5. Clone, configure, deploy

`.env.keys` is gitignored — **copy it from the machine that encrypted the env files** (or you cannot decrypt them):

```sh
sudo mkdir -p /srv/obelisk && sudo chown "$USER" /srv/obelisk
git clone https://github.com/Zerodayu/Obelisk.git /srv/obelisk
cd /srv/obelisk

# copy .env.keys here first, then:
just env-decrypt
# edit .env.docker (APP_DOMAIN / DOZZLE_DOMAIN / UMAMI_DOMAIN / TS_AUTHKEY / DB passwords)
# edit .env.prod (auth secrets, OAuth, ETL keys)
just env-encrypt
```

Apply the SELinux label to the real path before the first start (step 1).

```sh
just docker-deploy        # build + start all eleven services
just db-status            # read-only: pending migrations?
just docker-migrate       # apply the schema on a fresh database
just db-check             # tables exist?
```

Never run `db:seed` against production — the seed refuses on its own, but don't use `OBELISK_SEED_ALLOW_PROD=1` on a live instance.

### Verify

```sh
dig +short CNAME obelisk.mini-mal.tech     # dynamic IP setup
dig +short A obelisk.mini-mal.tech         # resolves to the home IP
dig +short A logs.mini-mal.tech stats.mini-mal.tech
```

From **mobile data** (not the LAN):

```sh
curl -I https://obelisk.mini-mal.tech      # valid Let's Encrypt cert, 200/308
curl -I https://stats.mini-mal.tech/script.js   # 200 — tracker path
```

First boot: watch `just docker-logs` for Caddy's ACME lines. Certificates live in the `caddy-data` volume and survive redeploys — recreating Caddy does not re-issue them.

---

## 6. Running the local stack alongside prod

The separation added in this release is what makes that possible on one machine. Local mode is a second Compose project (`obelisk-local`) on `127.0.0.1:8443`; prod keeps `80/443`.

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

## 7. Day-2 on a home host

| Task | Command / action |
| :--- | :--- |
| Survive a reboot | `sudo systemctl enable docker`; containers use `restart: unless-stopped`. Test once with `sudo reboot`. |
| Update the app | `just docker-update` (pull → rebuild → prune), then `just docker-migrate` if the schema changed |
| Back up the database | `docker compose exec -T db pg_dump -U obelisk obelisk \| gzip > ~/backups/obelisk-$(date +%F).sql.gz` |
| Back up uploads | archive the `uploads` volume (Docker volume), store offsite |
| Back up secrets | keep `.env.keys` somewhere safe and offline — losing it makes the committed env files unreadable |
| Host updates | `sudo dnf -y install dnf-automatic` + `systemctl enable --now dnf-automatic.timer`, or a weekly manual `dnf upgrade` |
| Power loss | UPS if possible; Postgres survives a dirty stop, repeated ones do not |
| ISP terms | residential lines often forbid running public servers — check your contract |
| Exposure check | `sudo ss -ltnup` — only Caddy should listen on 80/443; `5432`/`6379` stay loopback; SSH not forwarded |

---

## 8. Troubleshooting

| Symptom | Cause / fix |
| :--- | :--- |
| Caddy loops on ACME, no certificate | A/CNAME missing or stale, or port 80 blocked upstream. `just docker-logs`, `dig +short A <host>` |
| `permission denied` reading `.env.prod` / `Caddyfile` | SELinux label missing — step 1 `semanage fcontext` + `restorecon` |
| `bind: address already in use` on 80/443 | another service owns the port — `sudo ss -ltnp '( sport = :80 or sport = :443 )'`, stop it |
| Worked for weeks, then site unreachable | dynamic IP changed and DDNS/DNS wasn't updated — `curl -4 ifconfig.me` vs `dig +short A obelisk.mini-mal.tech` |
| DNS correct, nothing answers from outside | port forward missing, or ISP blocks 80/443 (CGNAT/port filters) |
| Domain fails from the LAN only | hairpin NAT — test the domain from mobile data, use the local stack internally |
| Containers not back after reboot | `systemctl is-enabled docker` |
| `dotenvx` cannot decrypt | `.env.keys` missing/mismatched for this checkout |
| Public admin hostnames answer `403` | by design — Dozzle/umami dashboards are tailnet-only (see [`DEPLOYMENT.md`](DEPLOYMENT.md)) |
