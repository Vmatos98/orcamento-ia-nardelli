# ==============================================================
# Nardelli Usinagem — Dashboard de Orçamentos com IA
# Dockerfile Multiplataforma (Produção)
# ==============================================================
FROM node:20-alpine

# Fuso horário oficial do Brasil (Nordeste / Aracaju - GMT-3)
RUN apk add --no-cache tzdata
ENV TZ=America/Maceio

# Diretório da aplicação
WORKDIR /app

# Otimização de camadas de cache Docker: copia dependências primeiro
COPY package*.json ./

# Instala apenas dependências de produção para manter a imagem leve e segura
RUN npm ci --omit=dev

# Copia o código-fonte da aplicação
COPY . .

# Garante que os diretórios de dados persistentes e uploads existam
RUN mkdir -p /app/data/uploads

# Porta da aplicação (padrão: 3005)
EXPOSE 3005

# Variáveis de ambiente padrão para execução em produção
ENV PORT=3005 \
    NODE_ENV=production

# Inicialização do servidor Node.js
CMD ["node", "server.js"]
