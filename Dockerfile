# Use a lightweight Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy root and subproject package files to optimize dependency caching
COPY package.json ./
COPY telegram-bot/package.json ./telegram-bot/
COPY admin-dashboard/package.json ./admin-dashboard/

# Install dependencies for both project services
RUN npm install && \
    cd telegram-bot && npm install && \
    cd ../admin-dashboard && npm install

# Copy the rest of the application files
COPY . .

# Expose port 8001 (Admin Dashboard & Mini App Subdomain Placeholder)
EXPOSE 8001

# Launch the process manager to execute both bot and dashboard
CMD ["node", "start.js"]
