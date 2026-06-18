FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html suites.html executions.html styles.css app.js api.js caseBrowser.js caseDetails.js checklists.js config.js csvImport.js dom.js executions.js reports.js suites.js testCaseActions.js testCaseForm.js treeUi.js utils.js /usr/share/nginx/html/
COPY styles /usr/share/nginx/html/styles
COPY assets /usr/share/nginx/html/assets
COPY docker-entrypoint.sh /docker-entrypoint.d/40-generate-env-js.sh

RUN chmod +x /docker-entrypoint.d/40-generate-env-js.sh

EXPOSE 80
