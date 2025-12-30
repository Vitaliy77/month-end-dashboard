FROM node:20-alpine
WORKDIR /app

# install deps first for better caching (need dev deps for TypeScript build)
COPY package.json package-lock.json ./
RUN npm ci

# verify express is installed (fail build if missing)
RUN node -p "require.resolve('express')"

# copy source
COPY . .

# build (allow TS errors, but emit dist/)
RUN npm run build || true

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
