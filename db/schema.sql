-- Schema idempotente: pode rodar várias vezes (scripts/migrate.mjs roda a cada deploy).

create table if not exists config (
  chave text primary key,
  valor jsonb not null
);

create table if not exists leads (
  id              serial primary key,
  place_id        text unique,
  nome            text not null,
  bairro          text,
  categoria       text,
  maps_url        text,
  endereco        text,
  email           text,
  telefone        text,
  instagram       text,
  site            text,
  nota            numeric(2,1),
  num_avaliacoes  integer,
  diagnostico     text,
  amostra         text,            -- markdown, publicado em /a/<token>
  entrega         text,            -- markdown, publicado em /e/<token>
  token           text unique not null default replace(gen_random_uuid()::text, '-', ''),
  status          text not null default 'encontrado' check (status in (
                    'encontrado','amostra_pronta','aguardando_aprovacao','abordado',
                    'respondeu','negociando','pago','entregue',
                    'sem_resposta','recusou','descartado')),
  valor           numeric(10,2),
  pago            boolean not null default false,
  pago_em         timestamptz,
  nao_contatar    boolean not null default false,
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists leads_status_idx on leads (status);
create index if not exists leads_email_idx on leads (lower(email));

create table if not exists transicoes (
  id        serial primary key,
  lead_id   integer not null references leads(id) on delete cascade,
  de        text,
  para      text not null,
  por       text not null,           -- 'agente' | 'investidor' | 'sistema'
  motivo    text,
  em        timestamptz not null default now()
);
create index if not exists transicoes_lead_idx on transicoes (lead_id);

create table if not exists mensagens (
  id               serial primary key,
  lead_id          integer not null references leads(id) on delete cascade,
  direcao          text not null check (direcao in ('saida','entrada')),
  tipo             text not null check (tipo in ('abordagem','follow_up','resposta','entrega','recebida')),
  canal            text not null default 'email' check (canal in ('email','manual')),
  assunto          text,
  corpo            text not null,
  status           text not null check (status in (
                     'aguardando_aprovacao','aprovada','rejeitada','enviada','erro','recebida')),
  motivo           text,             -- motivo de rejeição ou erro
  message_id       text,
  in_reply_to      text,
  de               text,
  para             text,
  criado_em        timestamptz not null default now(),
  aprovada_em      timestamptz,
  enviada_em       timestamptz,
  recebida_em      timestamptz
);
create index if not exists mensagens_lead_idx on mensagens (lead_id);
create index if not exists mensagens_status_idx on mensagens (status);
create unique index if not exists mensagens_message_id_idx on mensagens (message_id) where message_id is not null;

-- Lista permanente de quem pediu para não ser contatado (sobrevive mesmo se o lead for apagado).
create table if not exists nao_contatar (
  id        serial primary key,
  email     text,
  telefone  text,
  place_id  text,
  motivo    text,
  em        timestamptz not null default now()
);

create table if not exists gastos (
  id            serial primary key,
  descricao     text not null,
  valor         numeric(10,2) not null check (valor > 0),
  justificativa text not null,
  status        text not null default 'pendente' check (status in ('pendente','aprovado','negado')),
  pedido_em     timestamptz not null default now(),
  decidido_em   timestamptz
);

create table if not exists caixa (
  id         serial primary key,
  tipo       text not null check (tipo in ('capital','gasto','receita')),
  valor      numeric(10,2) not null check (valor > 0),
  descricao  text not null,
  lead_id    integer references leads(id) on delete set null,
  gasto_id   integer references gastos(id) on delete set null,
  em         timestamptz not null default now()
);

create table if not exists revisoes (
  id      serial primary key,
  semana  date not null,
  texto   text not null,
  em      timestamptz not null default now()
);

create table if not exists rodadas (
  id      serial primary key,
  resumo  text not null,
  em      timestamptz not null default now()
);

insert into config (chave, valor) values
  ('gate_ativo',      'true'),
  ('limite_diario',   '25'),
  ('capital_inicial', '300'),
  ('meta',            '600'),
  ('prazo',           '"2026-11-10"'),
  ('inicio',          '"2026-10-10"')
on conflict (chave) do nothing;

-- Reparo: versões anteriores gravavam config serializada duas vezes (ex.: "\"Lucas\"", "false").
-- Só mexe em valores que são claramente JSON dentro de uma string; é seguro rodar sempre.
update config set valor = (valor #>> '{}')::jsonb
where jsonb_typeof(valor) = 'string' and (
     (chave in ('pix', 'assinatura') and (valor #>> '{}') ~ '^(".*"|null)$')
  or (chave = 'gate_ativo' and (valor #>> '{}') in ('true', 'false'))
  or (chave = 'limite_diario' and (valor #>> '{}') ~ '^[0-9]+$')
  or (chave = 'imap_estado' and (valor #>> '{}') ~ '^\{.*\}$'));

insert into caixa (tipo, valor, descricao)
select 'capital', 300, 'Capital inicial do investidor'
where not exists (select 1 from caixa where tipo = 'capital');
