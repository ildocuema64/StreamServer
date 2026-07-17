# Icecast público — StreamServer

Guia para alojar o Icecast numa VM/VPS e ligá-lo ao backend (Render) e ao frontend (Vercel).

## Porquê uma VM (e não o Render)
O Icecast precisa de estar **sempre ligado** e de aceitar ligações de **fonte (BUTT)** numa **porta TCP** (8000). Um web service do Render só expõe uma porta HTTPS e, no plano free, adormece — inadequado para rádio 24/7.

## Arquitetura
```
BUTT (DJ) --TCP 8000--> Icecast (VM) --valida password--> Backend (Render) --> Postgres
Ouvinte (browser) --HTTPS--> Vercel --rewrite /stream--> Backend (Render) --HTTP 8000--> Icecast
```
- O BUTT liga **diretamente** ao Icecast (host:8000, HTTP).
- O ouvinte chega via proxy `/stream` do backend (HTTPS), por isso o Icecast pode ficar em HTTP simples.
- A autenticação de fontes é feita por *callback* do Icecast ao backend (`/api/internal/icecast/auth`), validando a `source_password` de cada estação na base de dados.

## Ficheiros
- `icecast.prod.xml` — configuração de produção (mounts dinâmicos por estação + auth por URL para o backend público).
- `docker-compose.vm.yml` — sobe só o Icecast na VM (AutoDJ/Liquidsoap opcional, comentado).

## Passos

0. **Script rápido (na VM, com Docker instalado)** — a partir do clone do repo ou copiando os ficheiros:
   ```bash
   chmod +x scripts/setup-icecast-vm.sh
   ./scripts/setup-icecast-vm.sh SEU_HOST_PUBLICO https://streamserver-ivu7.onrender.com
   ```
   Gera passwords, arranca o container e imprime as variáveis para colar no Render.

1. **Criar VM** (ex.: Oracle Cloud Always Free, Hetzner, Contabo, DigitalOcean). Instalar Docker. Abrir firewall TCP **22** e **8000**.

2. **Copiar** `icecast.prod.xml` e `docker-compose.vm.yml` para a VM.

3. **Editar `icecast.prod.xml`** (procura por `CHANGE_ME`):
   - `<hostname>` → host público da VM (IP ou subdomínio).
   - `source-password`, `relay-password`, `admin-password` → valores fortes.
   - O `stream_auth` já aponta para `https://streamserver-ivu7.onrender.com/api/internal/icecast/auth` (ajusta se o backend mudar de URL).

4. **Arrancar**:
   ```bash
   docker compose -f docker-compose.vm.yml up -d
   docker compose -f docker-compose.vm.yml logs -f icecast
   ```

5. **Testar** (do teu PC):
   ```bash
   curl http://SEU_HOST_PUBLICO:8000/status-json.xsl
   ```

6. **Render → Environment**:
   ```
   ICECAST_DISABLED=false
   ICECAST_HOST=SEU_HOST_PUBLICO
   PUBLIC_ICECAST_HOST=SEU_HOST_PUBLICO
   ICECAST_PORT=8000
   ICECAST_ADMIN_USER=admin
   ICECAST_ADMIN_PASSWORD=<igual ao admin-password do xml>
   ```
   **Não** definas `INTERNAL_API_KEY` — o `verifyInternal` rejeita o callback de auth em produção se a chave não bater, e o Icecast não envia esse header. Deixá-la por definir permite o callback.

7. **Vercel → Environment Variables** (se ainda não estiver):
   ```
   VITE_BACKEND_URL=https://streamserver-ivu7.onrender.com
   ```
   Depois **Redeploy** (corrige o 502 e as rewrites `/api`, `/ws`, `/stream`).

## Validação
- `https://streamserver-ivu7.onrender.com/api/health` → `icecast: "ok"`.
- Modal da estação → `Servidor: SEU_HOST_PUBLICO`, `Porta: 8000`.
- BUTT liga com `source` + a `source_password` da estação → fonte conecta.
- Ouvir online: `https://stream-server-rouge.vercel.app/stream/<slug>/live`.

## Notas
- O Icecast pode ficar em HTTP:8000; o ouvinte só vê HTTPS (via proxy do backend).
- AutoDJ (Liquidsoap) é opcional — descomenta o serviço em `docker-compose.vm.yml` e usa a mesma `source-password`.
- TLS direto no Icecast só é necessário se quiseres servir `listen_url_direct` por HTTPS sem passar pelo backend.
