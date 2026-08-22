# Segurança do TelaViva

## Modelo aplicado

- Autenticação por e-mail e senha via Supabase Auth.
- Isolamento multiempresa por `workspace_id` e Row Level Security.
- Papéis `owner`, `admin`, `editor` e `viewer`.
- Escrita no Storage restrita à pasta UUID da empresa.
- Player autenticado por código e segredo aleatório local; o segredo não entra no QR Code.
- Rate limit transacional nos RPCs públicos de registro e sincronização.
- Rate limits nativos do Supabase Auth para login, cadastro e recuperação.
- CSP, HSTS, `nosniff`, bloqueio de iframe e Permissions Policy na Vercel.
- Saída de texto do usuário escapada antes de ser inserida no DOM.
- Bucket limitado a formatos de foto/vídeo e 500 MB por objeto.
- Cache offline isolado no navegador da TV e removido automaticamente ao desvincular o dispositivo.

## Antes do lançamento

1. Executar as migrations `002_production_security.sql`, `004_player_and_image_fit.sql` e `005_commercial_features.sql`.
2. Em Supabase Authentication, exigir confirmação de e-mail.
3. Configurar SMTP próprio; o SMTP padrão não é adequado a produção.
4. Ativar Cloudflare Turnstile ou hCaptcha em Authentication > Bot and Abuse Protection.
5. Revisar Authentication > Rate Limits e habilitar proteção contra senhas vazadas.
6. Configurar Site URL e Redirect URLs exclusivamente com o domínio final HTTPS.
7. Ativar regras gerenciadas do Vercel WAF e uma regra de rate limit para `/login` e `/tv`.
8. Configurar alertas de uso e backup/PITR conforme o plano contratado.
9. Criar Termos de Uso e Política de Privacidade revisados juridicamente.

## Segredos

A publishable key pode existir no navegador. Nunca coloque `service_role`, `sb_secret_*`, senha do banco ou token pessoal em `config.js`, Git ou arquivos públicos.

## Reporte

Antes do lançamento, substitua esta seção por um e-mail de segurança no seu domínio.
