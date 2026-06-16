FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html suites.html executions.html styles.css app.js api.js config.js dom.js utils.js /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY docker-entrypoint.sh /docker-entrypoint.d/40-generate-env-js.sh

RUN chmod +x /docker-entrypoint.d/40-generate-env-js.sh

EXPOSE 80
