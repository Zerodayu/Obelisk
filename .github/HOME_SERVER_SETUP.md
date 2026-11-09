# Home server setup — spare PC to `just docker-deploy`

Running the production stack on a spare PC behind a residential connection, with the domain still served from it. This is the **public-IP + port-forwarding** path: no tunnel, no reverse-proxy SaaS — Caddy keeps doing TLS exactly as described in [`DEPLOYMENT.md`](DEPLOYMENT.md).

Target: Fedora host, domain `mini-mal.tech` (registered at Hostinger, DNS hosted at Cloudflare), three public hostnames:

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

## 3. Cloudflare DNS

The domain stays registered at Hostinger; only the zone moves to Cloudflare (free plan). Registration, billing and the registrar remain at Hostinger.

### 3.1 Move the nameservers

1. Cloudflare → **Add a site** → `mini-mal.tech` (Free). Cloudflare scans the current Hostinger records and shows two nameservers (yours will differ from the examples).
2. Check the imported records **before** switching: MX / SPF / DKIM / DMARC must match the Hostinger zone, or mail breaks at cutover.
3. Hostinger → Domains → `mini-mal.tech` → **Nameservers** → *Custom* → paste both Cloudflare nameservers.
4. Wait for the zone to show **Active** in Cloudflare (minutes to a few hours, 24 h worst case):

```sh
dig +short NS mini-mal.tech    # must answer with the Cloudflare pair
```

Keep the Hostinger zone untouched until the switch settles — it's the rollback.

### 3.2 Records

The three app hostnames, all with **Proxy status: DNS only (grey cloud)**:

| Name | Type | Value | TTL |
| :--- | :--- | :--- | :--- |
| `obelisk` | `A` | your public IP (or DDNS-updated) | Auto / 300 |
| `logs` | `A` | same | Auto / 300 |
| `stats` | `A` | same | Auto / 300 |

The app only needs those three; leave `mini-mal.tech`/`www` alone unless you also host a site there, and remove any `*` wildcard that shadows them.

Grey cloud is deliberate, not an oversight:

- **Orange cloud breaks Caddy's HTTP-01** — Cloudflare answers the challenge, so Let's Encrypt issuance fails. It also caps request bodies at **100 MB** on the free plan (the ETL workbook uploads).
- It doesn't really hide the origin either — Certificate Transparency logs still list the hostnames.
- If you later want the proxy, that's a separate ingress change (Cloudflare Origin Certificate or DNS-01 with a custom Caddy build), not a DNS toggle.

Do **not** add AAAA records unless IPv6 is genuinely reachable — a stale AAAA breaks HTTP-01 validation when the IPv6 path is closed.

**DNSSEC**: enabling it in Cloudflare requires adding the DS record at the registrar (Hostinger). Disable it at Hostinger before ever moving DNS away again.

---

## 4. Dynamic DNS (only if the IP changes)

Static IP → skip this section, the A records in step 3 are final.

### Cloudflare + `ddclient`

1. Create a scoped API token: Cloudflare → **My Profile → API Tokens → Create Token → Edit zone DNS**. Permissions: **Zone → DNS → Edit**, Zone Resources: **Include → Specific zone → `mini-mal.tech`**. Nothing broader — this token lives on the host.
2. Install and configure:

```sh
sudo dnf -y install ddclient
sudo dnf -y install perl-IO-Socket-SSL perl-JSON      # ddclient's Cloudflare protocol
```

```conf
# /etc/ddclient/ddclient.conf  — chmod 600, it holds the token
daemon=300
syslog=yes
ssl=yes
protocol=cloudflare
zone=mini-mal.tech
ttl=60
login=token
password=<scoped-api-token>
obelisk.mini-mal.tech, logs.mini-mal.tech, stats.mini-mal.tech
```

```sh
sudo systemctl enable --now ddclient
journalctl -u ddclient -n 20 --no-pager      # "SUCCESS" per hostname
```

3. Set the three records from step 3 to `A`, value = current public IP, **grey cloud**, TTL 60–300. `ddclient` rewrites those A records in place when the lease changes — the names never change, so nothing else needs touching.

Sanity check after an IP change (or after forcing one):

```sh
dig +short A obelisk.mini-mal.tech
curl -4 -s ifconfig.me
```

### Alternatives

| Option | Notes |
| :--- | :--- |
| Router's built-in DDNS | Check the router admin page. Works with generic `dyndns2` providers; Cloudflare is not one of them. |
| `cloudflared` / API script via systemd timer | Same result as `ddclient` with more moving parts — only if `ddclient` can't be installed. |
| Manual updates | Edit the three A records when the site breaks; fine only for a sticky IP. |

Without DDNS on a dynamic line, the A records keep pointing at the old address and the site stays down until you notice. If the ISP hands out a *static* address there is nothing to automate.

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
dig +short NS mini-mal.tech                # must be the Cloudflare pair
dig +short A obelisk.mini-mal.tech         # must be the home IP
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
| Caddy loops on ACME, no certificate | A record missing/stale, **proxy status orange** instead of grey, or port 80 blocked upstream. `just docker-logs`, `dig +short A <host>` |
| Cloudflare shows the record proxied / cert fails right after a DNS edit | Proxy must be **DNS only** — HTTP-01 has to reach the host. Toggle grey, then restart Caddy (`docker compose restart caddy`) |
| DDNS stopped updating | `journalctl -u ddclient -n 50` — usual causes: token lacks `Zone.DNS:Edit`, wrong `zone=`, or `ddclient` missing the Cloudflare protocol package |
| `permission denied` reading `.env.prod` / `Caddyfile` | SELinux label missing — step 1 `semanage fcontext` + `restorecon` |
| `bind: address already in use` on 80/443 | another service owns the port — `sudo ss -ltnp '( sport = :80 or sport = :443 )'`, stop it |
| Worked for weeks, then site unreachable | dynamic IP changed and DDNS/DNS wasn't updated — `curl -4 ifconfig.me` vs `dig +short A obelisk.mini-mal.tech` |
| DNS correct, nothing answers from outside | port forward missing, or ISP blocks 80/443 (CGNAT/port filters) |
| Domain fails from the LAN only | hairpin NAT — test the domain from mobile data, use the local stack internally |
| Containers not back after reboot | `systemctl is-enabled docker` |
| `dotenvx` cannot decrypt | `.env.keys` missing/mismatched for this checkout |
| Public admin hostnames answer `403` | by design — Dozzle/umami dashboards are tailnet-only (see [`DEPLOYMENT.md`](DEPLOYMENT.md)) |
