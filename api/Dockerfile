FROM node:20-alpine
WORKDIR /app

# install deps first for better caching (need dev deps for TypeScript build)
COPY package.json package-lock.json ./
RUN npm ci

# verify express is installed (fail build if missing)
RUN node -p "require.resolve('express')"

# copy source
COPY . .

# build
RUN npm run build

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
