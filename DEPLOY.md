# Publicação do TelaViva

## 1. Banco

No SQL Editor do Supabase, execute na ordem:

1. `supabase/schema.sql` em projeto novo.
2. `supabase/002_production_security.sql`.

O segundo arquivo remove as permissões públicas do MVP. Dados antigos sem `workspace_id` deixam de aparecer; remova-os ou atribua-os manualmente a um workspace antes de definir a coluna como `not null`.

## 2. Supabase Auth

- Ative Email/Password e confirmação de e-mail.
- Defina Site URL como `https://SEU-DOMINIO`.
- Adicione `https://SEU-DOMINIO/**` nas Redirect URLs.
- Configure SMTP próprio e CAPTCHA.
- Ajuste rate limits no painel de Authentication.

## 3. Vercel

Instale a CLI e autentique:

```powershell
npm.cmd install --global vercel
vercel login
vercel
```

O projeto é estático; não informe segredo de banco. `vercel.json` configura rotas e headers de segurança.

## 4. Domínio e verificação

- Vincule o domínio na Vercel e aguarde HTTPS.
- Teste cadastro, confirmação, login e logout.
- Abra `/tv` em outro dispositivo, escaneie o QR, associe uma playlist e deixe reproduzir um ciclo completo.
- Confirme que um segundo usuário não enxerga dados do primeiro.
- Ative WAF, alertas e monitoramento antes de aceitar clientes.

