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

RUN openssl req -x509 -nodes -days 90 \
	-subj "/C=UK/ST=London/O=Alfred/CN=alfred_commute_service" \
	-addext "subjectAltName=DNS:alfred_commute_service" \
	-newkey rsa:2048 \
	-keyout certs/server.key \
	-out certs/server.crt

USER node

HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3978