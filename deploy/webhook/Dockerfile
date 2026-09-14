# webhook 监听服务镜像:Node 20 + git/ssh/docker CLI(经挂载的 docker.sock 操作宿主机容器)
FROM node:20-alpine
RUN apk add --no-cache git openssh-client docker-cli docker-cli-compose curl
WORKDIR /app
COPY server.js deploy.sh ./
RUN chmod +x deploy.sh
EXPOSE 9000
CMD ["node", "server.js"]
