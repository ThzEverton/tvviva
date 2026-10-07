# TelaViva — Digital Signage

Plataforma de **digital signage** para publicar e gerenciar fotos e vídeos em TVs a partir de um painel web.

🔗 **Demo:** https://tvviva.vercel.app

## Visão geral

O TelaViva separa a operação em dois fluxos: um painel para gerenciamento do conteúdo e um player dedicado para exibição na TV. O projeto também inclui autenticação, persistência no Supabase, estrutura PWA e documentação de deploy e segurança.

## Destaques

- Painel web para gerenciamento de conteúdo.
- Player dedicado em `/tv` para reprodução em telas.
- Login e recuperação de senha.
- Integração com Supabase para dados e armazenamento.
- Service Worker + `manifest.webmanifest` para suporte PWA.
- Scripts SQL versionados para evolução do banco.
- Checklist de segurança em `SECURITY.md`.
- Guia de publicação em `DEPLOY.md`.

## Stack

- JavaScript
- HTML + CSS
- Supabase / PostgreSQL
- Node.js para desenvolvimento local
- Vercel

## Estrutura principal

```text
Painel Web
   │
   ├── autenticação
   ├── gerenciamento de mídia
   └── Supabase
          │
          └── Player TV (/tv)
```

## Executando localmente

```bash
npm install
npm run dev
```

- Painel: `http://localhost:3000`
- Login: `http://localhost:3000/login`
- Player: `http://localhost:3000/tv`

## Documentação

- [`DEPLOY.md`](./DEPLOY.md) — publicação do projeto.
- [`SECURITY.md`](./SECURITY.md) — checklist e decisões de segurança.
- [`supabase/`](./supabase) — schema e migrações SQL.
