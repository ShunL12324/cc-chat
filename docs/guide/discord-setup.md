# Discord Bot Setup

Follow these steps to create and configure your Discord bot.

## Create Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**
3. Enter a name (e.g., "cc-chat") and create

## Configure Bot

1. Navigate to **Bot** in the sidebar
2. Click **Reset Token** and copy the token (save it for later)
3. Under **Privileged Gateway Intents**, enable:
   - **Message Content Intent** ✅

## Generate Invite URL

1. Navigate to **OAuth2 > URL Generator**
2. Select scopes:
   - `bot`
   - `applications.commands`
3. Select bot permissions:
   - Send Messages
   - Create Public Threads
   - Send Messages in Threads
   - Manage Threads
   - Read Message History
4. Copy the generated URL and open it in your browser
5. Select your server and authorize

## Get IDs

You'll need these for configuration:

- **Client ID**: Found in OAuth2 > General
- **Guild ID**: Right-click your server (with Developer Mode enabled) > Copy Server ID

::: tip Enable Developer Mode
Settings > Advanced > Developer Mode
:::
