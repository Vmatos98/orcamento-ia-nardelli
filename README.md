# Nardelli Usinagem — Orçamento & Chatbot (com Registro de Conversas)
### Arquitetura Enxuta: Tema fiel ao modelo.html + IA OpenRouter (JEV System 1 & Claude 3.5 Sonnet)

Sistema simplificado e focado exatamente no escopo contratado: **Orçamento Industrial + Chatbot com Registro de Conversas e Histórico**.

---

## 1. Módulos do Sistema

### 1. Aba "Orçamento" (Fiel ao modelo.html)
- **Dados do Orçamento**: Nº, Data, Cliente, Telefone, Endereço e Descrição do serviço/peça.
- **Preencher com IA a partir de Foto, Desenho ou PDF**:
  - Anexar imagens/PDFs de peças e projetos mecânicos.
  - Botão **✨ Analisar e sugerir itens**: Aciona a triagem do JEV (System One) e cálculo no Claude 3.5 Sonnet via OpenRouter, gerando insumos e operações com passo a passo.
  - Observações para a IA (tolerâncias, materiais especiais, pintura, prazo).
- **Insumos do Orçamento**: Tabela dinâmica com catálogo inteligente, quantidades, preços e totalizador.
- **Operações / Horas Máquina**: Tabela dinâmica com máquinas do catálogo, passo a passo técnico sequencial, regimes (Normal, +50%, +100%), valor/hora e mão de obra de escritório.
- **Frete & Parcelamento**: Cálculo automático de frete ida/volta e juros a prazo.
- **Resultado Azul & Carimbo**:
  - Insumos c/ BDI Nardelli (`custo / (1 - (despFixas + imposto + lucro))`)
  - Mão de obra c/ BDI Nardelli
  - Total com margem de desconto e preço a prazo
  - Carimbo girado `-2deg` com o valor total final
  - Botões: **💾 Salvar orçamento**, **🖨 Imprimir / PDF** e **Novo orçamento em branco**.

### 2. Aba "Chatbot & Conversas" (Registro de Conversas)
- **Histórico de Conversas**: Lista lateral de conversas iniciadas pelos clientes via WhatsApp ou Web.
- **Janela de Diálogo**: Exibe os balões de mensagens trocadas com o cliente, anexos e fotos enviadas.
- **Ação Direta**: Botão **✨ Gerar Orçamento desta Conversa** (transforma o pedido do cliente em orçamento na aba principal para revisão do técnico).
- **Simulador / Testador de Mensagens**: Campo no rodapé para simular o cliente falando com o bot em tempo real.

### 3. Aba "Histórico" (Orçamentos Salvos)
- Listagem dos orçamentos gerados tanto pelo preenchimento manual quanto pelo chatbot.
- Identificação clara de origem: **Manual** ou **Chatbot**.
- Ações: **Abrir** no formulário para editar ou imprimir, e **Excluir**.

### 4. Abas "Insumos" e "Máquinas"
- Catálogos oficiais da Nardelli (37 insumos e 20 máquinas) com edição inline e botão de salvar.

### 5. Aba "Configurações"
- Dados da empresa (Nardelli Usinagem, Aracaju/SE).
- Margens de BDI e juros.
- Configuração de IA via OpenRouter (chave de API, modelo Claude 3.5 Sonnet e JEV System One).

---

## 2. Rota de Integração do Chatbot (Inbound Webhook)

- **Endpoint:** `POST /api/inbound/chatbot`
- **Exemplo de Payload:**
```json
{
  "cliente": {
    "nome": "Cerâmica Sergipe S/A",
    "telefone": "(79) 99188-4455"
  },
  "descricao": "Fabricação de eixo motriz Ø65x480mm em aço 1045 com rasgo de chaveta 18mm",
  "origem": "whatsapp_bot",
  "processarComIA": true
}
```
Ao receber a chamada:
1. Registra a conversa no histórico da aba **Chatbot & Conversas**.
2. Cria o orçamento na aba **Histórico** como `PENDENTE_REVISAO` / `Chatbot`.
3. Pré-calcula os insumos e horas via IA para validação do orçamentista.

---

## 3. Configuração da Chave da API OpenRouter

Você pode configurar sua chave de API de duas maneiras:
1. **Via arquivo `.env`**: Adicione sua chave no arquivo [.env](file:///mnt/6a747622-a621-4ff8-bf44-b748e9d71b30/Projetos/sistemas/orcamento-ia/nardelli/orçamento/.env) na raiz do projeto:
   ```env
   OPENROUTER_API_KEY=sua_chave_aqui
   ```
2. **Pela Interface Web**: No navegador, acesse a aba **Configurações** e insira a chave no campo **Chave de API OpenRouter**.

---

## 4. Como Executar

### Opção A: Via Docker / Docker Compose (Recomendado para Produção / Servidor)

O projeto está totalmente dockerizado com persistência de dados e uploads:

```bash
# 1. Copie o arquivo de variáveis de ambiente (caso ainda não exista)
cp .env.example .env

# 2. Construa a imagem e inicie o container em segundo plano
docker compose up -d --build

# 3. Acompanhar os logs
docker compose logs -f

# 4. Parar a aplicação
docker compose down
```

> **Acesso:** `http://localhost:3005` (ou o IP/domínio do seu servidor)  
> **Persistência:** A pasta `./data` é montada como volume no container, preservando clientes, orçamentos e arquivos anexados.

---

### Opção B: Execução Local com Node.js (v20+)

```bash
# Instalar dependências
npm install

# Iniciar o servidor
npm start

# Modo desenvolvimento (com auto-reload)
npm run dev
```

---

## 5. Dados de Demonstração (Mock Industrial)

O sistema vem pré-populado com dados realistas da indústria de Sergipe para apresentação ao cliente:
- **Pedidos em Aberto (Funil Comercial):**
  - **Novo (#0002):** Usina Taquari S/A (Eixo de transmissão de moenda Ø180x2400mm)
  - **Em Elaboração (#0003):** Indústrias Alimentícias Maratá (Polias escalonadas em alumínio naval)
  - **Enviado ao Cliente (#0004):** Cimento Itaguassu / Nassau (Flanges de alta pressão em Inox 316L)
  - **Ajuste Solicitado (#0001):** Cervejaria Serigy (Engrenagem cônica - prazo emergencial)
- **Histórico Concluído:**
  - **Aprovado (#0005):** Terminal Marítimo Inácio Barbosa / Tecarmo (Recuperação de mancal)
  - **Aprovado (#0006):** Unigel Agro Sergipe (Buchas de bronze autolubrificantes TM-23)
  - **Recusado (#0007):** Mineração Sergipe Norte (Chapas de desgaste Hardox 450)
- **Base de Clientes Cadastrados:** 7 empresas industriais completas com CNPJs, contatos e endereços.
- **Testes com Dados Reais:** Novos orçamentos são criados a partir do número `#0008` sem sobrescrever o histórico, permitindo que o cliente crie, edite e calcule propostas reais livremente.

