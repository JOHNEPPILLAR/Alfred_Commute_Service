FROM node:13-alpine

RUN ln -snf /usr/share/zoneinfo/Europe/London /etc/localtime && echo Europe/London > /etc/timezone \
	&& mkdir -p /home/nodejs/app \
	&& apk --no-cache --virtual build-dependencies add \
	openssl \
	git \ 
	g++ \
	gcc \
	libgcc \
	libstdc++ \
	linux-headers \
	make \
	python \
	&& npm install --quiet node-gyp -g \
	&& rm -rf /var/cache/apk/*

WORKDIR /home/nodejs/app

COPY package*.json ./

RUN npm install

COPY --chown=node:node . .

RUN openssl genrsa -des3 -passout pass:qwerty -out /home/nodejs/app/certs/server.pass.key 2048
RUN openssl rsa -passin pass:qwerty -in /home/nodejs/app/certs/server.pass.key -out /home/nodejs/app/certs/server.key
RUN rm /home/nodejs/app/certs/server.pass.key
RUN openssl req -new -key /home/nodejs/app/certs/server.key -out /home/nodejs/app/certs/server.csr -subj "/C=UK/ST=London/L=London/O=Alfred/OU=Alfred/CN=alfred_commute_service" 
RUN openssl x509 -req -days 90 -in /home/nodejs/app/certs/server.csr -signkey /home/nodejs/app/certs/server.key -out /home/nodejs/app/certs/server.crt

USER node

HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3978