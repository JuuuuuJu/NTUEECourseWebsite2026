FROM node:14-alpine

# setup working directory
WORKDIR /app

RUN npm i serve -g

# install node_modules in the container
COPY ["package.json", "./"]
RUN npm install

# build flags previously read from the copied .env (now excluded by .dockerignore)
ENV DISABLE_ESLINT_PLUGIN=true ESLINT_NO_DEV_ERRORS=true SKIP_PREFLIGHT_CHECK=true

# copy everything to /app
COPY . .

# react-scripts run on port 3000
EXPOSE 3000

# startup command
# RUN npm run build
RUN npm run build
CMD ["serve", "-s", "build", "-l", "3000"]
