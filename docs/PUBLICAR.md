# Publicar no GitHub e apresentar no LinkedIn

## Repositório

Nome sugerido: `privacy-platform-portfolio`.

Descrição sugerida: “Versão anonimizada do nosso primeiro projeto: plataforma de privacidade e governança com Next.js, React, SQLite, avaliações e áreas autenticadas.”

Tópicos sugeridos: `nextjs`, `react`, `javascript`, `sqlite`, `portfolio`, `web-development`.

Abra o terminal **nesta pasta de portfólio**. Não use o repositório nem o histórico do projeto original.

```bash
npm run portfolio:verificar
git init
git add .
git diff --cached --stat
git diff --cached
```

Revise o conteúdo selecionado e escolha uma licença caso queira conceder permissões de reutilização. A pasta começa sem histórico Git. O `.gitignore` exclui dados e arquivos de execução, mas a revisão do primeiro commit continua sendo útil.

```bash
git commit -m "Apresenta versão anonimizada do primeiro projeto"
git branch -M main
```

Crie um repositório vazio no GitHub e use a URL fornecida por ele:

```bash
git remote add origin URL_DO_SEU_REPOSITORIO
git push -u origin main
```

O placeholder acima precisa ser substituído pelo endereço real. A criação remota e o envio não foram executados automaticamente.

## Demonstração e capturas

Rode a aplicação localmente e use exclusivamente dados fictícios. Capture a página inicial em desktop e celular e, se quiser mostrar os fluxos, gere uma avaliação demonstrativa para capturar seu relatório. Não inclua o terminal com configurações nem a caixa de e-mails local.

Arquivos já preparados para a apresentação:

- [Capa para LinkedIn, 1200 × 630](images/linkedin-cover.png).
- [Página inicial em desktop](images/home-desktop.png).
- [Página inicial em celular](images/home-mobile.png).

Para refazer as imagens com o servidor local aberto, execute `node scripts/capture-portfolio.mjs`. O endereço padrão é `http://127.0.0.1:3000`; a variável `PORTFOLIO_CAPTURE_URL` permite alterar a porta. As imagens foram geradas diretamente da interface e de uma composição HTML, sem dados de usuários.

Se hospedar esta versão, utilize uma infraestrutura compatível com Node.js 24 e armazenamento persistente. O repositório sozinho não publica a aplicação e o GitHub Pages não executa esse backend.

## LinkedIn

O arquivo [LINKEDIN.md](LINKEDIN.md) inclui uma versão detalhada e uma curta. Adicione o link real do repositório, revise as imagens e publique o texto que representa melhor sua voz. A mensagem distingue a conquista inicial da segunda etapa que aguarda aprovação.
