# PRD — RunTune
**Versão:** 1.0  
**Data:** 2026-05-13  
**Status:** Rascunho

---

## 1. Visão Geral

RunTune é um aplicativo web mobile-first para corredores casuais que sugere álbuns musicais do Spotify compatíveis com a duração do treino do usuário. A proposta é simples: o usuário informa quanto vai correr e por quanto tempo, e o app devolve 3 sugestões de álbuns alinhadas ao seu gosto musical para ele ouvir durante a corrida.

---

## 2. Problema

Corredores frequentemente perdem tempo escolhendo o que ouvir antes de sair para correr. Playlists genéricas não têm começo, meio e fim — o álbum tem. Ouvir um álbum completo durante um treino cria uma experiência musical coesa e serve como marcador de tempo natural ("terminei o treino quando o álbum acabou").

---

## 3. Público-Alvo

- Corredores casuais (não atletas de alta performance)
- Usuários do Spotify
- Faixa etária: 20–40 anos
- Motivação: tornar o treino mais prazeroso, não necessariamente mais eficiente

---

## 4. Objetivos do Produto

- Reduzir a fricção na escolha musical antes de um treino
- Oferecer sugestões personalizadas sem configuração manual complexa
- Ser rápido de usar: do login à sugestão em menos de 1 minuto

---

## 5. Fora do Escopo (v1)

- Player de música integrado
- Suporte a Apple Music ou outras plataformas
- Sugestões baseadas em BPM / pace do corredor
- Sistema de likes/dislikes ou recomendações adaptativas
- Compartilhamento social
- Notificações push
- App nativo (iOS/Android)

---

## 6. Funcionalidades

### 6.1 Autenticação via Spotify
- Login com conta Spotify usando OAuth 2.0 (Authorization Code Flow)
- O app acessa: top artistas/gêneros do usuário, informações básicas do perfil
- Sessão mantida via token armazenado no backend (sem re-login a cada visita)

### 6.2 Detecção Automática de Gêneros
- Ao autenticar, o app consulta os top artistas do usuário no Spotify
- Extrai os gêneros musicais associados a esses artistas
- Usa os 3–5 gêneros mais frequentes como filtro de busca
- Nenhuma configuração manual necessária

### 6.3 Input do Treino
- Campo: distância em km (ex: 10)
- Campo: tempo total esperado (ex: 1h ou 55min)
- O app calcula internamente a duração em minutos
- Validação básica: valores obrigatórios, positivos, dentro de limites razoáveis (1–100km, 5min–6h)

### 6.4 Busca e Match de Álbuns
- O app consulta a API do Spotify buscando álbuns por gênero
- Para cada álbum candidato, soma a duração de todas as faixas
- Filtra álbuns com duração dentro de ±20% do tempo de treino
- Retorna exatamente 3 sugestões distintas

**Exemplo:** treino de 47 min → aceita álbuns entre 37 e 57 minutos

### 6.5 Exibição das Sugestões
Cada sugestão exibe:
- Capa do álbum
- Nome do álbum
- Nome do artista
- Duração total
- Botão "Ouvir no Spotify" → abre o álbum no app do Spotify

### 6.6 Histórico de Treinos
- Após o usuário clicar em "Ouvir no Spotify", o treino é salvo no histórico
- Armazenamento: `localStorage` (sem conta, sem backend)
- Cada entrada contém: data, distância, tempo, álbum escolhido (capa + nome + artista)
- Tela de histórico acessível pelo menu
- Sem limite de entradas por ora

---

## 7. UX e Design

### Princípios
- Mobile-first, responsivo para desktop
- Interface limpa e esportiva — referência visual: Strava
- Tom descontraído, sem jargão técnico
- Feedback visual imediato (loading, erro, sucesso)

### Telas
| Tela | Descrição |
|------|-----------|
| Login | Tela inicial com botão "Entrar com Spotify" |
| Input | Formulário com campos de distância e tempo |
| Sugestões | 3 cards de álbuns com botão de ação |
| Histórico | Lista de treinos anteriores com álbum associado |

### Paleta e Estilo
- Fundo escuro (dark mode como padrão)
- Verde como cor de destaque (referência ao Spotify e ao Strava)
- Tipografia sans-serif, peso médio/bold para dados
- Cards com cantos arredondados e sombra suave

---

## 8. Arquitetura Técnica

### Stack
| Camada | Tecnologia |
|--------|------------|
| Frontend | HTML, CSS, JavaScript (vanilla) |
| Backend | Node.js + Express |
| Autenticação | Spotify OAuth 2.0 (Authorization Code Flow) |
| Dados do usuário | Spotify Web API |
| Histórico | localStorage (client-side) |

### Por que backend?
O client secret do Spotify não pode ser exposto no navegador. O backend atua como proxy seguro para o fluxo OAuth e para chamadas à API do Spotify.

### Fluxo de Dados
```
Usuário → Frontend → Backend (Node/Express) → Spotify API
                ↑__________________________________|
```

1. Usuário clica em "Entrar com Spotify"
2. Backend redireciona para Spotify OAuth
3. Spotify retorna código de autorização ao backend
4. Backend troca o código por access token
5. Backend busca top gêneros do usuário
6. Frontend envia distância + tempo → Backend filtra álbuns → retorna 3 sugestões
7. Frontend salva treino no localStorage

---

## 9. Critérios de Aceitação (v1)

- [ ] Usuário consegue fazer login com Spotify sem erros
- [ ] App detecta gêneros automaticamente sem input manual
- [ ] Sugestões retornadas têm duração dentro de ±20% do tempo de treino
- [ ] Todos os 3 álbuns sugeridos pertencem aos gêneros do usuário
- [ ] Botão abre o álbum corretamente no app do Spotify
- [ ] Treino aparece no histórico após clicar em "Ouvir"
- [ ] App funciona corretamente em telas mobile (375px+)
- [ ] App funciona nos browsers: Chrome mobile, Safari iOS

---

## 10. Métricas de Sucesso (futuro)

- Tempo médio do login até a primeira sugestão (meta: < 10s)
- Taxa de clique em "Ouvir no Spotify" (meta: > 60%)
- Retorno do usuário (usa o app mais de uma vez)

---

## 11. Riscos e Limitações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| API do Spotify não filtra por duração | Alto | Calcular duração somando faixas (mais chamadas à API) |
| Usuário sem histórico no Spotify (conta nova) | Médio | Fallback para gêneros populares (rock, pop, eletrônico) |
| Rate limit da API do Spotify | Baixo | Cache de resultados por sessão |
| Token expirado durante uso | Médio | Refresh token automático no backend |

---

## 12. Próximos Passos

1. Configurar app no Spotify Developer Dashboard
2. Montar estrutura do projeto (Node backend + HTML frontend)
3. Implementar fluxo OAuth
4. Implementar busca e match de álbuns
5. Construir UI das 4 telas
6. Testes em mobile
