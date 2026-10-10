# Projeto: R$300 → R$600 em 30 dias (operação autônoma por IA)

Documento-base do investidor (10/10/2026). As decisões de implementação estão no fim.

## 1. O acordo

- O investidor disponibilizou R$300 de capital. Meta: R$600 em caixa até 10/11/2026.
- A IA opera o negócio. O investidor não quer participar da operação. O papel dele se limita a:
  1. Receber pagamentos na própria chave Pix ou emitir boletos.
  2. Marcar no painel quando um pagamento caiu.
  3. Liberar gastos quando a IA pedir (todo gasto é um pedido explícito ao investidor).
  4. Na fase de validação, aprovar mensagens antes do envio.
- Contrato de fracasso: perder o dinheiro é um resultado aceito. Isso não autoriza descuido: o capital só é
  gasto depois que a oferta for validada.

## 2. Por que este modelo

- Investir (CDI ~1% a.m.) não dobra o capital. Apostas, day trade e cripto foram descartados: resultado
  esperado negativo.
- Freelance genérico com IA (tradução, texto, revisão) foi descartado: mercado saturado, briga por preço.
- Tese: produção ficou barata para todo mundo; o escasso é distribuição e confiança. Foco em quem não procura
  freelancer e não usaria IA sozinho: pequenos negócios locais do Rio de Janeiro.
- Diferencial: chegar com o trabalho já feito para aquele negócio específico.

## 3. A oferta

Pacote fechado de R$100 a R$150, para padarias, salões, oficinas, lanchonetes, pet shops etc.:

- Perfil do Google (Google Business Profile) revisado: descrição nova, categorias, horário correto, sugestões de fotos.
- Respostas redigidas para as avaliações sem resposta.
- Cardápio ou catálogo digital simples com link direto para o WhatsApp do negócio.
- Mensagens automáticas do WhatsApp Business (saudação, ausência, respostas rápidas).

Entrega: arquivos prontos + passo a passo para o dono aplicar (a IA não tem acesso às contas dos clientes).

Conta da meta: 4 a 6 vendas = R$600. Volume planejado: ~100 abordagens no mês (~25/semana).
Taxa de fechamento esperada: 3 a 5%.

## 4. Critérios para encontrar clientes

Buscar no Google Maps/Places por bairro + categoria. Priorizar negócios com avaliações sem resposta do dono,
poucas fotos ou fotos ruins, sem site ou sem cardápio online, nota boa (≥ 4,0) e algum volume de avaliações,
e e-mail ou contato público disponível. Evitar redes e franquias.

## 5. Pipeline

```
encontrado → amostra_pronta → aguardando_aprovacao → abordado → respondeu → negociando → pago → entregue
                                                         ↘ sem_resposta (após follow-up) / recusou
```

## 6. Regras de operação (não negociáveis)

- **Portão de aprovação**: na primeira semana (ou até ~20 abordagens aprovadas), nenhuma mensagem sai sem
  aprovação do investidor. Os e-mails vão em nome dele.
- **Limite de envio**: no máximo ~25 e-mails novos por dia.
- **Sem spam**: toda abordagem é personalizada, com a amostra real. Uma abordagem + no máximo um follow-up.
  Quem pedir para não ser contatado nunca mais é contatado.
- **LGPD**: só dados públicos de contato comercial; nada de dados pessoais desnecessários; opção de não
  receber mais mensagens.
- **Honestidade**: não fingir ser uma pessoa se perguntado diretamente; não prometer resultados.
- **Gastos**: nenhum gasto antes da primeira venda. Depois dela, primeiro pedido previsto: ~R$100 em
  anúncio local no Instagram, mirando o bairro/nicho que mais converteu.

## 7. Critérios de ajuste

- Se as primeiras ~100 abordagens tiverem resposta zero: mudar oferta, preço, nicho ou bairro.
- Acompanhar por nicho e bairro: taxa de resposta, taxa de fechamento, ticket médio.
- Revisão semanal no painel com o que mudar na semana seguinte.

---

## Decisões de implementação

| Tema | Decisão | Por quê |
|---|---|---|
| Painel | Next.js na Vercel (plano grátis) | Pedido do investidor; acessível do celular. |
| Banco | Postgres grátis no Neon, projeto `dashboardmaps` em São Paulo; funções da Vercel também em São Paulo (`gru1`) | Persistente; o container do agente é descartável. Mesma região = consultas rápidas. |
| Usuários | Um só, por senha (`PANEL_PASSWORD`) | Só o investidor usa o painel. |
| Agente → painel | API `/api/agent/*` com token (`AGENT_TOKEN`) | O agente só precisa da URL e do token; credenciais ficam na Vercel. |
| Regras | Aplicadas no servidor, não só no prompt | O agente não consegue violar as regras mesmo se errar. |
| E-mail | Gmail com senha de app (SMTP/IMAP), rodando na Vercel | Grátis; envios em nome do investidor. |
| Amostra | Página pública por token (`/a/<token>`), link no e-mail | E-mail frio sem anexo entrega melhor e abre bem no celular. |
| Descadastro | Rodapé automático + `List-Unsubscribe` + página `/sair/<token>` | LGPD e reputação do remetente. |
| Busca | Google Places API (New), Text Search | 1.000 chamadas grátis/mês no SKU com avaliações; volume previsto ~100–200. |
| Agendamento | Rotinas do Claude Code (nuvem), 2–3 por dia | Sem servidor nem cron próprios. |
| Status extra | `descartado` | Lead encontrado que não serve (franquia, sem contato etc.). |

Limitações conhecidas:
- A API do Google **não informa se o dono respondeu às avaliações**. O agente não pode afirmar
  “X avaliações sem resposta” sem verificar por outro meio.
- A API devolve no máximo 5 avaliações e 10 referências de fotos por lugar.
- O Google exige conta de faturamento (cartão) para ativar a Places API, mesmo dentro da cota grátis.
